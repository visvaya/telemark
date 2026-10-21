import { describe, expect, it } from "vitest";
import {
  INITIAL_OFFLINE_STATE,
  offlineSupportWanted,
  errorDetail,
  readinessRetryDue,
  reduceOffline,
  reduceReadinessRetry,
  reduceUpdateCheck,
  updateCheckDue,
} from "./offline-state";
import { PWA_CONFIG } from "./pwa-config";

describe("reduceOffline", () => {
  it("starts without a promise of playing offline", () => {
    expect(INITIAL_OFFLINE_STATE).toEqual({
      readiness: "preparing",
      unavailable: null,
      updateWaiting: false,
      updateVersion: null,
      updatedElsewhere: false,
      updateFailures: 0,
    });
  });

  it("becomes ready, or unavailable, and keeps a waiting update through both", () => {
    const waiting = reduceOffline(INITIAL_OFFLINE_STATE, "update-waiting");
    expect(waiting).toMatchObject({ readiness: "preparing", updateWaiting: true, updateVersion: null });
    expect(reduceOffline(waiting, "ready")).toMatchObject({
      readiness: "ready",
      updateWaiting: true,
      updateVersion: null,
    });
    expect(reduceOffline(waiting, { type: "unavailable", cause: "incomplete", detail: null })).toMatchObject({
      readiness: "unavailable",
      updateWaiting: true,
    });
  });

  it("names the version of the waiting update, and forgets both once that release has taken over", () => {
    const named = reduceOffline(
      { ...INITIAL_OFFLINE_STATE, readiness: "ready", updateWaiting: true },
      { type: "update-version", version: "0.10.0" },
    );
    expect(named).toMatchObject({ readiness: "ready", updateWaiting: true, updateVersion: "0.10.0" });
    expect(reduceOffline(named, "update-active")).toMatchObject({
      readiness: "ready",
      updateWaiting: false,
      updateVersion: null,
    });
  });

  it("returns a new state and leaves the one it was given", () => {
    const before = { ...INITIAL_OFFLINE_STATE };
    const after = reduceOffline(INITIAL_OFFLINE_STATE, "ready");
    expect(after).not.toBe(INITIAL_OFFLINE_STATE);
    expect(INITIAL_OFFLINE_STATE).toEqual(before);
  });
});

describe("offlineSupportWanted", () => {
  const all = { production: true, secureContext: true, supported: true, marked: true };

  it("wants a service worker only when every condition holds", () => {
    expect(offlineSupportWanted(all)).toBe(true);
    expect(offlineSupportWanted({ ...all, production: false })).toBe(false);
    expect(offlineSupportWanted({ ...all, secureContext: false })).toBe(false);
    expect(offlineSupportWanted({ ...all, supported: false })).toBe(false);
  });

  it("does not want one on a page without the marker, even under HTTPS", () => {
    expect(offlineSupportWanted({ ...all, marked: false })).toBe(false);
  });
});

describe("updateCheckDue", () => {
  const intervalMs = PWA_CONFIG.UPDATE_CHECK_MIN_INTERVAL_S * 1000;

  it("is due once the interval has passed, not before", () => {
    expect(updateCheckDue(1000 + intervalMs - 1, 1000)).toBe(false);
    expect(updateCheckDue(1000 + intervalMs, 1000)).toBe(true);
  });
});

describe("a release installed in another window", () => {
  it("is remembered, and nothing waits any more", () => {
    const waiting = reduceOffline(INITIAL_OFFLINE_STATE, "update-waiting");
    const elsewhere = reduceOffline(reduceOffline(waiting, "update-active"), "update-elsewhere");
    expect(elsewhere).toMatchObject({ updateWaiting: false, updatedElsewhere: true });
  });
});

describe("a release that could not be stored", () => {
  it("is counted, so a check can tell a failure that came after it", () => {
    const once = reduceOffline(INITIAL_OFFLINE_STATE, "update-failed");
    expect(reduceOffline(once, "update-failed").updateFailures).toBe(2);
    expect(once).toMatchObject({ readiness: "preparing", updateWaiting: false });
  });
});

describe("reduceUpdateCheck", () => {
  it("checks, then says what the check found", () => {
    const checking = reduceUpdateCheck("idle", "start");
    expect(checking).toBe("checking");
    expect(reduceUpdateCheck(checking, "latest")).toBe("latest");
    expect(reduceUpdateCheck(checking, "found")).toBe("found");
    expect(reduceUpdateCheck(checking, "unreachable")).toBe("unreachable");
  });

  it("starts again after an answer", () => {
    expect(reduceUpdateCheck("latest", "start")).toBe("checking");
    expect(reduceUpdateCheck("unreachable", "start")).toBe("checking");
  });

  it("ignores a press while a check runs, and an answer nobody waits for", () => {
    expect(reduceUpdateCheck("checking", "start")).toBe("checking");
    expect(reduceUpdateCheck("idle", "found")).toBe("idle");
    expect(reduceUpdateCheck("latest", "found")).toBe("latest");
  });
});

describe("the cause of not being ready", () => {
  it("is kept with the state, and forgotten once the game is ready", () => {
    const failed = reduceOffline(INITIAL_OFFLINE_STATE, {
      type: "unavailable",
      cause: "registration-refused",
      detail: "SecurityError: denied",
    });
    expect(failed).toMatchObject({
      readiness: "unavailable",
      unavailable: { cause: "registration-refused", detail: "SecurityError: denied" },
    });
    expect(reduceOffline(failed, "ready")).toMatchObject({ readiness: "ready", unavailable: null });
  });

  it("names an error by its name and message, and nothing else", () => {
    expect(errorDetail(new DOMException("quota", "QuotaExceededError"))).toBe("QuotaExceededError: quota");
    expect(errorDetail(new TypeError(""))).toBe("TypeError");
    expect(errorDetail("text")).toBeNull();
    expect(errorDetail(null)).toBeNull();
  });
});

describe("readinessRetryDue", () => {
  it("allows a check again only after the interval", () => {
    const intervalMs = PWA_CONFIG.READINESS_RETRY_MIN_INTERVAL_S * 1000;
    expect(readinessRetryDue(intervalMs - 1, 0)).toBe(false);
    expect(readinessRetryDue(intervalMs, 0)).toBe(true);
  });
});

describe("reduceReadinessRetry", () => {
  it("ignores presses while a check runs and takes its answer only then", () => {
    expect(reduceReadinessRetry("idle", "start")).toBe("checking");
    expect(reduceReadinessRetry("checking", "start")).toBe("checking");
    expect(reduceReadinessRetry("checking", "ready")).toBe("ready");
    expect(reduceReadinessRetry("idle", "unavailable")).toBe("idle");
  });
});
