import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { OWN_HILL_SPECS } from "../src/hills/own-hills";
import {
  BUILT_IN_HILL_ID,
  button,
  jumpCanvas,
  openCompetitionSetup,
  openMenu,
  press,
  SAVE_KEY,
  storedSave,
  TEXT,
} from "./support/app";
import { expect, test, type DeviceTraits } from "./support/fixtures";
import { centerOf, playJump } from "./support/jump";

const FINAL = "Klasyfikacja końcowa";
/** A distance in a round's cell, or a disqualification. */
const DISTANCE = /^(\d+,\d\s*m|dyskw\.\s*dyskwalifikacja)$/;
const NEXT_ROUND = /^Rozpocznij 2\. serię/;
const SKIP = /^Pomiń/;
const PRESS_LIMIT = 40;

/** A box of the setup by the name after the flag (a computer jumper's box is named with the country first). */
const box = (page: Page, name: string) => page.getByRole("checkbox", { name: new RegExp(`(^| )${name}$`) });

/** The safe answer of the question before leaving a competition. */
const backButton = (page: Page) => page.getByRole("button", { name: "Wróć", exact: true });

/** The row of the board's table of a competitor, by the name in its row header. */
const rowOf = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) });

/** The board's table: the column headers, one row per competitor, and the hill record under it. */
async function expectBoard(page: Page, rows: number): Promise<void> {
  for (const header of ["Miejsce", "Zawodnik", "1. seria", "2. seria", "Razem"]) {
    await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
  }
  await expect(page.locator(".contest-row")).toHaveCount(rows);
  await expect(page.getByText(/^Rekord na tym urządzeniu: /)).toBeVisible();
}

/** Sets the boxes of the setup: which players and which computer jumpers take part, and watching. */
async function setUp(page: Page, traits: DeviceTraits, on: Readonly<Record<string, boolean>>): Promise<void> {
  for (const [name, checked] of Object.entries(on)) {
    const target = box(page, name);
    if ((await target.isChecked()) !== checked) await press(target, traits);
    await expect(target).toBeChecked({ checked });
  }
}

