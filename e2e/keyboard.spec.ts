import { OWN_HILL_SPECS } from "../src/hills/own-hills";
import { announcement, button, jumpCanvas, openJumpFromStart, openMenu, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { expectVisibleFocus, tabThrough } from "./support/focus";
import { playJump } from "./support/jump";
import { UPDATE_CHECK } from "./support/pwa";

test.skip(({ traits }) => !traits.desktop, "keyboard operation is checked where there is a keyboard");

test("the menu and the hill list are operated with the keyboard alone", async ({ page }) => {
  await openMenu(page);
  // The check for a new release, under the version at the top, comes first.
  expect(await tabThrough(page, 10)).toEqual([
    UPDATE_CHECK.button,
    TEXT.training,
    TEXT.competition,
    TEXT.replays,
    TEXT.outfit,
    TEXT.settings,
    TEXT.howTo,
    TEXT.install,
    TEXT.about,
    "Wczytaj pliki gry",
  ]);

  // Back to the first button; Enter opens the hill list and the focus moves to its heading.
  for (let i = 0; i < 8; i++) await page.keyboard.press("Shift+Tab");
  await expect(button(page, TEXT.training)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeFocused();
  expect(await expectVisibleFocus(page)).toBe(TEXT.hillListTitle);

  // Every own hill in the order of the list, then the way back.
  const visited = await tabThrough(page, OWN_HILL_SPECS.length + 1);
  expect(visited[0]).toContain(TEXT.builtInHill);
  expect(visited.slice(0, -1).map((name, i) => name.includes(OWN_HILL_SPECS[i]?.name ?? "?"))).toEqual(
    OWN_HILL_SPECS.map(() => true),
  );
  expect(visited.at(-1)).toBe(TEXT.back);

  // Space activates as well; back on the menu the focus is on its title, not lost to the body.
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Telemark" })).toBeFocused();
  expect(await expectVisibleFocus(page)).toBe("Telemark");
});

test("the outfit screen is operated with the keyboard alone", async ({ page }) => {
  await openMenu(page);
  for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
  await expect(button(page, TEXT.outfit)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: TEXT.outfitTitle })).toBeFocused();
  await expectVisibleFocus(page);

  // One tab stop per part of the outfit, on its chosen colour; the arrows change the colour.
  const trousers = page.getByRole("group", { name: "Spodnie" }).getByRole("radio");
  await page.keyboard.press("Tab");
  const chosen = await trousers.evaluateAll((radios) =>
    radios.findIndex((radio) => radio instanceof HTMLInputElement && radio.checked),
  );
  await expect(trousers.nth(chosen)).toBeFocused();
  await expectVisibleFocus(page);
  const count = await trousers.count();
  await page.keyboard.press("ArrowRight");
  await expect(trousers.nth((chosen + 1) % count)).toBeChecked();
  await expect(trousers.nth((chosen + 1) % count)).toBeFocused();
  await expectVisibleFocus(page);

  // The other four parts, then the button that leaves.
  const rest = await tabThrough(page, 5);
  expect(rest.at(-1)).toBe(TEXT.back);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Telemark" })).toBeFocused();
});

test("the jump screen is operated with the keyboard alone: Escape opens its menu and closes it", async ({ page }) => {
  await openMenu(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  // The picture takes the focus: its label is the description of the controls.
  await expect(jumpCanvas(page)).toBeFocused();
  await expectVisibleFocus(page);

  // Escape opens the menu, and the focus goes to its first button.
  await page.keyboard.press("Escape");
  const resume = button(page, TEXT.resume);
  await expect(resume).toBeFocused();
  await expectVisibleFocus(page);

  const visited = await tabThrough(page, 10);
  expect(visited).toEqual([
    expect.stringMatching(TEXT.jumpAgain),
    // Unavailable before the first jump has ended, but still reached, so a screen reader can tell it is there.
    // Each names its key, as the new jump does.
    expect.stringMatching(/^Obejrzyj ostatni skok \(P\)$/),
    expect.stringMatching(/^Zachowaj ostatni skok \(S\)$/),
    "Jak skakać",
    expect.stringMatching(TEXT.toHills),
    "Mniejsza czułość",
    "Większa czułość",
    expect.stringMatching(TEXT.scenery),
    expect.stringMatching(TEXT.weather),
    expect.stringMatching(TEXT.sound),
  ]);

  const sound = button(page, TEXT.sound);
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await expect(sound).toBeFocused();
  await expectVisibleFocus(page);

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  const scenery = button(page, TEXT.scenery);
  await expect(scenery).toBeFocused();
  const before = await scenery.textContent();
  await page.keyboard.press("Enter");
  await expect(scenery).not.toHaveText(before ?? "");
  await expect(scenery).toBeFocused();

  // The instructions open in place of the buttons, take the focus and speak of the keyboard and the mouse.
  await button(page, "Jak skakać").focus();
  await page.keyboard.press("Enter");
  const instructions = page.getByRole("heading", { name: "Jak skakać" });
  await expect(instructions).toBeFocused();
  await expect(page.getByText(/F11/)).toBeVisible();
  await expect(resume).toBeHidden();
  await button(page, TEXT.back).focus();
  await page.keyboard.press("Enter");
  await expect(resume).toBeVisible();

  // Escape closes the menu; the focus returns to the button of the menu, and Escape opens the menu again.
  await page.keyboard.press("Escape");
  await expect(resume).toBeHidden();
  await expect(button(page, TEXT.pause)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(resume).toBeFocused();

  // The hill list opens in the menu and takes the focus; the way out of the training is another position.
  await button(page, TEXT.toHills).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: TEXT.hillListTitle })).toBeFocused();
  expect(await expectVisibleFocus(page)).toBe(TEXT.hillListTitle);
  await button(page, TEXT.back).focus();
  await page.keyboard.press("Enter");
  await button(page, TEXT.toMainMenu).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Telemark" })).toBeFocused();
});

test("after a jump P watches it again and S keeps it, as the original's (P)owtórka; before that they do nothing", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  await page.keyboard.press("KeyS");
  await page.keyboard.press("KeyP");
  await expect(page.getByText("Ostatni skok jest zachowany")).toHaveCount(0);
  await expect(announcement(page)).not.toHaveText(/^Powtórka skoku\./);

  // Any end of a jump will do, a fall too.
  await playJump(page, traits);
  await page.keyboard.press("KeyS");
  await expect(page.getByRole("status").filter({ hasText: "Ostatni skok jest zachowany" })).toBeVisible();
  await page.keyboard.press("KeyP");
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
});
