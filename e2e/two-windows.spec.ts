import {
  TEXT,
  button,
  closeJumpControls,
  openHillList,
  openJump,
  openJumpControls,
  openJumpFromStart,
  openMenu,
  openReplays,
  press,
  replayRows,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { playUntilLanded } from "./support/jump";

const metres = (distance: string | undefined): number => Number((distance ?? "0").replace(",", "."));

test("two windows of the game keep each other's replays and records", async ({ page, context, traits }) => {
  // The second window opens first, so it holds the shelf and the save from before the first window's jump.
  const second = await context.newPage();
  await openMenu(second);

  // A player jumps in the window in front: one behind it gets its animation frames throttled, and the jump with them.
  await page.bringToFront();
  await openJumpFromStart(page, traits);
  const first = (await playUntilLanded(page, traits)).at(-1);
  expect(first?.kind).toBe("landed");

  // The second window jumps too and keeps its jump by hand.
  await second.bringToFront();
  await openHillList(second, traits);
  await openJump(second, traits);
  const other = (await playUntilLanded(second, traits)).at(-1);
  expect(other?.kind).toBe("landed");
  await openJumpControls(second, traits);
  await press(button(second, TEXT.keepLast), traits);
  await expect(second.getByText("Ostatni skok jest zachowany")).toBeVisible();
  await closeJumpControls(second, traits);

  // The record stands at the longer of the two landings, and its replay is the one of that jump.
  const record = [first?.distance ?? "", other?.distance ?? ""].toSorted((a, b) => metres(b) - metres(a))[0] ?? "";
  for (const window of [page, second]) {
    await window.bringToFront();
    await window.reload();
    await openReplays(window, traits);
    await expect(replayRows(window, "Rekordy skoczni")).toHaveCount(1);
    await expect(replayRows(window, "Rekordy skoczni")).toContainText(`${record} m`);
    await expect(replayRows(window, "Zachowane")).toHaveCount(1);
    await expect(
      replayRows(window, "Ostatnie skoki").filter({ hasText: `${first?.distance ?? ""} m` }),
    ).not.toHaveCount(0);
    await press(button(window, TEXT.back), traits);
    await press(button(window, TEXT.training), traits);
    await expect(button(window, /^Powtórka rekordu: /)).toHaveCount(1);
  }
});
