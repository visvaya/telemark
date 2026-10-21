import { describe, expect, it } from "vitest";
import type { OfflineEvent } from "./offline-state";
import { PWA_CONFIG } from "./pwa-config";
import {
  startOfflineSupport,
  type OfflineSupport,
  versionIn,
  type OfflineEnvironment,
  type RegistrationLike,
} from "./service-worker-client";

interface FakeWorker {
  state: ServiceWorkerState;
  /** What the worker answers when asked whether it holds its whole release; null: no answer in time. */
  whole: boolean | null;
  /** The version of the game it names, when it is of a release that names one. */
  version: string | null;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
  become(state: ServiceWorkerState): void;
  /** How many listeners follow the worker. */
  followers(): number;
}

function fakeWorker(
  state: ServiceWorkerState,
  whole: boolean | null = true,
  version: string | null = null,
): FakeWorker {
  const listeners: (() => void)[] = [];
  const worker: FakeWorker = {
    state,
    whole,
    version,
    addEventListener: (_type, listener) => listeners.push(listener),
    removeEventListener: (_type, listener) => {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    become(next) {
      worker.state = next;
      for (const listener of listeners.slice()) listener();
    },
    followers: () => listeners.length,
  };
  return worker;
}

interface FakeRegistration extends RegistrationLike<FakeWorker> {
  installing: FakeWorker | null;
  waiting: FakeWorker | null;
  active: FakeWorker | null;
  updates: number;
  /** What the next check for a new release does; the network refuses it unless a test says otherwise. */
  onUpdate: () => Promise<unknown>;
  /** The browser has found a new worker and started to install it. */
  find(worker: FakeWorker): void;
  /** Moves a worker that is being installed up to the given state, as the browser does. */
  installTo(worker: FakeWorker, last: "installed" | "activated"): void;
}

function fakeRegistration(workers: Partial<Pick<FakeRegistration, "installing" | "waiting" | "active">>) {
  const listeners: (() => void)[] = [];
  const registration: FakeRegistration = {
    installing: null,
    waiting: null,
    active: null,
    ...workers,
    updates: 0,
    onUpdate: () => Promise.reject(new TypeError("no network")),
    addEventListener: (_type, listener) => listeners.push(listener),
    update() {
      registration.updates += 1;
      return registration.onUpdate();
    },
    find(worker) {
      registration.installing = worker;
      for (const listener of listeners) listener();
    },
    installTo(worker, last) {
      registration.installing = null;
      registration.waiting = worker;
      worker.become("installed");
      if (last === "installed") return;
      registration.waiting = null;
      registration.active = worker;
      worker.become("activating");
      worker.become("activated");
    },
  };
  return registration;
}

interface Setup {
  events: OfflineEvent[];
  support: OfflineSupport;
  stop: () => void;
  /** The workers the page asked to take over, in order. */
  askedToTakeOver: FakeWorker[];
  /** How many times the page reloaded itself. */
  reloads: () => number;
  /** The player comes back to the game. */
  comeBack: () => void;
  clock: { nowMs: number };
  listening: () => boolean;
}

function start(register: () => Promise<FakeRegistration>, controlled = false): Setup {
  const events: OfflineEvent[] = [];
  const clock = { nowMs: 0 };
  let returnListener: (() => void) | null = null;
  const askedToTakeOver: FakeWorker[] = [];
  let reloads = 0;
  const env: OfflineEnvironment<FakeWorker> = {
    register,
    holdsWholeRelease: (worker) => Promise.resolve(worker.whole),
    versionOf: (worker) => Promise.resolve(worker.version),
    onReturn(listener) {
      returnListener = listener;
      return () => {
        returnListener = null;
      };
    },
    nowMs: () => clock.nowMs,
    askToTakeOver: (worker) => askedToTakeOver.push(worker),
    controlled: () => controlled,
    reload: () => {
      reloads += 1;
    },
  };
  const support = startOfflineSupport(env, (event) => events.push(event));
  return {
    events,
    support,
    stop: support.stop,
    askedToTakeOver,
    reloads: () => reloads,
    comeBack: () => returnListener?.(),
    clock,
    listening: () => returnListener !== null,
  };
}

/** Lets the promises settled so far run their reactions. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe("startOfflineSupport", () => {
  it("promises nothing while the first worker installs, and is ready once it is active and whole", async () => {
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual([]);

    registration.installTo(worker, "activated");
    await settle();
    expect(events).toEqual(["update-active", "ready"]);
  });

  it("follows a first worker that is already stored and waiting when the page opens", async () => {
    const worker = fakeWorker("installed");
    const registration = fakeRegistration({ waiting: worker });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual([]);

    registration.waiting = null;
    registration.active = worker;
    worker.become("activating");
    worker.become("activated");
    await settle();
    expect(events).toEqual(["update-active", "ready"]);
  });

  it("takes back the notice of a waiting update when that release takes over at once", async () => {
    // A first visit: the page is not answered for by the active worker, so nothing makes the next one wait.
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    const next = fakeWorker("installing");
    registration.find(next);
    registration.installTo(next, "activated");
    await settle();
    expect(events).toEqual(["ready", "update-waiting", "update-active", "ready"]);
  });

  it("is unavailable when the first install fails", async () => {
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    registration.installing = null;
    worker.become("redundant");
    await settle();
    expect(events).toEqual([{ type: "unavailable", cause: "install-failed", detail: null }]);
  });

  it("is unavailable when registering is refused, and keeps the error for the diagnostics", async () => {
    const { events } = start(() => Promise.reject(new DOMException("denied", "SecurityError")));
    await settle();
    expect(events).toEqual([{ type: "unavailable", cause: "registration-refused", detail: "SecurityError: denied" }]);
  });

  it("is unavailable when the active worker does not answer in time", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated", null) });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual([{ type: "unavailable", cause: "no-answer", detail: null }]);
  });

  it("is ready at once on a later visit", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual(["ready"]);
  });

  it("is unavailable when the active worker has lost part of its release", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated", false) });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toEqual([{ type: "unavailable", cause: "incomplete", detail: null }]);
  });

  it("reports an update that was already waiting when the page opened", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting: fakeWorker("installed") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      "ready",
      "update-waiting",
    ]);
  });

  it("names the version of a waiting release that tells it", async () => {
    const waiting = fakeWorker("installed", true, "0.10.0");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    expect(events).toContainEqual({ type: "update-version", version: "0.10.0" });
  });

  it("reports an update found while the page is open, once it is stored and waiting", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    const next = fakeWorker("installing");
    registration.find(next);
    expect(events).toEqual(["ready"]);

    registration.installTo(next, "installed");
    expect(events).toEqual(["ready", "update-waiting"]);
  });

  it("stays ready when an update fails to install", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    const next = fakeWorker("installing");
    registration.find(next);
    registration.installing = null;
    next.become("redundant");
    await settle();
    // Still ready; the failure is told, so a check that found the release can say it was not stored.
    expect(events).toEqual(["ready", "update-failed"]);
  });

  it("does not count a waiting release that a newer one replaces as a failure", async () => {
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { events } = start(() => Promise.resolve(registration));
    await settle();
    waiting.become("redundant");
    expect(events).not.toContain("update-failed");
  });

  it("checks for a new release when the player comes back, but not more often than the interval", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { comeBack, clock } = start(() => Promise.resolve(registration));
    await settle();
    const intervalMs = PWA_CONFIG.UPDATE_CHECK_MIN_INTERVAL_S * 1000;

    comeBack();
    expect(registration.updates).toBe(0);
    clock.nowMs = intervalMs;
    comeBack();
    comeBack();
    expect(registration.updates).toBe(1);
    clock.nowMs = 2 * intervalMs;
    comeBack();
    expect(registration.updates).toBe(2);
    // The checks above were refused by the network; that must not surface as an unhandled rejection.
    await settle();
  });

  it("reports nothing and stops listening after it is stopped", async () => {
    const worker = fakeWorker("installing");
    const registration = fakeRegistration({ installing: worker });
    const { events, stop, listening } = start(() => Promise.resolve(registration));
    await settle();
    expect(listening()).toBe(true);
    stop();
    expect(listening()).toBe(false);
    registration.installTo(worker, "activated");
    await settle();
    expect(events).toEqual([]);
  });

  it("does not start listening when it was stopped before the registration arrived", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events, stop, listening } = start(() => Promise.resolve(registration));
    stop();
    await settle();
    expect(events).toEqual([]);
    expect(listening()).toBe(false);
  });
});

describe("checking for a new release on demand", () => {
  it("says the running release is the latest when the server has nothing new", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    registration.onUpdate = () => Promise.resolve(registration);
    const { support } = start(() => Promise.resolve(registration));
    expect(await support.checkNow()).toBe("latest");
    expect(registration.updates).toBe(1);
  });

  it("says a new release was found when the check starts storing one", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    registration.onUpdate = () => {
      registration.find(fakeWorker("installing"));
      return Promise.resolve(registration);
    };
    const { support } = start(() => Promise.resolve(registration));
    expect(await support.checkNow()).toBe("found");
  });

  it("says a new release was found when one is already waiting", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting: fakeWorker("installed") });
    registration.onUpdate = () => Promise.resolve(registration);
    const { support } = start(() => Promise.resolve(registration));
    expect(await support.checkNow()).toBe("found");
  });

  it("says the game is still being stored when the first release has not taken over yet", async () => {
    const registration = fakeRegistration({ installing: fakeWorker("installing") });
    registration.onUpdate = () => Promise.resolve(registration);
    const { support } = start(() => Promise.resolve(registration));
    expect(await support.checkNow()).toBe("saving");
  });

  it("says the server could not be reached when the check is refused", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { support } = start(() => Promise.resolve(registration));
    expect(await support.checkNow()).toBe("unreachable");
  });

  it("cannot check where the worker could not be registered", async () => {
    const { support } = start(() => Promise.reject(new Error("blocked")));
    expect(await support.checkNow()).toBe("unavailable");
  });

  it("counts a check on demand as the latest check, so coming back right after does not check again", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    registration.onUpdate = () => Promise.resolve(registration);
    const { support, comeBack, clock } = start(() => Promise.resolve(registration));
    clock.nowMs = PWA_CONFIG.UPDATE_CHECK_MIN_INTERVAL_S * 1000;
    await support.checkNow();
    comeBack();
    expect(registration.updates).toBe(1);
  });
});

const noFailure = (): void => undefined;

describe("installing a waiting release on demand", () => {
  it("says so when the waiting release is dropped instead of taking over, and can be asked again", async () => {
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { support, reloads } = start(() => Promise.resolve(registration));
    await settle();
    let failures = 0;
    expect(
      support.installNow(() => {
        failures += 1;
      }),
    ).toBe(true);
    waiting.become("redundant");
    expect(failures).toBe(1);
    expect(reloads()).toBe(0);

    const next = fakeWorker("installed");
    registration.waiting = next;
    expect(support.installNow(noFailure)).toBe(true);
    next.become("activated");
    expect(reloads()).toBe(1);
  });

  it("does not reload, and stops following the worker, once stopped after the press", async () => {
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { support, reloads, stop } = start(() => Promise.resolve(registration));
    await settle();
    const before = waiting.followers();
    support.installNow(noFailure);
    expect(waiting.followers()).toBe(before + 1);
    stop();
    expect(waiting.followers()).toBe(before);
    waiting.become("activated");
    expect(reloads()).toBe(0);
  });

  it("asks the waiting worker to take over and reloads the page once it is active", async () => {
    const active = fakeWorker("activated");
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active, waiting });
    const { support, askedToTakeOver, reloads } = start(() => Promise.resolve(registration));
    await settle();

    expect(support.installNow(noFailure)).toBe(true);
    expect(askedToTakeOver).toEqual([waiting]);
    expect(reloads()).toBe(0);
    waiting.become("activating");
    expect(reloads()).toBe(0);
    waiting.become("activated");
    expect(reloads()).toBe(1);
  });

  it("reloads only once, however often the player presses", async () => {
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { support, askedToTakeOver, reloads } = start(() => Promise.resolve(registration));
    await settle();
    support.installNow(noFailure);
    support.installNow(noFailure);
    expect(askedToTakeOver).toHaveLength(2);
    waiting.become("activated");
    waiting.become("activated");
    expect(reloads()).toBe(1);
  });

  it("does nothing when no release waits", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { support, askedToTakeOver } = start(() => Promise.resolve(registration));
    await settle();
    expect(support.installNow(noFailure)).toBe(false);
    expect(askedToTakeOver).toEqual([]);
  });

  it("never reloads a page whose player did not ask, when another window installs the release", async () => {
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { reloads, events } = start(() => Promise.resolve(registration), true);
    await settle();
    registration.waiting = null;
    registration.active = waiting;
    waiting.become("activating");
    waiting.become("activated");
    await settle();
    expect(reloads()).toBe(0);
    // That page still runs the release it started with, and is told so.
    expect(events).toContain("update-active");
    expect(events.at(-2)).toBe("update-elsewhere");
  });

  it("tells a page that another window installed a release found while it was open", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events } = start(() => Promise.resolve(registration), true);
    await settle();
    const next = fakeWorker("installing");
    registration.find(next);
    registration.installTo(next, "activated");
    await settle();
    expect(events).toContain("update-elsewhere");
  });

  it("does not tell the page that asked, nor a page no worker answered for", async () => {
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { support, events } = start(() => Promise.resolve(registration), true);
    await settle();
    support.installNow(noFailure);
    waiting.become("activated");
    await settle();
    expect(events).not.toContain("update-elsewhere");

    const uncontrolled = fakeRegistration({ active: fakeWorker("activated") });
    const other = start(() => Promise.resolve(uncontrolled), false);
    await settle();
    const next = fakeWorker("installing");
    uncontrolled.find(next);
    uncontrolled.installTo(next, "activated");
    await settle();
    expect(other.events).not.toContain("update-elsewhere");
  });

  it("reloads the page on demand", () => {
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { support, reloads } = start(() => Promise.resolve(registration));
    support.reloadNow();
    expect(reloads()).toBe(1);
  });

  it("does nothing after it is stopped", async () => {
    const waiting = fakeWorker("installed");
    const registration = fakeRegistration({ active: fakeWorker("activated"), waiting });
    const { support, askedToTakeOver, stop } = start(() => Promise.resolve(registration));
    await settle();
    stop();
    expect(support.installNow(noFailure)).toBe(false);
    expect(askedToTakeOver).toEqual([]);
  });
});

describe("versionIn", () => {
  it("reads a version from a worker's answer, and nothing else", () => {
    expect(versionIn({ type: "telemark:release", version: "0.10.0" })).toBe("0.10.0");
    expect(versionIn({ version: "1.0" })).toBeNull();
    expect(versionIn({ version: "<b>0.1.0</b>" })).toBeNull();
    expect(versionIn({})).toBeNull();
    expect(versionIn(null)).toBeNull();
  });
});

describe("retryReadiness", () => {
  it("asks the active worker again and reports what it says now", async () => {
    const active = fakeWorker("activated", null);
    const registration = fakeRegistration({ active });
    const { events, support } = start(() => Promise.resolve(registration));
    await settle();
    active.whole = true;
    expect(await support.retryReadiness()).toBe("ready");
    expect(events.at(-1)).toBe("ready");
  });

  it("makes one check of presses that come while it runs", async () => {
    const registration = fakeRegistration({ active: fakeWorker("activated", false) });
    const { events, support } = start(() => Promise.resolve(registration));
    await settle();
    const first = support.retryReadiness();
    expect(support.retryReadiness()).toBe(first);
    expect(await first).toBe("unavailable");
    expect(events).toHaveLength(2);
  });

  it("registers again when registering was refused", async () => {
    let attempts = 0;
    const registration = fakeRegistration({ active: fakeWorker("activated") });
    const { events, support } = start(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("blocked")) : Promise.resolve(registration);
    });
    await settle();
    expect(await support.retryReadiness()).toBe("ready");
    expect(attempts).toBe(2);
    expect(events.at(-1)).toBe("ready");
  });

  it("installs again after a failed first install, and waits for the result", async () => {
    const failed = fakeWorker("installing");
    const registration = fakeRegistration({ installing: failed });
    const { support } = start(() => Promise.resolve(registration));
    await settle();
    registration.installing = null;
    failed.become("redundant");
    const next = fakeWorker("installing");
    registration.onUpdate = () => {
      registration.find(next);
      return Promise.resolve(undefined);
    };
    const outcome = support.retryReadiness();
    await settle();
    registration.installTo(next, "activated");
    expect(await outcome).toBe("ready");
  });

  it("says the install failed when the browser cannot fetch the release again", async () => {
    const failed = fakeWorker("installing");
    const registration = fakeRegistration({ installing: failed });
    const { events, support } = start(() => Promise.resolve(registration));
    await settle();
    registration.installing = null;
    failed.become("redundant");
    expect(await support.retryReadiness()).toBe("unavailable");
    expect(events.at(-1)).toEqual({ type: "unavailable", cause: "install-failed", detail: "TypeError: no network" });
  });

  it("checks again on its own when the player comes back while not ready, but not more often than the interval", async () => {
    const active = fakeWorker("activated", null);
    const registration = fakeRegistration({ active });
    const { events, comeBack, clock } = start(() => Promise.resolve(registration));
    await settle();
    comeBack();
    await settle();
    expect(events).toHaveLength(1);
    clock.nowMs = PWA_CONFIG.READINESS_RETRY_MIN_INTERVAL_S * 1000;
    active.whole = true;
    comeBack();
    await settle();
    expect(events.at(-1)).toBe("ready");
    // Once ready, coming back looks for a new release instead.
    expect(registration.updates).toBe(0);
  });
});
