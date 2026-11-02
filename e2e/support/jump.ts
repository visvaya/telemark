import { errors, type Locator, type Page } from "@playwright/test";
import { announcement, button, jumpCanvas, openJumpControls, press, TEXT } from "./app";
import { expect, type DeviceTraits } from "./fixtures";
import { JUMP_TIMING } from "./jump-timing";

const STARTED = "Skok rozpoczęty.";
/** The last sentence of the announcement made once the jumper has stopped: in a competition the press goes on. */
const RESULT = /(jeszcze raz|dalej)\.$/;

const { TAKEOFF_AFTER_START_MS, LANDING_AFTER_TAKEOFF_MS, TELEMARK_AFTER_LANDING_MS, PRESS_HOLD_MS } = JUMP_TIMING;
/** A tap on the left zone starts the jump only once the gate opens, about a second in; until then it is repeated. */
const START_TAP_WAIT_MS = 200;
const START_TAP_LIMIT = 60;
const START_TIMEOUT_MS = 20_000;
const RESULT_TIMEOUT_MS = 40_000;
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
  /**
   * Runs right after the jumper leaves the gate, during the inrun. Returns for how many milliseconds the game
   * stood still meanwhile (a hidden page); the rest of the jump is played that much later.
   */
  afterStart?: () => Promise<number>;
}

const postponement = async (options: JumpOptions): Promise<number> => (await options.afterStart?.()) ?? 0;

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

async function driveWithMouse(page: Page, options: JumpOptions): Promise<void> {
  const startedAt = (await startWithMouse(page)) + (await postponement(options));
  await waitForPageTime(page, startedAt + TAKEOFF_AFTER_START_MS);
  await page.mouse.down({ button: "left" });
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(PRESS_HOLD_MS);
  await page.mouse.up({ button: "right" });
  await page.mouse.up({ button: "left" });
  await waitForPageTime(page, startedAt + TAKEOFF_AFTER_START_MS + LANDING_AFTER_TAKEOFF_MS);
  await clickMouse(page, "right");
  await waitForPageTime(
    page,
    startedAt + TAKEOFF_AFTER_START_MS + LANDING_AFTER_TAKEOFF_MS + TELEMARK_AFTER_LANDING_MS,
  );
  await clickMouse(page, "left");
}

/** Taps the left zone until the jumper leaves the gate; returns the page time just before the tap that did it. */
async function startWithTouch(page: Page, left: Point): Promise<number> {
  for (let attempt = 0; attempt < START_TAP_LIMIT; attempt++) {
    const tappedAt = await pageNow(page);
    await page.touchscreen.tap(left.x, left.y);
    if ((await startAnnouncedAt(page, START_TAP_WAIT_MS)) !== null) return tappedAt;
  }
  throw new Error("The jump did not start after repeated taps on the left zone");
}

async function driveWithTouch(page: Page, options: JumpOptions): Promise<void> {
  const startedAt =
    (await startWithTouch(page, await centerOf(button(page, TEXT.leftPad)))) + (await postponement(options));
  // Measured after the start: what happens right after it may move the zones (a turn of the phone).
  const left = await centerOf(button(page, TEXT.leftPad));
  const right = await centerOf(button(page, TEXT.rightPad));
  await waitForPageTime(page, startedAt + TAKEOFF_AFTER_START_MS);
  await page.touchscreen.tap(left.x, left.y);
  await page.touchscreen.tap(right.x, right.y);
  await waitForPageTime(page, startedAt + TAKEOFF_AFTER_START_MS + LANDING_AFTER_TAKEOFF_MS);
  await page.touchscreen.tap(right.x, right.y);
  await waitForPageTime(
    page,
    startedAt + TAKEOFF_AFTER_START_MS + LANDING_AFTER_TAKEOFF_MS + TELEMARK_AFTER_LANDING_MS,
  );
  await page.touchscreen.tap(left.x, left.y);
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
 * Jumps until a jump is landed cleanly, as a player who fell would jump again. The timing leaves a wide margin,
 * but the game keeps real time and a stalled machine can still spoil one jump; a fall is a valid end of a jump,
 * not a failure of the page. Returns every outcome, the clean landing last.
 */
export async function playUntilLanded(
  page: Page,
  traits: DeviceTraits,
  options: JumpOptions = {},
  attempts = 3,
): Promise<JumpOutcome[]> {
  const outcomes: JumpOutcome[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await restartJump(page, traits);
    const outcome = await playJump(page, traits, options);
    outcomes.push(outcome);
    if (outcome.kind === "landed") return outcomes;
  }
  throw new Error(
    `No clean landing in ${attempts} jumps: ${outcomes.map((outcome) => outcome.announcement).join(" | ")}`,
  );
}