/** The widths of the board's columns, in whole CSS pixels. */
const columnWidths = (page: Page): Promise<number[]> =>
  page
    .getByRole("columnheader")
    .evaluateAll((headers) => headers.map((h) => Math.round(h.getBoundingClientRect().width)));

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
  // The rule of a disqualification: the original's by default, the one of real competitions to choose.
  const rule = page.getByRole("combobox", { name: "Dyskwalifikacja" });
  await expect(rule).toHaveValue("original");
  await rule.selectOption({ label: "odpada z konkursu" });

  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await expect(box(page, "Gracz 2")).toBeChecked();
  await expect(box(page, "Aatu Lehtovaara")).not.toBeChecked();
  await expect(box(page, "Oglądaj skoki rywali")).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Poziom: Lars Hovden" })).toHaveValue("5");
  await expect(page.getByRole("combobox", { name: "Dyskwalifikacja" })).toHaveValue("fis");
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
  await expectBoard(page, 5);
  const startWidths = await columnWidths(page);
  // The focus waits on the way on, so the keyboard goes through a competition with Enter alone.
  await expect(button(page, /^Dalej: skacze Gracz 1/)).toBeFocused();
  // Everybody is listed from the start; the next jumper's row says so.
  await expect(rowOf(page, "Gracz 1")).toContainText("skacze teraz");
  for (let jumps = 0; jumps < 2; jumps++) {
    // The last after the first round jumps first in the second, straight from the start of the round.
    const next = button(page, /^Dalej: skacze Gracz 1/);
    await expect(next.or(jumpCanvas(page))).toBeVisible();
    if (await next.isVisible()) await press(next, traits);
    await expect(jumpCanvas(page)).toBeVisible();
    await playJump(page, traits);
    await goOnAfterJump(page, traits);
    // The jump just made stands in its row.
    await expect(rowOf(page, "Gracz 1").locator(".contest-distance").nth(jumps)).toHaveText(DISTANCE);
    if (jumps === 0) {
      // The rest of the first round is computed at once; its results come before the second round.
      await expect(page.getByRole("table", { name: "Wyniki po 1. serii" })).toBeVisible();
      await expectBoard(page, 5);
      await press(button(page, NEXT_ROUND), traits);
    }
  }
  await expect(page.getByRole("table", { name: FINAL })).toBeVisible();
  await expectBoard(page, 5);
  // The columns keep their widths from the start list to the end: nothing moves as the results come in.
  expect(await columnWidths(page)).toEqual(startWidths);
  await expect(page.locator(".contest-row").first()).toContainText("1.");
  await press(button(page, "Powtórz zawody"), traits);
  await expect(button(page, /^Dalej: skacze Gracz 1/)).toBeVisible();
  // The question takes the focus on its safe answer; answered no, the focus returns to the way out.
  await press(button(page, TEXT.contestAbandon), traits);
  await expect(backButton(page)).toBeFocused();
  await press(backButton(page), traits);
  await expect(button(page, TEXT.contestAbandon)).toBeFocused();
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
  // Before the first jump the table is the start list.
  await expect(page.getByRole("table", { name: "Lista startowa" })).toBeVisible();
  await expectBoard(page, 1);
  // The start number: a column of its own where the table is wide enough, else in the place's cell before the jump.
  const numberHeader = page.getByRole("columnheader", { name: "Numer startowy" });
  const early = page.locator(".contest-row .contest-early-number");
  if ((page.viewportSize()?.width ?? 0) >= 600) {
    await expect(numberHeader).toBeVisible();
    await expect(page.locator(".contest-row .contest-number")).toHaveText("1");
    await expect(early).toBeHidden();
  } else {
    await expect(numberHeader).toHaveCount(0);
    await expect(early).toBeVisible();
    await expect(early.locator('[aria-hidden="true"]')).toHaveText("1");
  }
  for (let round = 1; round <= 2; round++) {
    // Alone in the competition, the jumper's second jump follows the start of the round at once.
    if (round === 1) await press(button(page, /^Dalej: skacze Aatu Lehtovaara/), traits);
    await expect(jumpCanvas(page)).toBeVisible();
    // The jumper leaves the gate on their own; the skip goes straight on to the result.
    await expect(page.locator("p[aria-live]")).not.toHaveText("", { timeout: 10_000 });
    if (traits.desktop && round === 2) await page.keyboard.press("Enter");
    else await press(button(page, SKIP), traits);
    // The skipped jump is scored and stands in its row.
    await expect(
      rowOf(page, "Aatu Lehtovaara")
        .locator(".contest-distance")
        .nth(round - 1),
    ).toHaveText(DISTANCE);
    if (round === 1) await press(button(page, NEXT_ROUND), traits);
  }
  await expect(page.getByRole("table", { name: FINAL })).toBeVisible();
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
  await expect(backButton(page)).toBeFocused();
  await press(backButton(page), traits);
  await expect(button(page, TEXT.toMainMenu)).toBeFocused();
  await press(button(page, TEXT.toMainMenu), traits);
  await press(button(page, TEXT.contestAbandonYes), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
});

/** A hill's box in the setup, by the hill's name. */
const hillBox = (page: Page, name: string) =>
  page.getByRole("checkbox", { name: new RegExp(String.raw`^${name} K\d+$`) });

test("the hills of the setup and the double cup are remembered after the page is loaded again", async ({
  page,
  traits,
}) => {
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  // Nothing chosen yet: the first hill, one competition.
  await expect(hillBox(page, OWN_HILL_SPECS[0]?.name ?? "?")).toBeChecked();
  await expect(page.getByText("1 konkurs", { exact: true })).toBeVisible();
  await press(button(page, "Wyczyść"), traits);
  await expect(button(page, TEXT.contestStart)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("Zaznacz co najmniej jedną skocznię.")).toBeVisible();
  await press(button(page, "Zaznacz wszystkie"), traits);
  await expect(page.getByText(`Puchar Świata: ${OWN_HILL_SPECS.length} konkursów`)).toBeVisible();
  await press(button(page, "Wyczyść"), traits);
  await press(hillBox(page, OWN_HILL_SPECS[1]?.name ?? "?"), traits);
  await press(hillBox(page, OWN_HILL_SPECS[2]?.name ?? "?"), traits);
  await press(page.getByRole("checkbox", { name: "Podwójny Puchar" }), traits);
  await expect(page.getByText("Puchar Świata: 4 konkursy")).toBeVisible();

  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await expect(hillBox(page, OWN_HILL_SPECS[0]?.name ?? "?")).not.toBeChecked();
  await expect(hillBox(page, OWN_HILL_SPECS[1]?.name ?? "?")).toBeChecked();
  await expect(hillBox(page, OWN_HILL_SPECS[2]?.name ?? "?")).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Podwójny Puchar" })).toBeChecked();
  await expect(page.getByText("Puchar Świata: 4 konkursy")).toBeVisible();
});

