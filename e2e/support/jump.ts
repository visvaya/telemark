import { errors, type Locator, type Page } from "@playwright/test";
import { announcement, button, jumpCanvas, openJumpControls, press, TEXT } from "./app";
import { expect, type DeviceTraits } from "./fixtures";
import { JUMP_TIMING } from "./jump-timing";

const STARTED = "Skok rozpoczęty.";
/** The last sentence of the announcement made once the jumper has stopped: in a competition the press goes on. */
const RESULT = /(jeszcze raz|dalej)\.$/;

const {
  TAKEOFF_LEAD_M,
  LANDING_AFTER_TAKEOFF_FRAMES,
  FRAMES_AFTER_RELEASE,
  TELEMARK_AFTER_LANDING_FRAMES,
  PRESS_HOLD_MS,
} = JUMP_TIMING;
/** A tap on the left zone starts the jump only once the gate opens, about a second in; until then it is repeated. */
const START_TAP_WAIT_MS = 200;
const START_TAP_LIMIT = 60;
const START_TIMEOUT_MS = 20_000;
const RESULT_TIMEOUT_MS = 40_000;
/**
 * The state of the jump is read on a timer, not on animation frames: a loaded machine draws few frames, and the
 * simulation goes on between them.
 */
const PROBE_POLL_MS = 10;
const PROBE_TIMEOUT_MS = 40_000;
/** Presses that start the next jump early: how many, and the wait after each. */
const EARLY_PRESS_LIMIT = 80;
const EARLY_PRESS_WAIT_MS = 100;

export interface JumpOutcome {
  kind: "landed" | "fell" | "disqualified";
  /** The distance as announced, with a decimal comma; null for a disqualification. */
  distance: string | null;
  announcement: string;
}

interface JumpOptions {
  /** Runs right after the jumper leaves the gate, during the inrun; the presses wait for where the jumper is. */
  afterStart?: () => Promise<void>;
}

export interface Point {
  x: number;
  y: number;
}

export async function centerOf(target: Locator): Promise<Point> {
  const box = await target.boundingBox();
  if (!box) throw new Error("The element has no box: it is not rendered");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function parseOutcome(text: string): JumpOutcome {
  const landed = /^Lądowanie: (\d+,\d{2}) metra\./.exec(text);
  if (landed) return { kind: "landed", distance: landed[1] ?? null, announcement: text };
  const fell = /^Upadek: (\d+,\d{2}) metra\./.exec(text);
  if (fell) return { kind: "fell", distance: fell[1] ?? null, announcement: text };
  if (text.startsWith("Dyskwalifikacja.")) return { kind: "disqualified", distance: null, announcement: text };
  throw new Error(`Not an announcement of a result: "${text}"`);
}

export const pageNow = (page: Page): Promise<number> => page.evaluate(() => performance.now());

/** What the page says right now, read at once rather than on an animation frame; null once it has left the jump. */
const saidNow = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.querySelector("p[aria-live]")?.textContent ?? null);

/** Whether what the page says tells how the jump ended (a landing, a fall, a disqualification) or the jump is left. */
const tellsTheEnd = (said: string | null): boolean => said === null || (said !== "" && said !== STARTED);

/**
 * Waits for the state of the jump (src/ui/jump-probe.ts) to reach `target`: the jumper `target` metres or less
 * before the edge of the takeoff, or the simulation at frame `target`. Returns the frame it was reached in, or
 * null once the page says the jump has ended: a press after that goes on to what comes next, so a jump that
 * ended early gets no more.
 */
async function probeUntil(page: Page, aim: "edge" | "frame", target: number): Promise<number | null> {
  const handle = await page.waitForFunction(
    ([kind, value, started]) => {
      const said = document.querySelector("p[aria-live]")?.textContent ?? null;
      if (said === null || (said !== "" && said !== started)) return { frame: null };
      const probe = window.telemarkJumpProbe;
      if (probe === undefined) return false;
      const reached = kind === "edge" ? probe.toEdgeM <= value : probe.frame >= value;
      return reached ? { frame: probe.frame } : false;
    },
    [aim, target, STARTED] as const,
    { polling: PROBE_POLL_MS, timeout: PROBE_TIMEOUT_MS },
  );
  const reached = await handle.jsonValue();
  return reached === false ? null : reached.frame;
}

