import {
  TEXT,
  announcement,
  button,
  closeJumpControls,
  openJumpControls,
  openJumpFromStart,
  openMenu,
  openReplays,
  press,
  replayRows,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { jumpAndGoOnEarly, playCleanJump } from "./support/jump";
import { asSet, setPatternSource } from "./support/typeset-text";

test("a record keeps its replay, a jump can be kept by hand, and both stay after a reload", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  const landed = await playCleanJump(page, traits);

  // Kept by hand once; a second time it is the same jump.
  await openJumpControls(page, traits);
  await press(button(page, TEXT.keepLast), traits);
  await expect(page.getByText("Ostatni skok jest zachowany")).toBeVisible();
  await press(button(page, TEXT.keepLast), traits);
  await expect(page.getByText("Ten skok jest już zachowany.")).toBeVisible();
  await closeJumpControls(page, traits);

  // A reload reads the replays back from the browser's store.
  await page.reload();
  await openReplays(page, traits);
  const distance = landed.distance ?? "";
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
  await expect(replayRows(page, "Rekordy skoczni")).toContainText(`${distance} m`);
  await expect(replayRows(page, "Rekordy skoczni")).toContainText(/\d+,\d\sKB/);
  await expect(replayRows(page, "Zachowane")).toHaveCount(1);

  // The hill list offers the record's replay beside the hill.
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.training), traits);
  await press(button(page, "Powtórka rekordu: Ćwiczebna K90"), traits);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
  await openReplays(page, traits);

  // Watched from here, it plays to the same landing.
  await press(replayRows(page, "Zachowane").getByRole("button", { name: "Obejrzyj" }), traits);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
  await expect(announcement(page)).toContainText(`Lądowanie: ${landed.distance ?? ""} metra`, { timeout: 30_000 });

  // Removed after a second press that confirms it.
  await openReplays(page, traits);
  const remove = replayRows(page, "Zachowane").getByRole("button", { name: /^(Usuń|Na pewno usunąć\?)$/ });
  await press(remove, traits);
  await expect(remove).toHaveText("Na pewno usunąć?");
  // What a press of a replay's button tells is shown under that replay, framed.
  await expect(replayRows(page, "Zachowane").locator(".framed-note")).toHaveText(
    new RegExp(`^${setPatternSource("Dotknij jeszcze raz")}`),
  );
  await press(remove, traits);
  await expect(page.getByRole("region", { name: "Zachowane" })).toHaveCount(0);
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
});

test("a record whose next jump was started before the jumper stopped keeps its replay after a reload", async ({
  page,
  traits,
}) => {
  test.skip(traits.touch, "the next jump is started with the mouse");
  await openJumpFromStart(page, traits);
  let distance: string | null = null;
  for (let attempt = 0; attempt < 3 && distance === null; attempt++) distance = await jumpAndGoOnEarly(page);
  expect(distance, "a clean landing followed by an early start of the next jump").not.toBeNull();

  // The jump that set the record was left while its jumper still slid out; its replay is stored all the same.
  await page.reload();
  await openReplays(page, traits);
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
  await expect(replayRows(page, "Rekordy skoczni")).toContainText(`${distance ?? ""} m`);
  await press(button(page, TEXT.back), traits);
  await press(button(page, TEXT.training), traits);
  await expect(button(page, "Powtórka rekordu: Ćwiczebna K90")).toBeVisible();
});

test("the replay screen keeps the last jumps and switches the clean-up on; the settings, the ghost", async ({
  page,
  traits,
}) => {
  await openReplays(page, traits);
  const recent = button(page, /^Zapisuj ostatnie skoki: /);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 5");
  await press(recent, traits);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 10");
  const age = page.getByRole("checkbox", { name: "Usuwaj powtórki starsze niż (dni)" });
  await age.check();
  await expect(page.getByRole("spinbutton", { name: "Usuwaj powtórki starsze niż (dni)" })).toHaveValue("30");
  // The ghost of the record is a setting of the jumps: on from the start, and it can be switched off.
  await openMenu(page);
  await press(button(page, TEXT.settings), traits);
  await expect(recent).toHaveCount(0);
  await press(button(page, "Duch rekordu: wł."), traits);
  await expect(button(page, "Duch rekordu: wył.")).toBeVisible();
  await openReplays(page, traits);
  await expect(recent).toHaveText("Zapisuj ostatnie skoki: 10");
  await expect(age).toBeChecked();
  await openMenu(page);
  await press(button(page, TEXT.settings), traits);
  await expect(button(page, "Duch rekordu: wył.")).toBeVisible();
});

test("replays go out to a file and come back from it, each once", async ({ page, traits }) => {
  await openJumpFromStart(page, traits);
  await playCleanJump(page, traits);
  await openReplays(page, traits);
  await expect(replayRows(page, "Rekordy skoczni")).toHaveCount(1);
  // The last jumps are kept from the start: the same jump is there a second time.
  await expect(replayRows(page, "Ostatnie skoki")).toHaveCount(1);
  // A jump on this game's own hill has no file of the original: the original does not know the hill.
  await expect(page.getByRole("button", { name: /^Eksportuj do pliku DSJ2/ })).toHaveCount(0);
  // The export to files of the original is not offered for now.
  await expect(button(page, /do \.rpl/)).toHaveCount(0);

  // All selected, the button lets go of them all; then all again.
  await press(button(page, "Zaznacz wszystkie"), traits);
  await press(button(page, "Odznacz wszystkie"), traits);
  await expect(button(page, "Eksportuj zaznaczone (0)")).toBeVisible();
  await press(button(page, "Zaznacz wszystkie"), traits);
  const exported = page.waitForEvent("download");
  await press(button(page, "Eksportuj zaznaczone (2)"), traits);
  const download = await exported;
  // Two replays go out as an archive with a file for each, named after the moment of the export to the second.
  expect(download.suggestedFilename()).toMatch(/^telemark-powtorki_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);
  const path = await download.path();

  // Read back, the jump goes among the read ones, once; a second time it is there already.
  const chooser = page.locator('input[type="file"]');
  await chooser.setInputFiles(path);
  await expect(page.getByRole("status")).toHaveText(asSet("Wczytano powtórek: 1; już zachowanych: 1."));
  await expect(replayRows(page, "Wczytane")).toHaveCount(1);
  await expect(page.locator(".framed-note")).toHaveText(asSet("Wczytano powtórek: 1; już zachowanych: 1."));
  await chooser.setInputFiles(path);
  await expect(page.getByRole("status")).toHaveText(asSet("Wczytano powtórek: 0; już zachowanych: 2."));

  // The selected ones go after a second press.
  await press(button(page, "Zaznacz wszystkie"), traits);
  const removeSelected = button(page, /^(Usuń zaznaczone|Na pewno usunąć) /);
  await press(removeSelected, traits);
  await expect(removeSelected).toHaveText("Na pewno usunąć 3?");
  await press(removeSelected, traits);
  await expect(page.getByText("Nie ma jeszcze zapisanych powtórek.")).toBeVisible();
});