test("the setup shows the record of a hill kept on this device after its name", async ({ page, traits }) => {
  const hill = OWN_HILL_SPECS.find((h) => h.id === BUILT_IN_HILL_ID);
  if (hill === undefined) throw new Error("built-in hill expected");
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  // A change writes the save; a record goes into it as a jump on the hill would put it.
  await press(button(page, "Zaznacz wszystkie"), traits);
  await expect.poll(() => storedSave(page)).not.toBeNull();
  await page.evaluate(
    ({ key, id }) => {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
      const save = typeof parsed === "object" && parsed !== null ? parsed : {};
      const kept: unknown = Reflect.get(save, "records");
      const record = { distanceM: 123.5, points: 120, dateIso: "2026-10-20T08:00:00.000Z" };
      const records = { ...(typeof kept === "object" && kept !== null ? kept : {}), [id]: record };
      localStorage.setItem(key, JSON.stringify({ ...save, records }));
    },
    { key: SAVE_KEY, id: BUILT_IN_HILL_ID },
  );
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  // The box keeps the hill's label as its name; the record describes it.
  await expect(hillBox(page, hill.name)).toHaveAccessibleDescription("rekord 123,50 m");
  await expect(page.getByText("rekord 123,50 m", { exact: true })).toBeVisible();
});

test("a world cup of two hills runs from the start list to its podium", async ({ page, traits }) => {
  const [first, second] = OWN_HILL_SPECS;
  if (!first || !second) throw new Error("two own hills expected");
  await openMenu(page);
  await openCompetitionSetup(page, traits);
  await setUp(page, traits, { "Gracz 1": false });
  await press(button(page, "Zaznacz wszystkie"), traits);
  await press(button(page, "Wyczyść"), traits);
  await press(hillBox(page, first.name), traits);
  await press(hillBox(page, second.name), traits);
  await expect(page.getByText("Puchar Świata: 2 konkursy")).toBeVisible();
  await press(button(page, TEXT.contestStart), traits);

  for (const [n, hill] of [first, second].entries()) {
    // The computer jumpers' first round is computed at once; the board says which competition of the cup it is.
    await expect(page.getByText(`Konkurs ${n + 1} z 2`)).toBeVisible();
    await expect(page.getByText(new RegExp(String.raw`^${hill.name} K\d+$`))).toBeVisible();
    await expect(page.getByRole("table", { name: "Wyniki po 1. serii" })).toBeVisible();
    await expect(button(page, NEXT_ROUND)).toBeFocused();
    await press(button(page, NEXT_ROUND), traits);
    await expect(page.getByRole("table", { name: FINAL })).toBeVisible();
    if (n === 0) {
      await expect(button(page, "Dalej: klasyfikacja Pucharu")).toBeFocused();
      await press(button(page, "Dalej: klasyfikacja Pucharu"), traits);
      await expect(page.getByRole("heading", { name: "Puchar Świata", level: 1 })).toBeVisible();
      await expect(page.getByRole("table", { name: "Klasyfikacja po 1 z 2 konkursach" })).toBeVisible();
      await expect(page.locator(".contest-row")).toHaveCount(4);
      await expect(page.locator(".contest-row").first()).toContainText("lider");
      // The average place: a column where the screen is wide enough, gone (and not read out) where it is not.
      const average = page.getByRole("columnheader", { name: "Średnie miejsce" });
      if ((page.viewportSize()?.width ?? 0) >= 600) {
        await expect(average).toBeVisible();
        await expect(page.locator(".contest-row").first().locator(".cup-average")).toHaveText("1,0");
      } else {
        await expect(average).toHaveCount(0);
      }
      const next = button(page, new RegExp(String.raw`^Dalej: ${second.name} K\d+ \(konkurs 2 z 2\)$`));
      await expect(next).toBeFocused();
      await press(next, traits);
    }
  }
  await expect(button(page, "Wyniki końcowe")).toBeFocused();
  await press(button(page, "Wyniki końcowe"), traits);
  await expect(page.getByText("Wyniki końcowe · 2 konkursy")).toBeVisible();
  const podium = page.getByRole("list", { name: "Podium" });
  await expect(podium).toBeVisible();
  await expect(podium.getByText(/^1\. miejsce: .+, \d+ pkt$/).first()).toBeAttached();
  // A player's place is told by the table and the podium alone, with no band of its own.
  await expect(page.locator(".cup-player-band")).toHaveCount(0);
  // No sideways scroll on the end screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(button(page, "Powtórz zawody")).toBeFocused();
  await press(button(page, "Powtórz zawody"), traits);
  await expect(page.getByText("Konkurs 1 z 2")).toBeVisible();
});

