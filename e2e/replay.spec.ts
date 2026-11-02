import {
  TEXT,
  announcement,
  button,
  closeJumpControls,
  jumpCanvas,
  openJumpControls,
  openJumpFromStart,
  press,
  storedSave,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { playCleanJump } from "./support/jump";

/** A replay at full tempo reaches the touchdown a few seconds after it starts; a slow machine gets more. */
const TOUCHDOWN_TIMEOUT_MS = 30_000;
/** Long enough for an unpaused replay to have moved past its start. */
const PAUSE_HOLD_MS = 2500;

test("the last jump plays again to the same landing, pauses on a press of the picture and leaves for a new jump", async ({
  page,
  traits,
}) => {
  await openJumpFromStart(page, traits);
  // Nothing to watch before a jump has ended; the ghost of the record can be switched here too.
  await openJumpControls(page, traits);
  await expect(button(page, TEXT.watchReplay)).toBeDisabled();
  await expect(button(page, "Duch rekordu: wł.")).toBeVisible();
  await closeJumpControls(page, traits);

  const landed = await playCleanJump(page, traits);
  const saved = await storedSave(page);

  const before = await jumpCanvas(page).boundingBox();
  await openJumpControls(page, traits);
  await press(button(page, TEXT.watchReplay), traits);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
  // In portrait the empty zones leave the layout and the picture, as large as before, is centred.
  const viewport = page.viewportSize();
  if (traits.touch && viewport && viewport.height > viewport.width && before) {
    await expect
      .poll(async () => {
        const box = await jumpCanvas(page).boundingBox();
        return box ? Math.abs(box.y + box.height / 2 - viewport.height / 2) : Infinity;
      })
      .toBeLessThan(viewport.height * 0.08);
    expect((await jumpCanvas(page).boundingBox())?.width).toBeCloseTo(before.width, 0);
  }

  // Paused at once: the replay stays before the gate as long as it is held.
  await press(jumpCanvas(page), traits);
  await page.waitForTimeout(PAUSE_HOLD_MS);
  await expect(announcement(page)).toHaveText(/^Powtórka skoku\./);
  // The slider under the picture goes to a moment of the replay, and back to its start.
  const slider = page.getByRole("slider", { name: "Moment powtórki" });
  await expect(slider).toHaveAttribute("aria-valuetext", /^\d+,\d s z \d+,\d s$/);
  const length = Number(await slider.getAttribute("max"));
  expect(length).toBeGreaterThan(100);
  await slider.fill(String(Math.round(length / 2)));
  await expect(slider).not.toHaveAttribute("aria-valuetext", /^0,0 s z /);
  await slider.fill("1");
  await expect(slider).toHaveAttribute("aria-valuetext", /^0,0 s z /);
  await press(jumpCanvas(page), traits);

  await expect(announcement(page)).toContainText(`Lądowanie: ${landed.distance ?? ""} metra`, {
    timeout: TOUCHDOWN_TIMEOUT_MS,
  });
  // A replay is not a jump: the record stays as the jump left it.
  expect(await storedSave(page)).toEqual(saved);

  // The menu of a replay holds what the replay needs; the steering and the jumping are left out of it.
  await press(button(page, TEXT.pause), traits);
  await expect(button(page, TEXT.replayResume)).toBeFocused();
  for (const absent of [TEXT.jumpAgain, TEXT.howTo, TEXT.toHills, TEXT.watchReplay, "Duch rekordu: wł."]) {
    await expect(button(page, absent)).toHaveCount(0);
  }
  await expect(page.getByRole("group", { name: /czułość/i })).toHaveCount(0);
  // The player's own jump can be kept from its replay.
  await press(button(page, TEXT.keepLast), traits);
  await expect(page.getByText("Ostatni skok jest zachowany")).toBeVisible();
  // The menu only shows or hides the slider.
  await press(button(page, "Suwak powtórki: wł."), traits);
  await expect(button(page, "Suwak powtórki: wył.")).toBeVisible();
  await expect(slider).toHaveCount(0);
  await press(button(page, TEXT.replaySpeed), traits);
  await expect(button(page, TEXT.replaySpeed)).toHaveText("Tempo: 1/2");
  await press(button(page, TEXT.replayEnd), traits);
  await expect(announcement(page)).toHaveText("");
  await openJumpControls(page, traits);
  await expect(button(page, TEXT.jumpAgain)).toBeVisible();
  await expect(button(page, TEXT.watchReplay)).toBeEnabled();
});
