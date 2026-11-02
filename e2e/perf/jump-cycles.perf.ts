import type { Page } from "@playwright/test";
import { button, openHillList, openJump, openJumpControls, openJumpFromStart, press, TEXT } from "../support/app";
import { expect, test, type DeviceTraits } from "../support/fixtures";
import { restartJump, startWithMouse, waitForPageTime } from "../support/jump";
import { reportMeasurement } from "../support/measurement-log";
import { fixLook, memorySample, protocolSession } from "../support/perf";
import { PERF_BUDGET } from "./perf-budget";

// What the page holds after many jumps: a screen that leaves listeners, nodes or memory behind each time it is
// opened shows as growth between two samples taken in the same place of the game.

const WARM_UP_CYCLES = 3;
const MEASURED_CYCLES = 20;
/** In every second cycle the jump is started and runs this long before it is left. */
const RUNNING_JUMP_MS = 1000;
/** Twenty-three cycles of a few seconds each, some with a running jump. */
const TEST_TIMEOUT_MS = 360_000;

/**
 * A new jump from the menu of the jump screen, out to the main menu, and onto the hill again. With `running`
 * the jump is started and left while the jumper is on the inrun.
 */
async function cycle(page: Page, traits: DeviceTraits, running: boolean): Promise<void> {
  await restartJump(page, traits);
  if (running) {
    const startedAt = await startWithMouse(page);
    await waitForPageTime(page, startedAt + RUNNING_JUMP_MS);
    // Escape is how a running jump is left; the pointer may be captured by the picture.
    await page.keyboard.press("Escape");
    await expect(button(page, TEXT.resume)).toBeVisible();
  } else {
    await openJumpControls(page, traits);
  }
  await press(button(page, TEXT.toMainMenu), traits);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await openHillList(page, traits);
  await openJump(page, traits);
}

test("a series of jumps leaves no listeners or nodes behind and the heap within its budget", async ({
  page,
  traits,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await fixLook(page.context());
  const session = await protocolSession(page);
  await openJumpFromStart(page, traits);
  for (let index = 0; index < WARM_UP_CYCLES; index++) await cycle(page, traits, index % 2 === 1);

  const before = await memorySample(session);
  for (let index = 0; index < MEASURED_CYCLES / 2; index++) await cycle(page, traits, index % 2 === 1);
  const halfway = await memorySample(session);
  for (let index = 0; index < MEASURED_CYCLES / 2; index++) await cycle(page, traits, index % 2 === 1);
  const after = await memorySample(session);

  const growth = {
    heapUsedKib: after.heapUsedKib - before.heapUsedKib,
    eventListeners: after.eventListeners - before.eventListeners,
    nodes: after.nodes - before.nodes,
    documents: after.documents - before.documents,
  };
  await reportMeasurement(testInfo, "jump-cycles", {
    warmUpCycles: WARM_UP_CYCLES,
    cycles: MEASURED_CYCLES,
    before,
    halfway,
    after,
    growth,
    perCycle: {
      heapUsedKib: growth.heapUsedKib / MEASURED_CYCLES,
      eventListeners: growth.eventListeners / MEASURED_CYCLES,
      nodes: growth.nodes / MEASURED_CYCLES,
    },
  });

  expect(growth.eventListeners, "event listeners added by the cycles").toBeLessThanOrEqual(
    PERF_BUDGET.CYCLES_EVENT_LISTENER_GROWTH,
  );
  expect(growth.nodes, "nodes added by the cycles").toBeLessThanOrEqual(PERF_BUDGET.CYCLES_NODE_GROWTH);
  expect(growth.heapUsedKib, "heap growth over the cycles").toBeLessThanOrEqual(PERF_BUDGET.CYCLES_HEAP_GROWTH_KIB);
});
