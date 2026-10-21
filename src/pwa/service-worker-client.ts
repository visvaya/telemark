import {
  errorDetail,
  readinessRetryDue,
  updateCheckDue,
  type OfflineEvent,
  type ReadinessOutcome,
  type UnavailableCause,
  type UpdateCheckOutcome,
} from "./offline-state";
import { PWA_CONFIG } from "./pwa-config";

/** The parts of a service worker, its registration and the browser that the page uses. */
export interface WorkerLike {
  readonly state: ServiceWorkerState;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export interface RegistrationLike<W extends WorkerLike> {
  readonly installing: W | null;
  readonly waiting: W | null;
  readonly active: W | null;
  addEventListener(type: "updatefound", listener: () => void): void;
  update(): Promise<unknown>;
}

export interface OfflineEnvironment<W extends WorkerLike> {
  register(): Promise<RegistrationLike<W>>;
  /** Asks a worker whether it holds every file of its release; null when it does not answer in time. */
  holdsWholeRelease(worker: W): Promise<boolean | null>;
  /** Asks a worker which version of the game its release is; null when it does not say. */
  versionOf(worker: W): Promise<string | null>;
  /** Calls the listener when the player comes back: the network returns or the page is shown again. */
  onReturn(listener: () => void): () => void;
  nowMs(): number;
  /** Whether a worker answers for this page. */
  controlled(): boolean;
  /** Asks a waiting worker to take over now. */
  askToTakeOver(worker: W): void;
  /** Loads the page again. */
  reload(): void;
}

/** What the page can do with the service worker once it has started following it. */
export interface OfflineSupport {
  /** Stops the reports. */
  stop: () => void;
  /** Looks for a new release now and says what was found. */
  checkNow: () => Promise<UpdateCheckOutcome>;
  /**
   * Checks again whether the game can start without a network: registers the worker again when that was
   * refused, asks the active worker again, or tries the first install again. A call while a check runs joins it.
   */
  retryReadiness: () => Promise<ReadinessOutcome>;
  /**
   * Asks the waiting release to take over and reloads this page once it has; false when no release waits.
   * `onFailed` is called when that release is dropped instead of taking over.
   * Only the page whose player asked reloads; other windows of the game are switched to the new worker and
   * keep running the code they started with.
   */
  installNow: (onFailed: () => void) => boolean;
  /** Loads the page again, to use a release installed from another window. */
  reloadNow: () => void;
}

/**
 * Registers the service worker and reports what follows, as events for `reduceOffline`.
 *
 * On its own the page never makes a waiting worker take over and never reloads itself: a newer release starts
 * with the next launch after every window of the game has been closed, so a jump is never interrupted. Only
 * `installNow`, which the menus offer, makes it take over sooner.
 */
export function startOfflineSupport<W extends WorkerLike>(
  env: OfflineEnvironment<W>,
  report: (event: OfflineEvent) => void,
): OfflineSupport {
  let stopped = false;
  let lastCheckMs = env.nowMs();
  let lastRetryMs = lastCheckMs;
  const readiness = readinessSignal();
  const emit = (event: OfflineEvent) => {
    if (stopped) return;
    readiness.note(event);
    report(event);
  };
  const unavailable = (cause: UnavailableCause, error?: unknown) =>
    emit({ type: "unavailable", cause, detail: errorDetail(error) });
  const tellVersion = (worker: W | null) => announceVersion(env, worker, emit);
  const confirm = (worker: W): Promise<ReadinessOutcome> => {
    const answered = readiness.next();
    void env.holdsWholeRelease(worker).then(
      (whole) => (whole === true ? emit("ready") : unavailable(whole === null ? "no-answer" : "incomplete")),
      (error: unknown) => unavailable("no-answer", error),
    );
    return answered;
  };

  // Workers that waited while an older one answered for this page, and the one this page asked to take over.
  const waitedWhileControlled = new Set<W>();
  let askedWorker: W | null = null;
  const noteWait = (worker: W) => {
    if (env.controlled()) waitedWhileControlled.add(worker);
  };

  /** Follows a worker that is installing or waiting, to its activation or its failure. */
  const follow = (registration: RegistrationLike<W>, worker: W) => {
    // A worker followed from before it was stored; one that was waiting already was stored.
    let stored = worker.state !== "installing";
    worker.addEventListener("statechange", () => {
      const active = registration.active;
      if (worker.state === "installed") stored = true;
      if (worker.state === "installed" && active !== null && active !== worker) {
        noteWait(worker);
        emit("update-waiting");
        tellVersion(worker);
      }
      if (worker.state === "activated") {
        // On a page no worker answers for (a first visit), a new release takes over at once.
        emit("update-active");
        // A page an older worker answered for runs that release's code until it is loaded again.
        if (waitedWhileControlled.has(worker) && askedWorker !== worker) emit("update-elsewhere");
        void confirm(worker);
      }
      // A first install that failed; a failed update leaves the active worker and its release as they were.
      if (worker.state === "redundant" && active === null) unavailable("install-failed");
      // A newer release that could not be stored. A waiting one that a still newer release replaces is not.
      if (worker.state === "redundant" && active !== null && !stored) emit("update-failed");
    });
  };

  const watch = (registration: RegistrationLike<W>) => {
    if (registration.active !== null) {
      if (registration.waiting !== null) {
        noteWait(registration.waiting);
        emit("update-waiting");
        tellVersion(registration.waiting);
      }
    }
    // A page opened while the first worker is stored but not yet active finds it waiting, not installing.
    const pending = registration.installing ?? registration.waiting;
    if (pending !== null) follow(registration, pending);
    registration.addEventListener("updatefound", () => {
      if (registration.installing !== null) follow(registration, registration.installing);
    });
  };

  let current: RegistrationLike<W> | null = null;
  /** Registers the worker and follows it; the promise is null when the browser refused. */
  const register = (): Promise<RegistrationLike<W> | null> =>
    env.register().then(
      (registration) => {
        if (stopped) return null;
        current = registration;
        watch(registration);
        return registration;
      },
      (error: unknown) => {
        unavailable("registration-refused", error);
        return null;
      },
    );
  let registered = register();
  void registered.then((registration) => {
    if (registration?.active) void confirm(registration.active);
  });

  const checks = { confirm, next: readiness.next, unavailable };
  const retryReadiness = singleFlight(async (): Promise<ReadinessOutcome> => {
    lastRetryMs = env.nowMs();
    // A refused registration is asked for again.
    const known = (await registered) ?? (await (registered = register()));
    return known === null ? "unavailable" : recheck(known, checks);
  });

  const stopListening = env.onReturn(() => {
    const nowMs = env.nowMs();
    if (readiness.last() === "unavailable") {
      if (readinessRetryDue(nowMs, lastRetryMs)) void retryReadiness();
    } else if (current !== null && updateCheckDue(nowMs, lastCheckMs)) {
      lastCheckMs = nowMs;
      // No network is an expected answer here, not an error.
      current.update().catch(() => undefined);
    }
  });

  const checkNow = async (): Promise<UpdateCheckOutcome> => {
    const registration = await registered;
    if (registration === null) return "unavailable";
    lastCheckMs = env.nowMs();
    return lookForRelease(registration);
  };

  const installer = startInstaller(env, {
    waiting: () => (stopped ? null : (current?.waiting ?? null)),
    asked: (worker) => {
      askedWorker = worker;
    },
  });

  return {
    stop: () => {
      stopped = true;
      stopListening();
      installer.stop();
    },
    checkNow,
    retryReadiness,
    installNow: installer.installNow,
    reloadNow: () => env.reload(),
  };
}

/** Asks a waiting worker which version of the game it holds; an older one does not say. */
function announceVersion<W extends WorkerLike>(
  env: Pick<OfflineEnvironment<W>, "versionOf">,
  worker: W | null,
  emit: (event: OfflineEvent) => void,
): void {
  if (worker === null) return;
  void env.versionOf(worker).then(
    (version) => {
      if (version !== null) emit({ type: "update-version", version });
    },
    () => undefined,
  );
}

/** Looks for a new release now and says what was found. */
async function lookForRelease<W extends WorkerLike>(registration: RegistrationLike<W>): Promise<UpdateCheckOutcome> {
  try {
    await registration.update();
  } catch {
    // The browser does not tell a missing network from a server that did not answer.
    return "unreachable";
  }
  const newer = registration.installing ?? registration.waiting;
  if (registration.active === null) return newer === null ? "latest" : "saving";
  return newer === null ? "latest" : "found";
}

/** The last answer about readiness, and the checks that wait for the next one. */
function readinessSignal() {
  let last: ReadinessOutcome | null = null;
  let waiters: readonly ((outcome: ReadinessOutcome) => void)[] = [];
  return {
    note(event: OfflineEvent) {
      const outcome =
        event === "ready" ? "ready" : typeof event === "object" && event.type === "unavailable" ? "unavailable" : null;
      if (outcome === null) return;
      last = outcome;
      const waiting = waiters;
      waiters = [];
      for (const resolve of waiting) resolve(outcome);
    },
    next: () =>
      new Promise<ReadinessOutcome>((resolve) => {
        waiters = [...waiters, resolve];
      }),
    last: () => last,
  };
}

/** A task that runs once at a time: a call while it runs gets the run under way. */
function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  const flight: { current: Promise<T> | null } = { current: null };
  return () => {
    if (flight.current !== null) return flight.current;
    const started = run().finally(() => {
      flight.current = null;
    });
    flight.current = started;
    return started;
  };
}

