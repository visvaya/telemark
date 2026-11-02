import type { Page } from "@playwright/test";
import { openJumpFromStart } from "./support/app";
import { AUDIBLE_LEVEL, audioState, installAudioProbe, SILENT_LEVEL } from "./support/audio-probe";
import { expect, test } from "./support/fixtures";
import { scrollState } from "./support/geometry";
import { pageNow, playUntilLanded } from "./support/jump";
import { expectTouchZonesPlaced } from "./support/touch-zones";

/** How long the page stays hidden in the middle of the inrun. */
const HIDDEN_MS = 1500;

const level = (page: Page) => async (): Promise<number> => (await audioState(page)).level;
const hidden = (page: Page) => (): Promise<boolean> => page.evaluate(() => document.hidden);

test.describe("turning the phone in the middle of a jump", () => {
  test.skip(({ traits }) => !traits.touch || traits.project.startsWith("tablet"), "phones only");

  test("leaves a valid layout and a jump that can be finished", async ({ page, traits, viewport }) => {
    const upright = viewport ?? { width: 0, height: 0 };
    const turned = { width: upright.height, height: upright.width };
    let turns = 0;
    await openJumpFromStart(page, traits);

    // The turn comes during the inrun; the zones are then found again where the new layout puts them, and a
    // clean landing shows that they still reach the game.
    const outcomes = await playUntilLanded(page, traits, {
      afterStart: async () => {
        turns++;
        const screen = turns % 2 === 1 ? turned : upright;
        await page.setViewportSize(screen);
        await expectTouchZonesPlaced(page, screen);
        expect(await scrollState(page)).toEqual({ overflowXPx: 0, overflowYPx: 0, scrolledXPx: 0, scrolledYPx: 0 });
        return 0;
      },
    });
    expect(outcomes.at(-1)?.kind).toBe("landed");
    expect(turns).toBeGreaterThanOrEqual(1);
  });
});

test.describe("hiding the page in the middle of a jump", () => {
  // Playwright cannot hide a page in Firefox or WebKit. In Chromium the window is minimised through the DevTools
  // protocol, and the test goes on only if that really hides the page. In every Chromium the test runner has
  // started so far (headless and with a window; a background tab and switching focus emulation off were tried
  // too) the page stays visible, so the test skips itself and the steps after the skip have never run. Hiding
  // the page is checked by hand on a device (docs/testing.md).
  test.skip(({ browserName }) => browserName !== "chromium", "only Chromium lets a test hide the page");

  test("pauses and silences the game, and showing it again resumes without a jump in time", async ({
    page,
    traits,
  }) => {
    const devtools = await page.context().newCDPSession(page);
    const { windowId } = await devtools.send("Browser.getWindowForTarget");
    const setWindow = (windowState: "minimized" | "normal") =>
      devtools.send("Browser.setWindowBounds", { windowId, bounds: { windowState } });

    await installAudioProbe(page);
    await openJumpFromStart(page, traits);

    // The rest of the jump is played later by exactly the time the page was hidden. It can only end in a clean
    // landing if the game stood still for that time and went on from where it was: had it kept running, or
    // skipped ahead on return, the takeoff would come far past the edge of the inrun.
    const outcomes = await playUntilLanded(page, traits, {
      afterStart: async () => {
        await expect.poll(level(page), "the inrun is heard").toBeGreaterThan(AUDIBLE_LEVEL);
        const hiddenAt = await pageNow(page);
        await setWindow("minimized");
        const wentHidden = await expect
          .poll(hidden(page), { timeout: 2000 })
          .toBe(true)
          .then(
            () => true,
            () => false,
          );
        test.skip(!wentHidden, "this browser has no window to minimise: the page stays visible");
        await page.waitForTimeout(HIDDEN_MS);
        expect((await audioState(page)).level, "silent while hidden").toBeLessThan(SILENT_LEVEL);
        await setWindow("normal");
        await expect.poll(hidden(page)).toBe(false);
        return (await pageNow(page)) - hiddenAt;
      },
    });
    expect(outcomes.at(-1)?.kind).toBe("landed");
    await setWindow("normal");
  });
});
