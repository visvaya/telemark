import { button, onEveryScreen, openHillList, openMenu, press, TEXT } from "./support/app";
import { expect, test } from "./support/fixtures";
import { boxOf, LAYOUT_SLACK_PX } from "./support/geometry";

const TITLES: Readonly<Record<string, string>> = {
  menu: "Telemark",
  outfit: "Strój · Telemark",
  "how to jump": "Jak skakać · Telemark",
  install: "Gra jako aplikacja · Telemark",
  about: "O grze · Telemark",
  settings: "Ustawienia · Telemark",
  replays: "Powtórki · Telemark",
  "hill list": "Wybór skoczni · Telemark",
  jump: "Skok: Ćwiczebna K90 · Telemark",
  "competition setup": "Konkurs · Telemark",
  "competition board": "Konkurs: Ćwiczebna K90 · Telemark",
  // Opening the controls of the jump screen does not change where the player is.
  "jump with the controls open": "Skok: Ćwiczebna K90 · Telemark",
};
const TRANSPARENT = "rgba(0, 0, 0, 0)";

test("each screen has its own title and the page background is set on the root element", async ({ page, traits }) => {
  const titles = new Map<string, string>();
  await onEveryScreen(page, traits, async (screen) => {
    await expect(page, `title of "${screen}"`).toHaveTitle(TITLES[screen] ?? "");
    titles.set(screen, await page.title());

    // The background painted beside the picture in landscape and behind an overscroll is the root's: it must
    // be a real colour and the same one the page content sits on, or a band of another colour shows.
    const colours = await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colours.root, `root background on "${screen}"`).not.toBe(TRANSPARENT);
    expect(colours.root).toBe(colours.body);
  });
  expect(
    new Set([
      titles.get("menu"),
      titles.get("outfit"),
      titles.get("how to jump"),
      titles.get("install"),
      titles.get("about"),
      titles.get("settings"),
      titles.get("hill list"),
      titles.get("jump"),
      titles.get("competition setup"),
      titles.get("competition board"),
    ]).size,
  ).toBe(10);
});

// A window too short for the menu and for the hill list, so that both scroll on every device profile. The hill
// list with its one built-in hill is about 270 pixels high on a narrow phone, so 300 would not do there.
const SHORT_WINDOW_HEIGHT_PX = 200;

test("a screen opens at its top, whatever the scroll position of the one before", async ({
  page,
  traits,
  viewport,
}) => {
  if (viewport) await page.setViewportSize({ width: viewport.width, height: SHORT_WINDOW_HEIGHT_PX });
  const scrolledBy = (): Promise<number> => page.evaluate(() => window.scrollY);
  const scrollToEnd = (): Promise<void> =>
    page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  const title = page.getByRole("heading", { name: "Telemark" });

  await openMenu(page);
  const titleAtFirst = await boxOf(title);
  await scrollToEnd();
  expect(await scrolledBy(), "the menu scrolls in a short window").toBeGreaterThan(0);

  await openHillList(page, traits);
  expect(await scrolledBy(), "scroll position of the hill list when it opens").toBe(0);
  await scrollToEnd();
  expect(await scrolledBy(), "the hill list scrolls in a short window").toBeGreaterThan(0);

  await press(button(page, TEXT.back), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  expect(await scrolledBy(), "scroll position of the menu when it opens again").toBe(0);
  expect(Math.abs((await boxOf(title)).y - titleAtFirst.y), "the title is where it was").toBeLessThanOrEqual(
    LAYOUT_SLACK_PX,
  );
});
