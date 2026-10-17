import type { Locator, Page } from "@playwright/test";
import { expect, type DeviceTraits } from "./fixtures";

/** Text of the interface the tests look for, as the screens write it. */
export const TEXT = {
  menuHeading: "Główne menu",
  training: "Trening",
  competition: "Konkurs",
  contestStart: "Rozpocznij konkurs",
  contestNext: /^Dalej: skacze /,
  contestAbandon: "Przerwij konkurs",
  contestAbandonYes: "Tak, przerwij",
  replays: "Powtórki",
  outfit: "Strój",
  howTo: "Jak skakać",
  about: "O grze",
  settings: "Ustawienia",
  install: "Gra jako aplikacja",
  back: "Wstecz",
  hillListTitle: "Wybierz skocznię do treningu",
  outfitTitle: "Edycja kolorów stroju",
  builtInHill: "Ćwiczebna",
  pause: "Pauza i ustawienia",
  resume: "Wróć do gry",
  jumpAgain: /^Skocz jeszcze raz/,
  watchReplay: /^Obejrzyj ostatni skok/,
  replaySpeed: /^Tempo: /,
  replayFromStart: /^Obejrzyj od początku/,
  replayEnd: "Wróć do skakania",
  replayResume: "Wróć do powtórki",
  keepLast: /^Zachowaj ostatni skok/,
  toHills: /^Zmień skocznię/,
  toMainMenu: "Wyjdź do menu głównego",
  scenery: /^Pora dnia: /,
  weather: /^Pogoda: /,
  sound: /^Dźwięk: /,
  leftPad: /^Lewy przycisk/,
  rightPad: "Prawy przycisk",
} as const;

/** Key of the save in localStorage and the id of the only hill available without the player's files. */
const SAVE_KEY = "telemark.save";
export const BUILT_IN_HILL_ID = "own-3";

export const jumpCanvas = (page: Page): Locator => page.getByRole("img", { name: /^Skok na skoczni/ });
export const announcement = (page: Page): Locator => page.locator("p[aria-live]");
/** The built-in hill on the hill list (not the button beside it that plays the replay of its record). */
export const builtInHill = (page: Page): Locator =>
  page.getByRole("button", { name: new RegExp(TEXT.builtInHill) }).filter({ hasNotText: "Powtórka" });
export const button = (page: Page, name: RegExp | string): Locator => page.getByRole("button", { name });

/** Activates a control the way the device does: a tap on a touch screen, a click elsewhere. */
export async function press(target: Locator, traits: DeviceTraits): Promise<void> {
  await (traits.touch ? target.tap() : target.click());
}

/** Geometry is measured only after the web fonts are in, or the text boxes still have fallback metrics. */
export async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Loads the game from the start, which is also how a test reloads it. One navigation per load: a second one
 * right after the first cuts the icon requests of the page it leaves, and Firefox reports a request cut while
 * the service worker answers it as an error of the worker. `address` is for the tests of what the query string
 * of the page switches on.
 */
export async function openMenu(page: Page, address = "/"): Promise<void> {
  await page.goto(address);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await fontsReady(page);
}

export async function openHillList(page: Page, traits: DeviceTraits): Promise<void> {
  await press(button(page, TEXT.training), traits);
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeVisible();
}

export async function openOutfit(page: Page, traits: DeviceTraits): Promise<void> {
  await press(button(page, TEXT.outfit), traits);
  await expect(page.getByRole("heading", { name: TEXT.outfitTitle })).toBeVisible();
}

/** From the hill list to the jump screen of the built-in hill. */
export async function openJump(page: Page, traits: DeviceTraits): Promise<void> {
  await press(builtInHill(page), traits);
  await expect(jumpCanvas(page)).toBeVisible();
}

/** From a fresh page straight to the jump screen. */
export async function openJumpFromStart(page: Page, traits: DeviceTraits, address = "/"): Promise<void> {
  await openMenu(page, address);
  await openHillList(page, traits);
  await openJump(page, traits);
}

