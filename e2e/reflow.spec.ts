import type { Page } from "@playwright/test";
import { onEachMenuScreen } from "./support/app";
import { expect, test, type DeviceTraits } from "./support/fixtures";
import { focusReport } from "./support/focus";
import { layoutProblems } from "./support/layout-audit";

/** The three desktop engines and one phone. */
const PROJECTS = ["desktop-chromium", "desktop-firefox", "desktop-webkit", "android-portrait"];
/** WCAG 1.4.10: content reflows at a width of 320 CSS pixels. */
const NARROW_VIEWPORT = { width: 320, height: 640 };
/** A 1280 by 720 window zoomed to 200% lays the page out in half as many CSS pixels each way. */
const ZOOMED_VIEWPORT = { width: 640, height: 360 };
/** WCAG 1.4.12: the spacing a reader may set without losing content. */
const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;
const SCREEN_COUNT = 10;

test.skip(({ traits }) => !PROJECTS.includes(traits.project), `reflow is checked on ${PROJECTS.join(", ")}`);

/** Walks the menu, the outfit screen and the hill list and expects a sound layout on each. */
async function expectSoundLayouts(page: Page, traits: DeviceTraits, prepare?: () => Promise<void>): Promise<void> {
  const checked: string[] = [];
  await onEachMenuScreen(page, traits, async (screen) => {
    await prepare?.();
    expect(await layoutProblems(page), `layout of "${screen}"`).toEqual([]);
    checked.push(screen);
  });
  expect(checked.length).toBe(SCREEN_COUNT);
}

test("at a width of 320 CSS pixels nothing scrolls sideways, is cut off or overlaps", async ({ page, traits }) => {
  await page.setViewportSize(NARROW_VIEWPORT);
  await expectSoundLayouts(page, traits);
});

test("at 200% zoom nothing scrolls sideways, is cut off or overlaps", async ({ page, traits }) => {
  test.skip(!traits.desktop, "browser zoom is a desktop setting");
  await page.setViewportSize(ZOOMED_VIEWPORT);
  await expectSoundLayouts(page, traits);
});

test("with the text spacing of WCAG 1.4.12 no text is cut off", async ({ page, traits }) => {
  await expectSoundLayouts(page, traits, async () => {
    // A style sheet made through the style object model, as a reader's own style sheet or an extension adds
    // one. The page's content security policy refuses a <style> element put into the document.
    await page.evaluate((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }, TEXT_SPACING_CSS);
  });
});

/**
 * What forced colours leave of the controls: for each one, whether its text or its border still stands out from
 * what is behind it; and the fill colours of the outfit swatches, which are the choice itself.
 */
function forcedColourReport(page: Page): Promise<{ invisible: string[]; swatchColours: string[] }> {
  return page.evaluate(() => {
    const backdrop = (element: Element): string => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") return colour;
      }
      return "canvas";
    };
    const controls = Array.from(document.querySelectorAll("button, label")).filter((control) => {
      const rect = control.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    });
    const invisible = controls
      .filter((control) => {
        const style = getComputedStyle(control);
        const behind = control.parentElement ? backdrop(control.parentElement) : "canvas";
        const hasText = control.textContent.trim() !== "" && control.querySelector(".sr-only") === null;
        const textShows = hasText && style.color !== backdrop(control);
        const borderShows = style.borderTopStyle !== "none" && style.borderTopColor !== behind;
        const fillShows = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== behind;
        return !textShows && !borderShows && !fillShows;
      })
      .map((control) => (control.getAttribute("aria-label") ?? control.textContent).trim());
    const swatchColours = Array.from(document.querySelectorAll("fieldset:first-of-type label")).map(
      (swatch) => getComputedStyle(swatch).backgroundColor,
    );
    return { invisible, swatchColours };
  });
}

/** Whether the focused element is drawn differently from the same element without the focus. */
async function focusChangesPixels(page: Page): Promise<boolean> {
  const clip = await page.evaluate(() => {
    const active = document.activeElement;
    const shown = active?.closest("label") ?? active;
    const rect = shown?.getBoundingClientRect() ?? new DOMRect();
    const MARGIN_PX = 8;
    return {
      x: Math.max(0, rect.x - MARGIN_PX),
      y: Math.max(0, rect.y - MARGIN_PX),
      width: rect.width + 2 * MARGIN_PX,
      height: rect.height + 2 * MARGIN_PX,
    };
  });
  const focused = await page.screenshot({ clip });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const blurred = await page.screenshot({ clip });
  return !focused.equals(blurred);
}

test("with forced colours every control is still visible and so is the focus", async ({
  page,
  traits,
  browserName,
}) => {
  // WebKit has no forced colours of its own. The test runner imitates them there with a style element put into
  // the page, which the page's content security policy refuses, so nothing would be checked.
  test.skip(browserName === "webkit", "forced colours are imitated in WebKit by a style element the policy refuses");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");
  const forced = await page.evaluate(() => matchMedia("(forced-colors: active)").matches);
  test.skip(!forced, "this engine does not emulate forced colours");

  const checked: string[] = [];
  await onEachMenuScreen(page, traits, async (screen) => {
    const report = await forcedColourReport(page);
    expect(report.invisible, `controls lost in forced colours on "${screen}"`).toEqual([]);
    // The swatches are told apart by their colour alone, so every one keeps its own.
    expect(new Set(report.swatchColours).size, `distinct swatch colours on "${screen}"`).toBe(
      report.swatchColours.length,
    );
    if (traits.desktop) {
      await page.keyboard.press("Tab");
      const focus = await focusReport(page);
      expect(focus.onBody, `a control takes the focus on "${screen}"`).toBe(false);
      expect(await focusChangesPixels(page), `focus on "${focus.name}" is visible on "${screen}"`).toBe(true);
    }
    checked.push(screen);
  });
  expect(checked.length).toBe(SCREEN_COUNT);
});
