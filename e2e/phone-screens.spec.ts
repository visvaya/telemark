import type { Page } from "@playwright/test";
import { button, openJumpControls, openJumpFromStart, openMenu, openOutfit, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { LAYOUT_SLACK_PX } from "./support/geometry";

// The layouts of the outfit screen and of the menu behind the pause button on phone-sized windows. Each test
// sets the window itself, so it means the same on every profile; the device under it only decides how a
// control is pressed.

const PORTRAIT_WIDTHS_PX = [320, 360, 375, 390, 430];
const LANDSCAPE_PHONES_PX = [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
];

/** How many swatches each row of every part of the outfit holds, top to bottom. */
function swatchRows(page: Page): Promise<number[][]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".swatches"), (swatches) => {
      const rows = new Map<number, number>();
      for (const swatch of swatches.querySelectorAll(".swatch")) {
        const top = Math.round(swatch.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      return [...rows.entries()].toSorted(([a], [b]) => a - b).map(([, count]) => count);
    }),
  );
}

test("the swatches of a part fill one row or two even ones, never leaving one alone", async ({ page, traits }) => {
  for (const width of PORTRAIT_WIDTHS_PX) {
    await page.setViewportSize({ width, height: 740 });
    await openMenu(page);
    await openOutfit(page, traits);
    const rows = await swatchRows(page);
    expect(rows.length, `parts at ${width} px`).toBeGreaterThan(0);
    for (const part of rows) {
      expect([[12], [6, 6]], `rows of swatches at ${width} px`).toContainEqual(part);
    }
  }
});

test("upright, a phone shows the preview above the swatches, in sight when the screen opens", async ({
  page,
  traits,
}) => {
  for (const width of PORTRAIT_WIDTHS_PX) {
    await page.setViewportSize({ width, height: 740 });
    await openMenu(page);
    await openOutfit(page, traits);
    const { firstSwatchTop, preview } = await page.evaluate(() => {
      const box = document.querySelector(".outfit-preview")?.getBoundingClientRect();
      return {
        firstSwatchTop: Math.min(
          ...Array.from(document.querySelectorAll(".swatch"), (s) => s.getBoundingClientRect().top),
        ),
        preview: box ? { bottom: box.bottom } : null,
      };
    });
    expect(preview, `preview at ${width} px`).not.toBeNull();
    if (preview === null) continue;
    expect(preview.bottom, `preview above the swatches at ${width} px`).toBeLessThan(firstSwatchTop);
    await expect(page.locator(".outfit-preview"), `preview at ${width} px`).toBeInViewport({ ratio: 1 });
  }
});

test("held sideways, a phone shows the preview right of the swatches and inside the window", async ({
  page,
  traits,
}) => {
  for (const size of LANDSCAPE_PHONES_PX) {
    await page.setViewportSize(size);
    await openMenu(page);
    await openOutfit(page, traits);
    const where = `${size.width} x ${size.height}`;
    const { swatchesRight, swatchesTop, preview } = await page.evaluate(() => {
      const right = Math.max(
        ...Array.from(document.querySelectorAll(".swatch"), (s) => s.getBoundingClientRect().right),
      );
      const box = document.querySelector(".outfit-preview")?.getBoundingClientRect();
      return {
        swatchesRight: right,
        swatchesTop: document.querySelector(".swatch")?.getBoundingClientRect().top ?? 0,
        preview: box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null,
      };
    });
    expect(preview, `preview at ${where}`).not.toBeNull();
    if (preview === null) continue;
    expect(preview.left, `preview right of the swatches at ${where}`).toBeGreaterThan(swatchesRight);
    // It starts level with the first row of colours, not with the name above them.
    expect(Math.abs(preview.top - swatchesTop), `preview level with the colours at ${where}`).toBeLessThanOrEqual(
      LAYOUT_SLACK_PX,
    );
    expect(preview.right, `preview inside the window at ${where}`).toBeLessThanOrEqual(size.width + LAYOUT_SLACK_PX);
    expect(preview.bottom, `preview inside the window at ${where}`).toBeLessThanOrEqual(size.height + LAYOUT_SLACK_PX);
    // Scrolled to the end, the preview is still in sight and the way back can be reached.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator(".outfit-preview")).toBeInViewport({ ratio: 1 });
    await expect(button(page, TEXT.back)).toBeInViewport();
  }
});

test("the menu behind the pause button scrolls to the bottom edge and ends above the bar of gestures", async ({
  page,
  traits,
}) => {
  const BOTTOM_INSET_PX = 34;
  await page.setViewportSize({ width: 390, height: 520 });
  await openJumpFromStart(page, traits);
  await page.evaluate((inset) => {
    document.documentElement.style.setProperty("--safe-bottom", `${inset}px`);
  }, BOTTOM_INSET_PX);
  await openJumpControls(page, traits);
  const end = await page.evaluate(() => {
    const list = document.querySelector(".game.menu-open .game-toolbar");
    if (!(list instanceof HTMLElement)) return null;
    list.scrollTop = list.scrollHeight;
    const box = list.getBoundingClientRect();
    const last = list.lastElementChild?.getBoundingClientRect();
    return {
      scrolls: list.scrollHeight > list.clientHeight,
      areaBottom: box.top + list.clientTop + list.clientHeight,
      lastBottom: last?.bottom ?? 0,
    };
  });
  expect(end).not.toBeNull();
  if (end === null) return;
  expect(end.scrolls, "the menu needs scrolling in this window").toBe(true);
  expect(end.areaBottom, "the scrolling area reaches the bottom edge").toBeGreaterThanOrEqual(520 - LAYOUT_SLACK_PX);
  expect(520 - end.lastBottom, "the last control rests above the bar of gestures").toBeGreaterThanOrEqual(
    BOTTOM_INSET_PX - LAYOUT_SLACK_PX,
  );
});