/** The frame in which the jumper is close enough to the edge to take off, or null once the jump has ended. */
export const nearTheEdge = (page: Page): Promise<number | null> => probeUntil(page, "edge", TAKEOFF_LEAD_M);

/** The frame in which the test saw the simulation at `frame` or past it, or null once the jump has ended. */
export const whenReached = (page: Page, frame: number): Promise<number | null> => probeUntil(page, "frame", frame);

/** The frame the simulation is in now. */
export const frameNow = (page: Page): Promise<number> => page.evaluate(() => window.telemarkJumpProbe?.frame ?? -1);

interface Hands {
  takeoff: () => Promise<void>;
  /** Prepares the landing; when there is no `telemark`, it also puts the telemark down. */
  landing: () => Promise<void>;
  telemark?: () => Promise<void>;
}

/**
 * The presses after the start, as a player who watches the jumper: both buttons as the edge comes near, then the
 * landing, and the telemark when the hand presses it apart. The landing is counted in frames of the simulation from
 * the frame in which the test saw the moment of the takeoff, and the telemark from the frame in which it saw the
 * moment of the landing. The wait for the next moment starts only once a press has ended, so a slow press (WebKit
 * takes 130 to 250 ms for each step of the mouse) makes the next one late. Nothing more once the jump has ended.
 */
async function pressThroughJump(page: Page, hands: Hands): Promise<void> {
  const takeoffSeen = await nearTheEdge(page);
  if (takeoffSeen === null) return;
  await hands.takeoff();
  const released = await frameNow(page);
  const landingAt = Math.max(takeoffSeen + LANDING_AFTER_TAKEOFF_FRAMES, released + FRAMES_AFTER_RELEASE);
  const landingSeen = await whenReached(page, landingAt);
  if (landingSeen === null) return;
  await hands.landing();
  if (hands.telemark === undefined) return;
  if ((await whenReached(page, landingSeen + TELEMARK_AFTER_LANDING_FRAMES)) === null) return;
  await hands.telemark();
}

/** Waits on the page's clock, checked every animation frame, so the delay of the test runner does not add up. */
export async function waitForPageTime(page: Page, targetMs: number): Promise<void> {
  await page.waitForFunction((target) => performance.now() >= target, targetMs, { polling: "raf" });
}

/** The page time at which the start was announced, or null when it was not within the timeout. */
export async function startAnnouncedAt(page: Page, timeoutMs: number): Promise<number | null> {
  try {
    const handle = await page.waitForFunction(
      (text) => (document.querySelector("p[aria-live]")?.textContent === text ? performance.now() : null),
      STARTED,
      { polling: "raf", timeout: timeoutMs },
    );
    return await handle.jsonValue();
  } catch (error) {
    if (error instanceof errors.TimeoutError) return null;
    throw error;
  }
}

async function clickMouse(page: Page, side: "left" | "right"): Promise<void> {
  await page.mouse.down({ button: side });
  await page.waitForTimeout(PRESS_HOLD_MS);
  await page.mouse.up({ button: side });
}

/** Holds the left button on the picture until the jumper leaves the gate; returns the page time of the start. */
export async function startWithMouse(page: Page): Promise<number> {
  const middle = await centerOf(jumpCanvas(page));
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  const startedAt = await startAnnouncedAt(page, START_TIMEOUT_MS);
  await page.mouse.up();
  if (startedAt === null) throw new Error("The jump did not start while the left mouse button was held");
  return startedAt;
}

/**
 * Both buttons as one chord, the right one first. Sent together, so that a slow round trip of the test runner
 * (WebKit) neither holds the buttons longer nor puts frames between them.
 */
async function mouseChord(page: Page): Promise<void> {
  await Promise.all([page.mouse.down({ button: "right" }), page.mouse.down({ button: "left" })]);
  await page.waitForTimeout(PRESS_HOLD_MS);
  await Promise.all([page.mouse.up({ button: "right" }), page.mouse.up({ button: "left" })]);
}

/**
 * The mouse lands with a chord: its right button prepares the landing and its left one puts the telemark down at
 * once. Pressed apart, the left button came 27 to 38 frames after the right one in WebKit on the runner, past the
 * window of 28 frames, and the jumper fell.
 */
