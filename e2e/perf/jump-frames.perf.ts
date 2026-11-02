import type { Page, TestInfo } from "@playwright/test";
import { openJumpFromStart } from "../support/app";
import { expect, test, type DeviceTraits } from "../support/fixtures";
import { pageNow, playJump } from "../support/jump";
import { medianOf, reportMeasurement } from "../support/measurement-log";
import {
  CPU_SLOWDOWN_FACTOR,
  DIAGNOSTICS_ADDRESS,
  fixLook,
  frameStats,
  longTasksSince,
  protocolSession,
  slowProcessor,
  watchLongTasks,
} from "../support/perf";
import { PERF_BUDGET } from "./perf-budget";

// One whole jump, from the gate until the jumper has stopped, with the game measuring its own frames: on a
// processor slowed down and, for comparison in the same log, at full speed.

const MS_PER_S = 1000;
const FULL_SPEED = 1;
/**
 * At full speed the jump is played this many times and the middle jump is the measure: one stall of the
 * machine during one jump (a frame more than 114 ms late) is not the game dropping steps.
 */
const FULL_SPEED_JUMPS = 3;

interface JumpMeasurement {
  droppedSteps: number;
  cappedFrames: number;
  longFrames: number;
  longTasks: number;
  longestTaskMs: number;
  intervalP95Ms: number;
  simP95Ms: number;
  drawP95Ms: number;
}

async function prepare(page: Page, slowdown: number): Promise<void> {
  await fixLook(page.context());
  await watchLongTasks(page.context());
  await slowProcessor(await protocolSession(page), slowdown);
}

/** Loads the game anew, so the counters start from nothing, and plays one jump. */
async function measureJump(
  page: Page,
  traits: DeviceTraits,
  testInfo: TestInfo,
  slowdown: number,
): Promise<JumpMeasurement> {
  await openJumpFromStart(page, traits, DIAGNOSTICS_ADDRESS);

  const jumpBeganMs = await pageNow(page);
  // Any end of the jump is a whole jump; on a slowed processor the presses may come too late for a landing.
  const outcome = await playJump(page, traits);
  const stats = await frameStats(page);
  const tasks = await longTasksSince(page, jumpBeganMs);
  const longest = tasks.toSorted((a, b) => b.durationMs - a.durationMs)[0];
  const longestTaskMs = longest?.durationMs ?? 0;

  await reportMeasurement(testInfo, slowdown === FULL_SPEED ? "jump-full-speed" : "jump-slowed", {
    cpuSlowdown: slowdown,
    outcome: outcome.kind,
    framesPerSecond: stats.intervalMs.median > 0 ? MS_PER_S / stats.intervalMs.median : 0,
    stats,
    longTasks: tasks.length,
    longestTaskMs,
    // Counted from the moment the jump screen stood, before the press that starts the jump.
    longestTaskAfterMs: longest === undefined ? null : longest.startMs - jumpBeganMs,
    longTaskTotalMs: tasks.reduce((sum, task) => sum + task.durationMs, 0),
  });
  expect(stats.frames, "frames the game counted").toBeGreaterThan(0);
  return {
    droppedSteps: stats.droppedSteps,
    cappedFrames: stats.cappedFrames,
    longFrames: stats.longFrames,
    longTasks: tasks.length,
    longestTaskMs,
    intervalP95Ms: stats.intervalMs.p95,
    simP95Ms: stats.simMs.p95,
    drawP95Ms: stats.drawMs.p95,
  };
}

function expectWithinSlowedBudget(measured: JumpMeasurement): void {
  expect(measured.droppedSteps, "dropped simulation steps").toBeLessThanOrEqual(PERF_BUDGET.SLOWED_DROPPED_STEPS);
  expect(measured.longFrames, "long frames").toBeLessThanOrEqual(PERF_BUDGET.SLOWED_LONG_FRAMES);
  expect(measured.longTasks, "long tasks").toBeLessThanOrEqual(PERF_BUDGET.SLOWED_LONG_TASKS);
  expect(measured.longestTaskMs, "the longest task").toBeLessThanOrEqual(PERF_BUDGET.SLOWED_LONGEST_TASK_MS);
  expect(measured.intervalP95Ms, "95th percentile of the frame interval").toBeLessThanOrEqual(
    PERF_BUDGET.SLOWED_FRAME_INTERVAL_P95_MS,
  );
  expect(measured.simP95Ms, "95th percentile of the simulation time").toBeLessThanOrEqual(
    PERF_BUDGET.SLOWED_SIM_P95_MS,
  );
  expect(measured.drawP95Ms, "95th percentile of the drawing time").toBeLessThanOrEqual(PERF_BUDGET.SLOWED_DRAW_P95_MS);
}

test("a jump on a processor slowed down stays within the budget of its frames", async ({ page, traits }, testInfo) => {
  await prepare(page, CPU_SLOWDOWN_FACTOR);
  expectWithinSlowedBudget(await measureJump(page, traits, testInfo, CPU_SLOWDOWN_FACTOR));
});

test("the same jump at full speed, for comparison, drops no more than the one frame measured", async ({
  page,
  traits,
}, testInfo) => {
  // Three whole jumps in real time.
  test.slow();
  await prepare(page, FULL_SPEED);
  const jumps: JumpMeasurement[] = [];
  for (let jump = 0; jump < FULL_SPEED_JUMPS; jump++) {
    const measured = await measureJump(page, traits, testInfo, FULL_SPEED);
    expectWithinSlowedBudget(measured);
    jumps.push(measured);
  }
  const droppedSteps = jumps.map((jump) => jump.droppedSteps);
  const cappedFrames = jumps.map((jump) => jump.cappedFrames);
  await reportMeasurement(testInfo, "jump-full-speed-dropped-steps", {
    droppedSteps,
    droppedStepsMedian: medianOf(droppedSteps),
    cappedFrames,
    cappedFramesMedian: medianOf(cappedFrames),
  });
  expect(medianOf(cappedFrames), "frames that dropped time at full speed, median of the jumps").toBeLessThanOrEqual(
    PERF_BUDGET.FULL_SPEED_CAPPED_FRAMES,
  );
  expect(medianOf(droppedSteps), "dropped simulation steps at full speed, median of the jumps").toBeLessThanOrEqual(
    PERF_BUDGET.FULL_SPEED_DROPPED_STEPS,
  );
});
