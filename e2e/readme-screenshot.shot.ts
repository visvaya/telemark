import type { Settings } from "../src/storage/save-data";
import { jumpCanvas, openJumpFromStart, SAVE_KEY } from "./support/app";
import { test } from "./support/fixtures";
import { nearTheEdge, startWithMouse, whenReached } from "./support/jump";
import { JUMP_TIMING } from "./support/jump-timing";

// The picture at the top of the README: a jump on the built-in hill, taken in flight, only with
// BROWSER_TESTS_SCREENSHOTS set (playwright.config.ts). Only the jump picture is taken: it is drawn in the game's
// own pixel font, so the picture does not depend on the fonts of the machine that takes it.

const SCREENSHOT_PATH = "docs/screenshot.png";
/** A fixed look, without the hints over the picture and without sound. */
const LOOK = {
  scenery: "dusk",
  weather: "snow",
  hillHints: false,
  sound: false,
} as const satisfies Partial<Settings>;
/** How long after the takeoff the picture is taken: the jumper is well clear of the takeoff, high above the hill. */
const FLIGHT_FRAMES = 45;

test("the README picture: a jump in flight", async ({ page, context, traits }) => {
  await context.addInitScript(
    ({ key, settings }) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, records: {}, settings })),
    { key: SAVE_KEY, settings: LOOK },
  );
  await openJumpFromStart(page, traits);
  await startWithMouse(page);
  const takeoff = await nearTheEdge(page);
  if (takeoff === null) throw new Error("The jump ended before the takeoff");
  await Promise.all([page.mouse.down({ button: "left" }), page.mouse.down({ button: "right" })]);
  await page.waitForTimeout(JUMP_TIMING.PRESS_HOLD_MS);
  await Promise.all([page.mouse.up({ button: "right" }), page.mouse.up({ button: "left" })]);
  if ((await whenReached(page, takeoff + FLIGHT_FRAMES)) === null) throw new Error("The jump ended in the air");
  await jumpCanvas(page).screenshot({ path: SCREENSHOT_PATH, animations: "allow" });
});