async function driveWithMouse(page: Page, options: JumpOptions): Promise<void> {
  await startWithMouse(page);
  await options.afterStart?.();
  await pressThroughJump(page, { takeoff: () => mouseChord(page), landing: () => mouseChord(page) });
}

/** Taps the left zone until the jumper leaves the gate. */
export async function startWithTouch(page: Page, left: Point): Promise<void> {
  for (let attempt = 0; attempt < START_TAP_LIMIT; attempt++) {
    await page.touchscreen.tap(left.x, left.y);
    if ((await startAnnouncedAt(page, START_TAP_WAIT_MS)) !== null) return;
    // Read once more at once: on a loaded machine a frame can take longer than the wait, and a tap on the inrun
    // spoils the jump.
    const said = await saidNow(page);
    if (said === STARTED) return;
    if (said !== null && tellsTheEnd(said)) throw new Error(`The jump ended before its start was seen: "${said}"`);
  }
  throw new Error("The jump did not start after repeated taps on the left zone");
}

async function driveWithTouch(page: Page, options: JumpOptions): Promise<void> {
  await startWithTouch(page, await centerOf(button(page, TEXT.leftPad)));
  await options.afterStart?.();
  // Measured after the start: what happens right after it may move the zones (a turn of the phone).
  const left = await centerOf(button(page, TEXT.leftPad));
  const right = await centerOf(button(page, TEXT.rightPad));
  const tap = (at: Point) => page.touchscreen.tap(at.x, at.y);
  await pressThroughJump(page, {
    takeoff: async () => {
      await tap(left);
      await tap(right);
    },
    landing: () => tap(right),
    telemark: () => tap(left),
  });
}

/** Waits until the jumper has stopped and returns what the page announced. */
export async function finishedOutcome(page: Page): Promise<JumpOutcome> {
  await expect(announcement(page)).toHaveText(RESULT, { timeout: RESULT_TIMEOUT_MS });
  return parseOutcome((await announcement(page).textContent()) ?? "");
}

/**
 * One whole jump with the input the device has, from the gate until the jumper has stopped. However it ends,
 * the outcome is returned: a fall is a whole jump too.
 */
export async function playJump(page: Page, traits: DeviceTraits, options: JumpOptions = {}): Promise<JumpOutcome> {
  await (traits.touch ? driveWithTouch(page, options) : driveWithMouse(page, options));
  return finishedOutcome(page);
}

/**
 * One jump with the mouse up to its landing, then presses of the left button, as a player starts the next jump
 * as soon as the game lets them, while the jumper still slides out. Returns the landing as it was announced, or
 * null when the jumper fell or stopped before a press was taken.
 */
export async function jumpAndGoOnEarly(page: Page): Promise<string | null> {
  await driveWithMouse(page, {});
  await expect(announcement(page)).toHaveText(/^(Lądowanie|Upadek): |^Dyskwalifikacja\./, {
    timeout: RESULT_TIMEOUT_MS,
  });
  const landed = /^Lądowanie: (\d+,\d{2}) metra\./.exec((await announcement(page).textContent()) ?? "");
  if (landed === null) return null;
  for (let attempt = 0; attempt < EARLY_PRESS_LIMIT; attempt++) {
    const said = (await announcement(page).textContent()) ?? "";
    // The jumper stopped first: the jump ended the usual way, which tells nothing here.
    if (RESULT.test(said)) return null;
    if (said === "") return landed[1] ?? null;
    await clickMouse(page, "left");
    await page.waitForTimeout(EARLY_PRESS_WAIT_MS);
  }
  return null;
}

export async function restartJump(page: Page, traits: DeviceTraits): Promise<void> {
  await openJumpControls(page, traits);
  await press(button(page, TEXT.jumpAgain), traits);
  await expect(announcement(page)).toHaveText("");
}

/**
 * One jump that must end in a clean landing: the presses follow the state of the jump, so a fall means the page
 * lost or misread a press, however loaded the machine.
 */
export async function playCleanJump(page: Page, traits: DeviceTraits, options: JumpOptions = {}): Promise<JumpOutcome> {
  const outcome = await playJump(page, traits, options);
  if (outcome.kind !== "landed") throw new Error(`No clean landing: ${outcome.announcement}`);
  return outcome;
}