/** Asks again what a registration holds, and waits for the answer. */
async function recheck<W extends WorkerLike>(
  registration: RegistrationLike<W>,
  checks: {
    confirm: (worker: W) => Promise<ReadinessOutcome>;
    next: () => Promise<ReadinessOutcome>;
    unavailable: (cause: UnavailableCause, error?: unknown) => void;
  },
): Promise<ReadinessOutcome> {
  if (registration.active !== null) return checks.confirm(registration.active);
  const pending = () => registration.installing ?? registration.waiting;
  if (pending() !== null) return checks.next();
  // No worker at all after a failed first install: the browser installs the release again.
  try {
    await registration.update();
  } catch (error) {
    checks.unavailable("install-failed", error);
    return "unavailable";
  }
  if (pending() !== null) return checks.next();
  checks.unavailable("install-failed");
  return "unavailable";
}

/**
 * The install the player asks for: asks the waiting release to take over and reloads the page once it has.
 * `onFailed` is called when that release is dropped instead (a newer one replaced it); a later press can ask
 * again. `stop` forgets the worker, so a stopped page never reloads.
 */
function startInstaller<W extends WorkerLike>(
  env: Pick<OfflineEnvironment<W>, "askToTakeOver" | "reload">,
  page: { waiting: () => W | null; asked: (worker: W) => void },
): { installNow: (onFailed: () => void) => boolean; stop: () => void } {
  let reloading = false;
  let stopFollowing: (() => void) | null = null;
  const installNow = (onFailed: () => void): boolean => {
    const waiting = page.waiting();
    if (waiting === null) return false;
    stopFollowing?.();
    page.asked(waiting);
    // Followed by its own state, not by the page's controller: a page loaded past the worker (a forced
    // reload) has no controller to change, and is reloaded all the same.
    const onState = () => {
      if (waiting.state === "redundant") onFailed();
      if (waiting.state !== "activated" || reloading) return;
      reloading = true;
      env.reload();
    };
    waiting.addEventListener("statechange", onState);
    stopFollowing = () => {
      waiting.removeEventListener("statechange", onState);
      stopFollowing = null;
    };
    env.askToTakeOver(waiting);
    return true;
  };
  return { installNow, stop: () => stopFollowing?.() };
}

