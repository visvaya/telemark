import type { Page } from "@playwright/test";
import { onEveryScreen } from "./support/app";
import { expect, test } from "./support/fixtures";
import { LAYOUT_SLACK_PX } from "./support/geometry";

// Parts of a phone's screen are covered by a camera cut-out, rounded corners and the bar of system gestures.
// The page reaches under them and keeps its content clear through four values that read the browser's
// env(safe-area-inset-*) (src/ui/app.css). No browser under test has such a screen. Chromium is given the insets
// of a phone held sideways, with the cut-out on the left, through its protocol, so the values come through env()
// as on a phone; the other engines have no such switch, and there the test sets the four values itself. Real
// insets are checked by hand on a device.
const INSETS_PX = { top: 20, right: 34, bottom: 21, left: 47 };
const SAFE_VALUES = ["--safe-top", "--safe-right", "--safe-bottom", "--safe-left"] as const;

/** Everything a player reads or aims at. */
const CONTENT = "h1, h2, button, canvas, label.pixel-button, .swatch, p.note";

/** Gives Chromium a screen with the insets: env(safe-area-inset-*) reads them from then on. */
async function overrideInsets(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS_PX });
}

async function setInsets(page: Page): Promise<void> {
  await page.evaluate((insets) => {
    const root = document.documentElement.style;
    root.setProperty("--safe-top", `${insets.top}px`);
    root.setProperty("--safe-right", `${insets.right}px`);
    root.setProperty("--safe-bottom", `${insets.bottom}px`);
    root.setProperty("--safe-left", `${insets.left}px`);
  }, INSETS_PX);
}

/** The four values as the page computes them. */
function safeValues(page: Page): Promise<string[]> {
  return page.evaluate(
    (names) => names.map((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()),
    [...SAFE_VALUES],
  );
}

interface Placement {
  what: string;
  /** How far each edge of the element is from the same edge of the area it lives in, in CSS pixels. */
  fromLeft: number;
  fromTop: number;
  fromRight: number;
  /** Null inside a list that scrolls: its end is reached by scrolling, with the list's own padding after it. */
  fromBottom: number | null;
}

/**
 * Where every visible piece of content sits in its area: the whole page (as long as it is, when it scrolls),
 * or, for the controls behind the pause button, the list that covers the screen.
 */
function contentPlacements(page: Page): Promise<Placement[]> {
  return page.evaluate((selector) => {
    const root = document.documentElement;
    const pageArea = {
      left: 0,
      top: 0,
      right: root.clientWidth,
      bottom: Math.max(root.clientHeight, root.scrollHeight),
    };
    const placements: Placement[] = [];
    for (const element of document.querySelectorAll(selector)) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || getComputedStyle(element).visibility === "hidden") continue;
      const list = element.closest(".game.menu-open .game-toolbar");
      const listBox = list?.getBoundingClientRect();
      const area = listBox ?? pageArea;
      const scrolls = list !== null && list.scrollHeight > list.clientHeight;
      const offsetY = listBox ? 0 : window.scrollY;
      placements.push({
        what: `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 30)}"`,
        fromLeft: box.left - area.left,
        fromTop: box.top + offsetY - area.top + (list?.scrollTop ?? 0),
        fromRight: area.right - box.right,
        fromBottom: scrolls ? null : area.bottom - (box.bottom + offsetY),
      });
    }
    return placements;
  }, CONTENT);
}

test("no screen puts content under the covered edges of the display", async ({ page, traits, browserName }) => {
  const throughEnv = browserName === "chromium";
  if (throughEnv) await overrideInsets(page);
  await onEveryScreen(page, traits, async (screen) => {
    if (throughEnv) {
      const { top, right, bottom, left } = INSETS_PX;
      expect(await safeValues(page), `insets read through env() on "${screen}"`).toEqual(
        [top, right, bottom, left].map((px) => `${px}px`),
      );
    } else {
      await setInsets(page);
    }
    const placements = await contentPlacements(page);
    expect(placements.length, `content on "${screen}"`).toBeGreaterThan(0);
    for (const placement of placements) {
      const where = `${placement.what} on "${screen}"`;
      expect(placement.fromLeft, `left edge of ${where}`).toBeGreaterThanOrEqual(INSETS_PX.left - LAYOUT_SLACK_PX);
      expect(placement.fromTop, `top edge of ${where}`).toBeGreaterThanOrEqual(INSETS_PX.top - LAYOUT_SLACK_PX);
      expect(placement.fromRight, `right edge of ${where}`).toBeGreaterThanOrEqual(INSETS_PX.right - LAYOUT_SLACK_PX);
      if (placement.fromBottom !== null) {
        expect(placement.fromBottom, `bottom edge of ${where}`).toBeGreaterThanOrEqual(
          INSETS_PX.bottom - LAYOUT_SLACK_PX,
        );
      }
    }
  });
});
