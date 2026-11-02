import { describe, expect, it } from "vitest";
import { spreadOf } from "../game/frame-meter";
import { OWN_HILLS, type HillChoice } from "../game/hill-choice";
import {
  isJumpOver,
  presentationFrame,
  startTrainingJump,
  stepTrainingJump,
  type TrainingJump,
} from "../game/training-session";
import type { FrameInput } from "../sim/jump-logic";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import { VIEW_HEIGHT_PX, VIEW_MAX_WIDTH_PX, drawJumpView, type Scenery } from "./jump-view";

/*
 * Trip wires for a regression by an order of magnitude (a loop inside a loop, an allocation per pixel), not
 * a promise of a smooth game: each budget is ten times the median measured on 2026-10-13, rounded up, on
 * a laptop with an Intel Core i7-6700HQ (Node 24, a browser and other work running beside the test). Three
 * runs gave 0.025, 0.026 and 0.032 ms for a simulation step and 21.0, 18.6 and 18.7 ms for a drawing of the
 * widest picture.
 */
const SIM_STEP_BUDGET_MS = 0.3;
const DRAW_BUDGET_MS = 200;

const STEPS_PER_BATCH = 100;
const MIN_SIM_STEPS = 2000;
const MIN_DRAWN_FRAMES = 300;
/** Every third frame of a jump is drawn, so the frames come from all of its phases. */
const DRAW_EVERY_FRAMES = 3;
/** How long the judges' notes are followed after the jumper has stopped. */
const FRAMES_AFTER_END = 200;
const FRAME_LIMIT = 4000;
/** The widest picture the game draws, in the weather that paints the most. */
const SCENERY: Scenery = { lighting: "night", snowfall: true, fog: true };

/** A jump on a hill with a scripted player who takes off and lands. */
function scriptedJump(hill: HillChoice, seed: number): { jump: () => TrainingJump; step: () => void } {
  let jump = startTrainingJump(hill, seed);
  const bot = makeBot(
    hill.profile,
    { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: () => 0 },
    () => jump.state,
  );
  return {
    jump: () => jump,
    step: () => {
      const input: FrameInput = bot(jump.state.logic.frame + 1);
      jump = stepTrainingJump(jump, input);
    },
  };
}

/** Time of each whole batch of simulation steps, over as many jumps as it takes; a batch a jump ends in is left out. */
function simBatchTimesMs(hill: HillChoice): number[] {
  const batchesMs: number[] = [];
  for (let seed = 1; batchesMs.length * STEPS_PER_BATCH < MIN_SIM_STEPS; seed++) {
    if (seed > 50) throw new Error("the scripted jumps are too short to measure");
    const { jump, step } = scriptedJump(hill, seed);
    while (!isJumpOver(jump())) {
      const began = performance.now();
      for (let i = 0; i < STEPS_PER_BATCH; i++) step();
      const took = performance.now() - began;
      if (!isJumpOver(jump())) batchesMs.push(took);
    }
  }
  return batchesMs;
}

/** Time of each drawing of the widest picture, through one jump and the notes after it. */
function drawTimesMs(hill: HillChoice): number[] {
  const fb = new FrameBuffer(VIEW_MAX_WIDTH_PX, VIEW_HEIGHT_PX);
  const { jump, step } = scriptedJump(hill, 7);
  const timesMs: number[] = [];
  for (let f = 0; f < FRAME_LIMIT && jump().framesAfterEnd < FRAMES_AFTER_END; f++) {
    step();
    if (f % DRAW_EVERY_FRAMES !== 0) continue;
    const current = jump();
    const began = performance.now();
    drawJumpView(fb, {
      profile: hill.profile,
      kPointM: hill.kPointM,
      look: hill.look,
      hillName: hill.name,
      playerName: "GRACZ 1",
      state: current.state,
      controls: "touch",
      frame: presentationFrame(current),
      over: isJumpOver(current),
      recordM: 80,
      newRecord: true,
      scenery: SCENERY,
      windDriftM: current.windDriftM,
    });
    timesMs.push(performance.now() - began);
  }
  return timesMs;
}

/** Every own hill: each one's scenery is drawn within the budget. */
const HILLS: readonly { id: string; hill: HillChoice }[] = OWN_HILLS.map((hill) => ({ id: hill.id, hill }));

describe.each(HILLS)("time budgets of a frame on $id", ({ hill }) => {
  it("steps the simulation within its budget", () => {
    const batchesMs = simBatchTimesMs(hill);
    expect(batchesMs.length * STEPS_PER_BATCH).toBeGreaterThanOrEqual(MIN_SIM_STEPS);
    // The fastest batch: under coverage on a loaded machine the median of the batches passed the budget (0.40 ms
    // on 2026-11-02), while a regression by an order of magnitude slows every batch.
    expect(Math.min(...batchesMs) / STEPS_PER_BATCH).toBeLessThanOrEqual(SIM_STEP_BUDGET_MS);
  }, 60_000);

  it("draws the widest picture within its budget", () => {
    const timesMs = drawTimesMs(hill);
    expect(timesMs.length).toBeGreaterThanOrEqual(MIN_DRAWN_FRAMES);
    expect(spreadOf(timesMs).median).toBeLessThanOrEqual(DRAW_BUDGET_MS);
  }, 60_000);
});
