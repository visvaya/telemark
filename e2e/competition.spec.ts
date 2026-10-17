import type { Page } from "@playwright/test";
import { button, jumpCanvas, openCompetitionSetup, openMenu, press, storedSave, TEXT } from "./support/app";
import { expect, test, type DeviceTraits } from "./support/fixtures";
import { centerOf, playJump } from "./support/jump";

const FINAL = "Klasyfikacja końcowa";
const NEXT_ROUND = /^Rozpocznij 2\. serię/;
const SKIP = /^Pomiń/;
const PRESS_LIMIT = 40;

/** A box of the setup by the name after the flag (a computer jumper's box is named with the country first). */
const box = (page: Page, name: string) => page.getByRole("checkbox", { name: new RegExp(`(^| )${name}$`) });

/** Sets the boxes of the setup: which players and which computer jumpers take part, and watching. */
async function setUp(page: Page, traits: DeviceTraits, on: Readonly<Record<string, boolean>>): Promise<void> {
  for (const [name, checked] of Object.entries(on)) {
    const target = box(page, name);
    if ((await target.isChecked()) !== checked) await press(target, traits);
    await expect(target).toBeChecked({ checked });
  }
}

/** After a player's jump: presses of the left button, as a player goes on, until the board is back. */
async function goOnAfterJump(page: Page, traits: DeviceTraits): Promise<void> {
  const board = page.getByRole("heading", { name: /^(Konkurs|Klasyfikacja końcowa)$/, level: 1 });
  for (let attempt = 0; attempt < PRESS_LIMIT && !(await board.isVisible()); attempt++) {
    if (traits.touch) {
      const left = await centerOf(button(page, TEXT.leftPad));
      await page.touchscreen.tap(left.x, left.y);
    } else {
      const middle = await centerOf(jumpCanvas(page));
      await page.mouse.click(middle.x, middle.y);
    }
    await page.waitForTimeout(250);
  }
  await expect(board).toBeVisible();
}

test("the setup of a competition is remembered after the page is loaded again", async ({ page, traits }) => {
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await setUp(page, traits, { "Gracz 2": true, "Aatu Lehtovaara": false, "Oglądaj skoki rywali": true });
  await page.getByRole("combobox", { name: "Poziom: Lars Hovden" }).selectOption({ label: "losowo" });

  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await expect(box(page, "Gracz 2")).toBeChecked();
  await expect(box(page, "Aatu Lehtovaara")).not.toBeChecked();
  await expect(box(page, "Oglądaj skoki rywali")).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Poziom: Lars Hovden" })).toHaveValue("5");
  expect(JSON.stringify(await storedSave(page))).toContain('"watchCpu":true');

  // Nobody taking part: the competition cannot start, and says why.
  await setUp(page, traits, {
    "Gracz 1": false,
    "Gracz 2": false,
    "Lars Hovden": false,
    "Matej Brezar": false,
    "Kenji Morioka": false,
  });
  await expect(button(page, TEXT.contestStart)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("Włącz co najmniej jednego zawodnika.")).toBeVisible();
});

test("a competition of one player and computer jumpers not watched runs to its results", async ({ page, traits }) => {
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await press(button(page, TEXT.contestStart), traits);
  for (let jumps = 0; jumps < 2; jumps++) {
    // The last after the first round jumps first in the second, straight from the start of the round.
    const next = button(page, /^Dalej: skacze Gracz 1/);
    await expect(next.or(jumpCanvas(page))).toBeVisible();
    if (await next.isVisible()) await press(next, traits);
    await expect(jumpCanvas(page)).toBeVisible();
    await playJump(page, traits);
    await goOnAfterJump(page, traits);
    await expect(page.getByText(/^Gracz 1: /)).toBeVisible();
    if (jumps === 0) {
      // The rest of the first round is computed at once; its results come before the second round.
      await expect(page.getByRole("heading", { name: "Wyniki po 1. serii" })).toBeVisible();
      await expect(page.locator(".contest-row")).toHaveCount(5);
      await press(button(page, NEXT_ROUND), traits);
    }
  }
  await expect(page.getByRole("heading", { name: FINAL, level: 1 })).toBeVisible();
  await expect(page.locator(".contest-row")).toHaveCount(5);
  await expect(page.locator(".contest-row").first()).toContainText("1.");
  await press(button(page, "Jeszcze raz"), traits);
  await expect(button(page, /^Dalej: skacze Gracz 1/)).toBeVisible();
  await press(button(page, TEXT.contestAbandon), traits);
  await press(button(page, TEXT.contestAbandonYes), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
});

test("a watched computer jump is shown and can be skipped", async ({ page, traits }) => {
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await setUp(page, traits, {
    "Gracz 1": false,
    "Lars Hovden": false,
    "Matej Brezar": false,
    "Kenji Morioka": false,
    "Oglądaj skoki rywali": true,
  });
  await press(button(page, TEXT.contestStart), traits);
  for (let round = 1; round <= 2; round++) {
    // Alone in the competition, the jumper's second jump follows the start of the round at once.
    if (round === 1) await press(button(page, /^Dalej: skacze Aatu Lehtovaara/), traits);
    await expect(jumpCanvas(page)).toBeVisible();
    // The jumper leaves the gate on their own; the skip goes straight on to the result.
    await expect(page.locator("p[aria-live]")).not.toHaveText("", { timeout: 10_000 });
    if (traits.desktop && round === 2) await page.keyboard.press("Enter");
    else await press(button(page, SKIP), traits);
    await expect(page.getByText(/^Aatu Lehtovaara: /)).toBeVisible();
    if (round === 1) await press(button(page, NEXT_ROUND), traits);
  }
  await expect(page.getByRole("heading", { name: FINAL, level: 1 })).toBeVisible();
  await press(button(page, "Menu"), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
});

test("leaving a competition jump asks first", async ({ page, traits }) => {
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await press(button(page, TEXT.contestStart), traits);
  await press(button(page, /^Dalej: skacze Gracz 1/), traits);
  await press(button(page, TEXT.pause), traits);
  await expect(button(page, TEXT.jumpAgain)).toHaveCount(0);
  await expect(button(page, TEXT.toHills)).toHaveCount(0);
  await press(button(page, TEXT.toMainMenu), traits);
  await press(button(page, "Nie, wróć"), traits);
  await press(button(page, TEXT.toMainMenu), traits);
  await press(button(page, TEXT.contestAbandonYes), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
});
