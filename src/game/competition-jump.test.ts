import { describe, expect, it } from "vitest";
import { cpuJumpRunning, stepCpuFrame, type CpuJumpState } from "../sim/cpu-jump";
import { stepFrame } from "../sim/jump-sim";
import { cpuCompetitionJump, cpuJumpStart } from "./competition-jump";
import { OWN_HILLS } from "./hill-choice";
import { startComputedJump } from "./training-session";

const hill = OWN_HILLS[0];
const records = [
  { form1: 0.1, form2: -0.2, talent1: 0.5, talent2: 0.3, level: 4 },
  { form1: -0.4, form2: 0.4, talent1: -1.2, talent2: -0.8, level: 0 },
];

describe.runIf(hill)("a computer jump in a competition", () => {
  if (!hill) return;
  for (const [i, record] of records.entries()) {
    for (const seed of [1, 777, 123456]) {
      it(`is the run of the ported pilot and jump loop (jumper ${i}, seed ${seed})`, () => {
        // The reference: the loop of the comparison tests with the original, stepCpuFrame until cpuJumpRunning ends.
        const { start, pilot } = cpuJumpStart(hill, record, seed);
        const jump = startComputedJump(hill, start);
        let ref: CpuJumpState = { sim: jump.state, pilot };
        while (cpuJumpRunning(ref, jump.setup)) ref = stepCpuFrame(ref, jump.setup);
        const out = cpuCompetitionJump(hill, record, seed);
        const L = ref.sim.logic;
        expect(out.score).toEqual({ distanceM: L.distanceM, points: L.points, fell: L.fallType !== 0 });
        expect(out.start).toEqual(start);

        // Watched: the recorded inputs, looked up by frame as a replay looks them up, play the same frames to the touchdown, and the same score.
        let sim = startComputedJump(hill, out.start).state;

        while (!sim.logic.finished) {
          sim = stepFrame(
            sim,
            jump.setup,
            () => out.inputs[sim.logic.frame - 1] ?? { left: false, right: false, dy: 0 },
          );
        }
        expect(sim).toEqual(ref.sim);
        expect(out.inputs.length).toBeGreaterThanOrEqual(L.frame);
      });
    }
  }
});
