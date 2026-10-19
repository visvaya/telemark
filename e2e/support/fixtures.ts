import { test as base, expect } from "@playwright/test";

/** What a test needs to know about the device profile it runs on. */
export interface DeviceTraits {
  /** Name of the Playwright project, for the tests that run on named projects only. */
  project: string;
  /** Mouse and keyboard, no touch zones. */
  desktop: boolean;
  /** A coarse pointer: the game shows its touch zones and the pause button. */
  touch: boolean;
  landscape: boolean;
}

interface Fixtures {
  traits: DeviceTraits;
  /** Uncaught page errors and console errors seen so far; any unexpected one fails the test when it ends. */
  pageProblems: string[];
}

/**
 * The motion sensor a test's browser has: none (the default, so a touch screen leans with the finger as most
 * tests expect), one that reads steadily, one that gives no readings, or one that asks the player first and
 * then gives it or refuses it (as on an iPhone; the first request, made without a tap, is always refused).
 */
type MotionSensor = "none" | "steady" | "silent" | "asks-grant" | "asks-deny";

interface Options {
  motionSensor: MotionSensor;
  /**
   * The problems a test causes on purpose, as one pattern of their messages: the error the browser logs for a
   * script that is not there, for example. Set with `test.use` on the tests that break something, never wider.
   */
  expectedProblems: RegExp | null;
}

/**
 * The local mode runs a real browser without a window, and such a browser can still take the mouse of the
 * machine when the game captures it for a jump: the cursor of whoever is working there freezes. In that mode the
 * capture is refused in the page, which the game allows for (it plays without it). The runner has no cursor
 * to take, so the capture is left alone there.
 */
const REFUSE_MOUSE_CAPTURE = Boolean(process.env["BROWSER_TESTS_EDGE"]);

/** Runs in the page before its scripts: replaces the browser's motion sensor with the one the test asks for. */
function fakeMotionSensor(kind: MotionSensor): void {
  if (kind === "none") {
    Reflect.deleteProperty(window, "DeviceOrientationEvent");
    Object.defineProperty(window, "DeviceOrientationEvent", { value: undefined, configurable: true });
    return;
  }
  const sensor = function DeviceOrientationEvent() {};
  if (kind === "asks-grant" || kind === "asks-deny") {
    let asked = 0;
    Object.defineProperty(sensor, "requestPermission", {
      value: () => {
        asked++;
        if (asked === 1) return Promise.reject(new DOMException("Needs a tap", "NotAllowedError"));
        return Promise.resolve(kind === "asks-grant" ? "granted" : "denied");
      },
    });
  }
  Object.defineProperty(window, "DeviceOrientationEvent", { value: sensor, configurable: true });
  if (kind === "silent") return;
  setInterval(() => {
    window.dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 0, beta: 30, gamma: 0 }));
  }, 50);
}

/** How long the page may take to move the focus on its own (a new screen focuses its target in an effect). */
const FOCUS_SETTLE_MS = 300;

/**
 * Runs in the page before its scripts: reports, as a console error the test then fails on, a focus lost to the
 * page's body because the element holding it was removed or hidden (a button replaced by a question, a panel
 * closed) and nothing took the focus within `FOCUS_SETTLE_MS`. A click on the background, which moves the focus to
 * the body on purpose, leaves its element in place and is not reported.
 */
function watchFocusLoss(settleMs: number): void {
  let last: Element | null = null;
  let pending = false;
  const gone = (el: Element) => !el.isConnected || el.getClientRects().length === 0;
  const describe = (el: Element) =>
    `<${el.tagName.toLowerCase()}> "${(el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 40)}"`;
  const check = () => {
    const lost = last;
    if (pending || lost === null || !gone(lost)) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      const active = document.activeElement;
      if (last === lost && (active === null || active === document.body)) {
        // oxlint-disable-next-line no-console -- the test's watch on console errors turns this into a failure
        console.error(`focus lost: ${describe(lost)} was removed or hidden while it had the focus`);
        last = null;
      }
    }, settleMs);
  };
  document.addEventListener("focusin", (e) => {
    last = e.target instanceof Element && e.target !== document.body ? e.target : null;
  });
  // Mouse presses on the background move the focus to the body on purpose: forget the element then.
  document.addEventListener("pointerdown", () => {
    if (last !== null && !gone(last)) setTimeout(() => (last = document.activeElement === document.body ? null : last));
  });
  new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true });
}

export const test = base.extend<Fixtures & Options>({
  expectedProblems: [null, { option: true }],
  motionSensor: ["none", { option: true }],
  context: async ({ context, motionSensor }, provide) => {
    await context.addInitScript(fakeMotionSensor, motionSensor);
    await context.addInitScript(watchFocusLoss, FOCUS_SETTLE_MS);
    if (REFUSE_MOUSE_CAPTURE) {
      await context.addInitScript(() => {
        Element.prototype.requestPointerLock = () =>
          Promise.reject(new DOMException("The mouse is not captured in local tests", "NotSupportedError"));
      });
    }
    await provide(context);
  },
  traits: async ({ hasTouch, viewport }, provide, testInfo) => {
    await provide({
      project: testInfo.project.name,
      desktop: !hasTouch,
      touch: hasTouch,
      landscape: viewport !== null && viewport.width > viewport.height,
    });
  },
  // Every page of the test's browser context is watched, so a test that opens a second window is covered too.
  // Nothing is allowed by default: the game logs no errors of its own, and an error on any screen is a defect.
  pageProblems: [
    async ({ context, expectedProblems }, provide) => {
      const problems: string[] = [];
      context.on("weberror", (webError) => problems.push(`page error: ${webError.error().message}`));
      context.on("console", (message) => {
        if (message.type() === "error") problems.push(`console error: ${message.text()}`);
      });
      await provide(problems);
      const unexpected = problems.filter((problem) => expectedProblems?.test(problem) !== true);
      expect(unexpected, "page errors and console errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
