import type { Page } from "@playwright/test";
import { button, openJumpFromStart, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { centerOf, nearTheEdge, startWithTouch, whenReached, type Point } from "./support/jump";

/** Frames after the takeoff taps by which the jumper is surely in the air. */
const IN_FLIGHT_FRAMES = 20;
/** How far the finger moves, in CSS pixels, and in how many moves. */
const DRAG_PX = 60;
const DRAG_MOVES = 6;
/**
 * The least change of the lean a drag must make. At the default sensitivity a pixel is a unit of the lean, which
 * turns the body by 1.5/70 rad, so the drag turns it by about 1.3 rad; the body turns by itself far less meanwhile.
 */
const MIN_TURN_RAD = 0.3;

const bodyAngle = (page: Page): Promise<number> =>
  page.evaluate(() => window.telemarkJumpProbe?.bodyAngleRad ?? Number.NaN);

// Playwright's touchscreen only taps; a finger held down and moved is sent through the DevTools protocol, which
// only Chromium has.
test.skip(
  ({ browserName, traits }) => browserName !== "chromium" || !traits.touch,
  "a dragged finger needs a touch screen in Chromium",
);

test("a finger dragged on the left zone leans the jumper in flight, down one way and up the other", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  await startWithTouch(page, await centerOf(button(page, TEXT.leftPad)));
  const takeoffSeen = await nearTheEdge(page);
  expect(takeoffSeen, "the jumper reaches the edge").not.toBeNull();
  const left = await centerOf(button(page, TEXT.leftPad));
  const right = await centerOf(button(page, TEXT.rightPad));
  await page.touchscreen.tap(left.x, left.y);
  await page.touchscreen.tap(right.x, right.y);
  expect(await whenReached(page, (takeoffSeen ?? 0) + IN_FLIGHT_FRAMES), "the jumper flies").not.toBeNull();

  const devtools = await page.context().newCDPSession(page);
  const drag = async (from: Point, byPx: number) => {
    await devtools.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    for (let move = 1; move <= DRAG_MOVES; move++) {
      const point = { x: from.x, y: from.y + (byPx * move) / DRAG_MOVES };
      await devtools.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    }
    await devtools.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };

  const before = await bodyAngle(page);
  await drag(left, DRAG_PX);
  await expect.poll(() => bodyAngle(page), "a drag down leans one way").toBeLessThan(before - MIN_TURN_RAD);
  const leaned = await bodyAngle(page);
  await drag(left, -DRAG_PX);
  await expect.poll(() => bodyAngle(page), "a drag up leans the other way").toBeGreaterThan(leaned + MIN_TURN_RAD);
});