/** Sets up a cup of the first two own hills with the computer jumpers alone, and starts it. */
async function startCpuCup(page: Page, traits: DeviceTraits): Promise<void> {
  const [first, second] = OWN_HILL_SPECS;
  if (!first || !second) throw new Error("two own hills expected");
  await openCompetitionSetup(page, traits);
  await setUp(page, traits, { "Gracz 1": false });
  await press(button(page, "Wyczyść"), traits);
  await press(hillBox(page, first.name), traits);
  await press(hillBox(page, second.name), traits);
  await press(button(page, TEXT.contestStart), traits);
  await expect(page.getByRole("table", { name: "Wyniki po 1. serii" })).toBeVisible();
}

const RESUME = "Wznów zawody";
const KEPT_LINE = "Puchar Świata · konkurs 1 z 2 · 2. seria";

test("a cup goes on after the page is loaded again, and a new one asks first", async ({ page, traits }) => {
  await openMenu(page);
  await expect(button(page, RESUME)).toHaveCount(0);
  await startCpuCup(page, traits);
  const board = await page.locator(".contest-table").innerText();
  await page.reload();
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await expect(button(page, RESUME)).toBeVisible();
  await expect(page.getByText(KEPT_LINE)).toBeVisible();
  await press(button(page, RESUME), traits);
  await expect(page.getByText("Konkurs 1 z 2")).toBeVisible();
  expect(await page.locator(".contest-table").innerText()).toBe(board);
  await expect(button(page, NEXT_ROUND)).toBeFocused();

  // Leaving for the menu keeps the cup; a new competition asks before it replaces it.
  await press(button(page, TEXT.contestAbandon), traits);
  await expect(backButton(page)).toBeFocused();
  await press(button(page, "Wyjdź do menu (zawody zostaną zapisane)"), traits);
  await expect(button(page, RESUME)).toBeVisible();
  await openCompetitionSetup(page, traits);
  await press(button(page, TEXT.contestStart), traits);
  await expect(page.getByText(`Masz zapisane zawody (${KEPT_LINE}). Rozpocząć nowe?`, { exact: false })).toBeVisible();
  await expect(button(page, "Nie, wróć")).toBeFocused();
  await press(button(page, "Nie, wróć"), traits);
  await expect(button(page, TEXT.contestStart)).toBeFocused();
  await press(button(page, TEXT.contestStart), traits);
  await press(button(page, "Tak, rozpocznij nowe"), traits);
  await expect(page.getByRole("table", { name: "Wyniki po 1. serii" })).toBeVisible();

  // Ending it removes it.
  await press(button(page, TEXT.contestAbandon), traits);
  await press(button(page, TEXT.contestAbandonYes), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await expect(button(page, RESUME)).toHaveCount(0);
});

test("a cup saved to a file goes on from it on a page without it", async ({ page, traits }) => {
  // The file comes as a download on every device, so the test can take it.
  await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: undefined }));
  await openMenu(page);
  await startCpuCup(page, traits);
  const board = await page.locator(".contest-table").innerText();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    press(button(page, "Zapisz zawody do pliku"), traits),
  ]);
  expect(download.suggestedFilename()).toMatch(/^telemark-zawody_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
  const text = await readFile(await download.path());

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(button(page, RESUME)).toHaveCount(0);
  await openCompetitionSetup(page, traits);
  const input = page.getByLabel("Wczytaj zawody z pliku");
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByText("To nie jest plik zawodów Telemarku.")).toBeVisible();
  await input.setInputFiles({ name: download.suggestedFilename(), mimeType: "application/json", buffer: text });
  await expect(page.getByText("Konkurs 1 z 2")).toBeVisible();
  expect(await page.locator(".contest-table").innerText()).toBe(board);
});