function saysComplete(data: unknown): boolean {
  return typeof data === "object" && data !== null && Reflect.get(data, "complete") === true;
}

/** The version a worker's answer names: a short text such as "0.10.0", or null. */
export function versionIn(data: unknown): string | null {
  const version: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "version") : null;
  return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version : null;
}

/** What a worker tells about its release; null when it does not answer in time. */
function askWorker(worker: ServiceWorker): Promise<unknown> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, PWA_CONFIG.RELEASE_ANSWER_TIMEOUT_S * 1000);
    channel.port1.addEventListener("message", (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    });
    channel.port1.start();
    worker.postMessage({ type: PWA_CONFIG.RELEASE_MESSAGE_TYPE }, [channel.port2]);
  });
}

/** The environment of a real page. */
export function browserOfflineEnvironment(container: ServiceWorkerContainer): OfflineEnvironment<ServiceWorker> {
  return {
    register: () =>
      container.register(PWA_CONFIG.SERVICE_WORKER_URL, {
        scope: PWA_CONFIG.SERVICE_WORKER_SCOPE,
        // The browser's own cache never answers for the worker's script.
        updateViaCache: "none",
      }),
    holdsWholeRelease: (worker) => askWorker(worker).then((data) => (data === null ? null : saysComplete(data))),
    versionOf: (worker) => askWorker(worker).then(versionIn),
    onReturn(listener) {
      const onVisibility = () => {
        if (!document.hidden) listener();
      };
      window.addEventListener("online", listener);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.removeEventListener("online", listener);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
    nowMs: () => performance.now(),
    controlled: () => container.controller !== null,
    askToTakeOver: (worker) => worker.postMessage({ type: PWA_CONFIG.TAKE_OVER_MESSAGE_TYPE }, []),
    reload: () => window.location.reload(),
  };
}
