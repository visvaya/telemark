import {
  BUILT_IN_HILL_ID,
  builtInHill,
  leaveJumpForHills,
  openHillList,
  openJumpFromStart,
  openMenu,
  storedSave,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { playUntilLanded } from "./support/jump";

declare global {
  interface Window {
    /** Every text the jump screen gave the screen reader, in order. */
    heardAnnouncements?: string[];
  }
}

test("a whole jump ends in a record that the hill list shows and a reload keeps", async ({ page, traits }) => {
  await openJumpFromStart(page, traits);
  // Every text the screen reader is given, in order, to see what it hears at touchdown and not only at the end.
  await page.evaluate(() => {
    const region = document.querySelector("p[aria-live]");
    if (region === null) throw new Error("The jump screen has no live region");
    const heard: string[] = [];
    window.heardAnnouncements = heard;
    new MutationObserver(() => heard.push(region.textContent)).observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

  const outcomes = await playUntilLanded(page, traits);
  const landed = outcomes.at(-1);
  expect(landed?.kind).toBe("landed");
  // The announcement reads the notes and the points with a decimal comma, like the distance.
  expect(landed?.announcement).toMatch(
    /Noty: (\d+,\d; ){4}\d+,\d\. Wynik: -?\d+,\d punktu\. Nowy rekord na tym urządzeniu\./,
  );
  // The record is told together with the distance, while the jumper still slides out, before the notes.
  const heard = await page.evaluate(() => window.heardAnnouncements ?? []);
  expect(heard).toContain(`Lądowanie: ${landed?.distance ?? ""} metra. Nowy rekord na tym urządzeniu.`);

  // The list writes the same distance with a decimal point, as the picture does.
  const record = `rekord ${landed?.distance ?? ""} m`;
  await leaveJumpForHills(page, traits);
  await expect(builtInHill(page)).toContainText(record);
  expect(await storedSave(page)).toMatchObject({
    records: { [BUILT_IN_HILL_ID]: { distanceM: expect.any(Number), points: expect.any(Number) } },
  });

  await openMenu(page);
  await openHillList(page, traits);
  await expect(builtInHill(page)).toContainText(record);
});
