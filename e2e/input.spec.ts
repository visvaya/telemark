import type { Page } from "@playwright/test";
import { announcement, button, jumpCanvas, openJumpFromStart, press, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import {
  centerOf,
  finishedOutcome,
  restartJump,
  startAnnouncedAt,
  startWithMouse,
  waitForPageTime,
  type JumpOutcome,
  type Point,
} from "./support/jump";

type Side = "left" | "right";
const other = (side: Side): Side => (side === "left" ? "right" : "left");

/** One simulation step: the game runs 70 of them a second. */
const SIM_STEP_MS = 1000 / 70;
/** The gate opens 65 steps (under a second) after the jump screen appears; this leaves a margin. */
const GATE_OPEN_MS = 1500;
/**
 * Timing of a jump played with chords, on the page's clock from the start (see support/jump.ts for the method).
 * The takeoff chord comes a little before the edge of the inrun. The landing chord follows half a second later,
 * at the very beginning of the flight: its first button prepares the landing and its second puts the telemark
 * down. Run in the simulation with many seeds and with these times shifted by up to a third of a second, every
 * such jump lands cleanly when both buttons of both chords count, and falls when the second button is lost,
 * because a landing prepared this early and never put down is held too long.
 */
const TAKEOFF_CHORD_AFTER_START_MS = 3300;
const LANDING_CHORD_AFTER_TAKEOFF_MS = 480;
const CHORD_HOLD_MS = 100;
const ATTEMPTS = 3;

interface PressProbe {
  /** Milliseconds between the last press of the left button and its release, as the page saw them. */
  lastLeftPressMs: number | null;
  leftDownAt: number | null;
}

declare global {
  interface Window {
    pressProbe?: PressProbe;
  }
}

test.skip(({ traits }) => !traits.desktop, "mouse chords and the Escape key belong to the desktop");

interface Chord {
  pressFirst: Side;
  releaseFirst: Side;
}

/**
 * A hand never holds a mouse perfectly still: a one-pixel sideways move. The game reads the held buttons from
 * moves as well, because a second button pressed or released while one is held does not arrive as a press.
 */
async function nudge(page: Page, at: Point, aside: boolean): Promise<void> {
  await page.mouse.move(at.x + (aside ? 1 : 0), at.y);
}

/**
 * Presses both buttons in the given order, holds them, and lets go in the given order. The two presses are
 * sent together, and so are the two releases: the page sees them in order, a moment apart, without the delay of
 * the test runner in between.
 */
async function chord(page: Page, at: Point, { pressFirst, releaseFirst }: Chord): Promise<void> {
  await Promise.all([page.mouse.down({ button: pressFirst }), page.mouse.down({ button: other(pressFirst) })]);
  await nudge(page, at, true);
  await page.waitForTimeout(CHORD_HOLD_MS);
  await Promise.all([page.mouse.up({ button: releaseFirst }), page.mouse.up({ button: other(releaseFirst) })]);
  await nudge(page, at, false);
}

/** The chord at the gate, pressed slowly: the jump starts when the left button goes down, not before. */
async function startWithChord(page: Page, at: Point, { pressFirst, releaseFirst }: Chord): Promise<number> {
  if (pressFirst === "right") {
    await page.mouse.down({ button: "right" });
    await nudge(page, at, true);
    await page.waitForTimeout(300);
    await expect(announcement(page), "the right button alone does not start a jump").toHaveText("");
  }
  // Watched while the button goes down, so the time is that of the start and not of a later look.
  const [startedAt] = await Promise.all([startAnnouncedAt(page, 5000), page.mouse.down({ button: "left" })]);
  if (startedAt === null) throw new Error("The jump did not start when the left button went down in a chord");
  if (pressFirst === "left") await page.mouse.down({ button: "right" });
  await nudge(page, at, false);
  await page.mouse.up({ button: releaseFirst });
  await nudge(page, at, true);
  await page.mouse.up({ button: other(releaseFirst) });
  await nudge(page, at, false);
  return startedAt;
}

/**
 * A whole jump in which every press is a chord. What a clean landing proves:
 * - the jump starts only when the left button goes down, also as the second button of a chord;
 * - after each chord is let go the jumper crouches and later flies freely, which needs both buttons seen as
 *   released, so neither release was lost in either order;
 * - the second button of the landing chord puts the telemark down: without it a landing prepared this early
 *   ends in a fall.
 */
async function jumpWithChords(page: Page, keys: Chord): Promise<JumpOutcome> {
  await page.waitForTimeout(GATE_OPEN_MS);
  const middle = await centerOf(jumpCanvas(page));
  await page.mouse.move(middle.x, middle.y);
  const startedAt = await startWithChord(page, middle, keys);
  await waitForPageTime(page, startedAt + TAKEOFF_CHORD_AFTER_START_MS);
  await chord(page, middle, keys);
  await waitForPageTime(page, startedAt + TAKEOFF_CHORD_AFTER_START_MS + LANDING_CHORD_AFTER_TAKEOFF_MS);
  await chord(page, middle, keys);
  return finishedOutcome(page);
}

const CHORDS: Chord[] = [
  { pressFirst: "left", releaseFirst: "right" },
  { pressFirst: "right", releaseFirst: "left" },
];

for (const keys of CHORDS) {
  const { pressFirst, releaseFirst } = keys;
  test(`both mouse buttons work as a chord: ${pressFirst} pressed first, ${releaseFirst} released first`, async ({
    page,
    traits,
  }, testInfo) => {
    await openJumpFromStart(page, traits);
    const outcomes: JumpOutcome[] = [];
    for (let attempt = 0; attempt < ATTEMPTS && outcomes.at(-1)?.kind !== "landed"; attempt++) {
      if (attempt > 0) await restartJump(page, traits);
      outcomes.push(await jumpWithChords(page, keys));
    }
    testInfo.annotations.push({
      type: "jumps",
      description: outcomes.map((outcome) => outcome.kind).join(", "),
    });
    expect(outcomes.map((outcome) => outcome.announcement).at(-1)).toMatch(/^Lądowanie: /);
  });
}

test("a press shorter than one simulation step still starts the jump", async ({ page, traits }) => {
  await page.addInitScript(() => {
    const probe: PressProbe = { lastLeftPressMs: null, leftDownAt: null };
    window.pressProbe = probe;
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button === 0) probe.leftDownAt = event.timeStamp;
      },
      { capture: true },
    );
    window.addEventListener(
      "pointerup",
      (event) => {
        if (event.button === 0 && probe.leftDownAt !== null) probe.lastLeftPressMs = event.timeStamp - probe.leftDownAt;
      },
      { capture: true },
    );
  });
  await openJumpFromStart(page, traits);
  const middle = await centerOf(jumpCanvas(page));
  await page.mouse.move(middle.x, middle.y);

  // One quick click once the gate is open, on three jumps. A press that ends before the next simulation step
  // must still start the jump every time: without the game holding such a press for one step, most of them
  // would fall between two steps and be lost. A busy machine can stretch a click beyond a step; such a click
  // proves nothing and is left out, but at least one of the three has to be short.
  const clicks: { pressMs: number; started: boolean }[] = [];
  for (let jump = 0; jump < 3; jump++) {
    if (jump > 0) {
      // The mouse is captured by the running jump, so the next one is asked for with its key.
      await page.keyboard.press("r");
      await expect(announcement(page)).toHaveText("");
    }
    await page.waitForTimeout(GATE_OPEN_MS);
    // Sent together, so the release follows the press without waiting for the test runner in between.
    await Promise.all([page.mouse.down(), page.mouse.up()]);
    const started = (await startAnnouncedAt(page, 1000)) !== null;
    const pressMs = (await page.evaluate(() => window.pressProbe?.lastLeftPressMs)) ?? Number.POSITIVE_INFINITY;
    clicks.push({ pressMs, started });
    // A click that was lost leaves the jumper at the gate; a held press starts the jump so the next round can
    // ask for a new one in the same way.
    if (!started) await startWithMouse(page);
  }
  const shortClicks = clicks.filter((click) => click.pressMs < SIM_STEP_MS);
  expect(
    shortClicks.length,
    `presses of ${clicks.map((click) => click.pressMs.toFixed(1)).join(", ")} ms`,
  ).toBeGreaterThan(0);
  expect(shortClicks.filter((click) => !click.started)).toEqual([]);
});

test("one press of Escape stops a running jump and opens the menu, which leads out of the training", async ({
  page,
  traits,
}, testInfo) => {
  await openJumpFromStart(page, traits);
  await startWithMouse(page);

  // The press on the picture asks for the mouse capture. Headless engines may refuse it; the game then runs
  // without it and Escape arrives as a plain key. Which of the two paths ran is recorded with the result.
  const captured = await page.evaluate(() => document.pointerLockElement !== null);
  testInfo.annotations.push({
    type: "mouse capture",
    description: captured
      ? "captured: Escape opened the menu while the mouse was captured"
      : "refused by this engine: opening the menu through a released capture was not exercised",
  });

  await page.keyboard.press("Escape");
  const resume = button(page, TEXT.resume);
  await expect(resume).toBeVisible();
  await expect(jumpCanvas(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();

  // Leaving is a position of the menu.
  await press(button(page, TEXT.toMainMenu), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await expect(jumpCanvas(page)).toHaveCount(0);
});