/** The rows of one group of the replays screen. */
export const replayRows = (page: Page, group: string): Locator =>
  page.getByRole("region", { name: group }).getByRole("listitem");

/** From a fresh page to the replays screen. */
export async function openReplays(page: Page, traits: DeviceTraits): Promise<void> {
  await openMenu(page);
  await press(button(page, TEXT.replays), traits);
  await expect(page.getByRole("heading", { name: TEXT.replays })).toBeVisible();
}

/** The buttons of the jump screen sit in a menu behind the pause button, on every device. */
export async function openJumpControls(page: Page, traits: DeviceTraits): Promise<void> {
  await press(button(page, TEXT.pause), traits);
  await expect(button(page, TEXT.resume)).toBeVisible();
}

export async function closeJumpControls(page: Page, traits: DeviceTraits): Promise<void> {
  await press(button(page, TEXT.resume), traits);
  await expect(button(page, TEXT.resume)).toBeHidden();
}

/** Opens the list of hills from the menu of the jump screen; the list is shown over the jump. */
export async function leaveJumpForHills(page: Page, traits: DeviceTraits): Promise<void> {
  await openJumpControls(page, traits);
  await press(button(page, TEXT.toHills), traits);
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeVisible();
}

/** From the menu to the setup of a competition. */
export async function openCompetitionSetup(page: Page, traits: DeviceTraits): Promise<void> {
  await press(page.getByRole("button", { name: TEXT.competition, exact: true }), traits);
  await expect(page.getByRole("heading", { name: TEXT.competition, exact: true })).toBeVisible();
}

/** The save as stored, or null before the first write. */
export async function storedSave(page: Page): Promise<unknown> {
  const json = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  return json === null ? null : (JSON.parse(json) as unknown);
}

type ScreenCheck = (screen: string) => Promise<void>;

/**
 * Opens the menu, the outfit screen, the two screens of instructions, the one about the game, the settings, the
 * replays, the setup and the board of a competition, and the hill list
 * in turn and runs `check` on each; ends on the hill list.
 */
export async function onEachMenuScreen(page: Page, traits: DeviceTraits, check: ScreenCheck): Promise<void> {
  await openMenu(page);
  await check("menu");
  await openOutfit(page, traits);
  await check("outfit");
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.howTo), traits);
  await expect(page.getByRole("heading", { name: TEXT.howTo })).toBeVisible();
  await check("how to jump");
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.install), traits);
  await expect(page.getByRole("heading", { name: TEXT.install })).toBeVisible();
  await check("install");
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.about), traits);
  await expect(page.getByRole("heading", { name: TEXT.about })).toBeVisible();
  await check("about");
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.settings), traits);
  await expect(page.getByRole("heading", { name: TEXT.settings })).toBeVisible();
  await check("settings");
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.replays), traits);
  await expect(page.getByRole("heading", { name: TEXT.replays })).toBeVisible();
  await check("replays");
  await press(button(page, TEXT.back), traits);
  await openCompetitionSetup(page, traits);
  await check("competition setup");
  await press(button(page, TEXT.contestStart), traits);
  await expect(button(page, TEXT.contestNext)).toBeVisible();
  await check("competition board");
  await press(button(page, TEXT.contestAbandon), traits);
  await press(button(page, TEXT.contestAbandonYes), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await openHillList(page, traits);
  await check("hill list");
}

/** As `onEachMenuScreen`, then the jump screen, also with its controls open. */
export async function onEveryScreen(page: Page, traits: DeviceTraits, check: ScreenCheck): Promise<void> {
  await onEachMenuScreen(page, traits, check);
  await openJump(page, traits);
  await check("jump");
  await openJumpControls(page, traits);
  await check("jump with the controls open");
  await closeJumpControls(page, traits);
}
