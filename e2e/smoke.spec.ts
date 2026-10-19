import {
  builtInHill,
  button,
  jumpCanvas,
  leaveJumpForHills,
  openHillList,
  openJump,
  openJumpControls,
  openMenu,
  press,
  TEXT,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { LAYOUT_SLACK_PX, scrollState } from "./support/geometry";

/** The picture's logical size (src/render/jump-view.ts). */
const VIEW_HEIGHT_PX = 200;
const VIEW_MIN_WIDTH_PX = 256;
const VIEW_MAX_WIDTH_PX = 480;
/** A drawn frame has sky, snow, the hill, the jumper and text; a blank or failed one has a single colour. */
const MIN_COLOURS_IN_A_FRAME = 8;

test("the page opens in Polish, the screens connect and the picture fills its area", async ({ page, traits }) => {
  await openMenu(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("navigation", { name: TEXT.menuHeading })).toBeVisible();

  await openHillList(page, traits);
  await openJump(page, traits);
  const canvas = jumpCanvas(page);

  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) return 0;
        const pixels = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data ?? [];
        const colours = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4) {
          colours.add(((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0));
        }
        return colours.size;
      }),
    )
    .toBeGreaterThanOrEqual(MIN_COLOURS_IN_A_FRAME);

  const fit = await canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error("The picture is not a canvas");
    const shown = element.getBoundingClientRect();
    const stage = element.parentElement?.getBoundingClientRect();
    return {
      logicalWidth: element.width,
      logicalHeight: element.height,
      scaleX: (shown.width * devicePixelRatio) / element.width,
      scaleY: (shown.height * devicePixelRatio) / element.height,
      dpr: devicePixelRatio,
      shownWidth: shown.width,
      shownHeight: shown.height,
      stageWidth: stage?.width ?? 0,
      stageHeight: stage?.height ?? 0,
    };
  });
  expect(fit.logicalHeight).toBe(VIEW_HEIGHT_PX);
  expect(fit.logicalWidth).toBeGreaterThanOrEqual(VIEW_MIN_WIDTH_PX);
  expect(fit.logicalWidth).toBeLessThanOrEqual(VIEW_MAX_WIDTH_PX);
  // Square game pixels on every screen, and the picture inside the area the layout gives it.
  expect(fit.scaleX).toBeCloseTo(fit.scaleY, 3);
  expect(fit.scaleX).toBeGreaterThanOrEqual(1);
  expect(fit.shownWidth).toBeLessThanOrEqual(fit.stageWidth + LAYOUT_SLACK_PX);
  expect(fit.shownHeight).toBeLessThanOrEqual(fit.stageHeight + LAYOUT_SLACK_PX);
  // The picture reaches the edges of its area in at least one direction, in a window as in full screen.
  const roomLeftPx = Math.min(fit.stageWidth - fit.shownWidth, fit.stageHeight - fit.shownHeight);
  expect(roomLeftPx).toBeLessThanOrEqual(LAYOUT_SLACK_PX);

  expect(await scrollState(page)).toEqual({ overflowXPx: 0, overflowYPx: 0, scrolledXPx: 0, scrolledYPx: 0 });

  // The hill list opens over the jump: choosing a hill goes on with the training, and the way out to the main
  // menu is a position of the jump's own menu.
  await leaveJumpForHills(page, traits);
  await press(button(page, TEXT.back), traits);
  await expect(button(page, TEXT.resume)).toBeVisible();
  await press(button(page, TEXT.toHills), traits);
  await press(builtInHill(page), traits);
  await expect(button(page, TEXT.resume)).toBeHidden();
  await expect(jumpCanvas(page)).toBeVisible();
  await openJumpControls(page, traits);
  await press(button(page, TEXT.toMainMenu), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await expect(jumpCanvas(page)).toHaveCount(0);
});
