import { PWA_CONFIG } from "./pwa-config";

/**
 * Whether the game can start without a network: not yet known, yes (the active service worker holds a whole
 * release), or no (it could not be stored; the game still works online).
 */
type OfflineReadiness = "preparing" | "ready" | "unavailable";

/**
 * Why the game cannot start without a network, as far as the page can tell: the browser refused to register the
 * worker, the first install of the release failed (the worker does not say why: no network or no room), the
 * active worker did not answer in time, or it answered that a file of its release is missing from its cache.
 */
export type UnavailableCause = "registration-refused" | "install-failed" | "no-answer" | "incomplete";

interface Unavailable {
  cause: UnavailableCause;
  /** The name and message of the error behind it, for the diagnostics only; null when there was none. */
  detail: string | null;
}

export interface OfflineState {
  readiness: OfflineReadiness;
  /** Why the readiness is "unavailable"; null otherwise. */
  unavailable: Unavailable | null;
  /** A newer release is stored and takes over once every window of the game has been closed. */
  updateWaiting: boolean;
  /** The version of the game in that release, once its worker has told it; null before, or from an older worker. */
  updateVersion: string | null;
  /** A release has taken over from another window while this page still runs the code it started with. */
  updatedElsewhere: boolean;
  /** How many newer releases could not be stored while this page was open. */
  updateFailures: number;
}

/**
 * "update-active": the release that was waiting has taken over, so there is nothing left to wait for.
 * "update-elsewhere": it was installed from another window, and this page needs a reload to use it.
 * "update-failed": a newer release could not be stored; the running one stays. An
 * "update-version" names the version of the waiting release.
 */
export type OfflineEvent =
  | "ready"
  | ({ type: "unavailable" } & Unavailable)
  | "update-waiting"
  | "update-active"
  | "update-elsewhere"
  | "update-failed"
  | { type: "update-version"; version: string };

export const INITIAL_OFFLINE_STATE: OfflineState = {
  readiness: "preparing",
  unavailable: null,
  updateWaiting: false,
  updateVersion: null,
  updatedElsewhere: false,
  updateFailures: 0,
};

export function reduceOffline(state: OfflineState, event: OfflineEvent): OfflineState {
  if (typeof event === "object" && event.type === "unavailable") {
    return { ...state, readiness: "unavailable", unavailable: { cause: event.cause, detail: event.detail } };
  }
  if (typeof event === "object") return { ...state, updateVersion: event.version };
  if (event === "update-waiting") return { ...state, updateWaiting: true };
  if (event === "update-failed") return { ...state, updateFailures: state.updateFailures + 1 };
  if (event === "update-elsewhere") return { ...state, updatedElsewhere: true };
  if (event === "update-active") return { ...state, updateWaiting: false, updateVersion: null };
  return { ...state, readiness: "ready", unavailable: null };
}

/** The name and message of an error, for the diagnostics; null for anything that is not an error. */
export function errorDetail(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const name: unknown = Reflect.get(error, "name");
  const message: unknown = Reflect.get(error, "message");
  if (typeof name !== "string" || typeof message !== "string") return null;
  return message === "" ? name : `${name}: ${message}`;
}

/** Whether enough time has passed since the last readiness check to check again on the player's return. */
export function readinessRetryDue(nowMs: number, lastRetryMs: number): boolean {
  return nowMs - lastRetryMs >= PWA_CONFIG.READINESS_RETRY_MIN_INTERVAL_S * 1000;
}

/** What a readiness check the player asked for ended with. */
export type ReadinessOutcome = "ready" | "unavailable";

/** The check the player asked for: not asked yet, running, or what it found. Presses while it runs change nothing. */
export type ReadinessRetryState = "idle" | "checking" | ReadinessOutcome;

export function reduceReadinessRetry(
  state: ReadinessRetryState,
  event: "start" | ReadinessOutcome,
): ReadinessRetryState {
  if (event === "start") return "checking";
  return state === "checking" ? event : state;
}

/** What has to hold for the page to register a service worker at all. */
export interface OfflineConditions {
  /** A production build; the development server never registers one. */
  production: boolean;
  /** HTTPS or localhost. */
  secureContext: boolean;
  /** The browser has service workers. */
  supported: boolean;
  /** The page carries the marker of the regular build (not the single-file page). */
  marked: boolean;
}

export function offlineSupportWanted(conditions: OfflineConditions): boolean {
  return conditions.production && conditions.secureContext && conditions.supported && conditions.marked;
}

/** Whether enough time has passed since the last check for a new release. */
export function updateCheckDue(nowMs: number, lastCheckMs: number): boolean {
  return nowMs - lastCheckMs >= PWA_CONFIG.UPDATE_CHECK_MIN_INTERVAL_S * 1000;
}

/**
 * What a check for a new release on demand found: nothing newer, a newer release (being stored or waiting), the
 * first release still being stored (nothing to compare with yet), no answer from the server, or no worker at all.
 */
export type UpdateCheckOutcome = "latest" | "found" | "saving" | "unreachable" | "unavailable";

/** The check the player asked for: not asked yet, running, or what it found. */
export type UpdateCheckState = "idle" | "checking" | UpdateCheckOutcome;

/** A press while a check runs changes nothing, so repeated presses make one check; an answer ends a check. */
export function reduceUpdateCheck(state: UpdateCheckState, event: "start" | UpdateCheckOutcome): UpdateCheckState {
  if (event === "start") return "checking";
  return state === "checking" ? event : state;
}
