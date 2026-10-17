import { BorlandRandom } from "../sim/borland-random";
import { pilotView } from "../sim/cpu-jump";
import { cpuPilotInput, setupCpuPilot, type CpuJumperRecord, type CpuPilotState } from "../sim/cpu-pilot";
import type { FrameInput } from "../sim/jump-logic";
import { jumpRunning, stepFrame } from "../sim/jump-sim";
import { FRAME_DT_S } from "../sim/physics-constants";
import { createStartWind } from "../sim/training-wind";
import type { JumpScore } from "./competition";
import type { HillChoice } from "./hill-choice";
import { startComputedJump, type RecordedStart } from "./training-session";

/** A watched jump that does not stop within this is cut here (a jump is 900 to 1600 frames). */
const MAX_CPU_JUMP_FRAMES = 6000;

/** A computer jumper's competition jump: its score, and what plays it again in the picture. */
export interface CpuJumpOutcome {
  score: JumpScore;
  start: RecordedStart;
  /** The pilot's input of every frame, the first for frame 1, up to where the jumper stops. */
  inputs: readonly FrameInput[];
}

/**
 * The start of a computer jump from `seed`: the wind of a training jump, then the pilot's setup, which the
 * original runs after Randomize and before it keeps the generator's state for the replay.
 */
export function cpuJumpStart(
  hill: HillChoice,
  record: CpuJumperRecord,
  seed: number,
): { start: RecordedStart; pilot: CpuPilotState } {
  const rng = new BorlandRandom(seed);
  const wind = createStartWind(rng);
  const pilot = setupCpuPilot(record, hill.kPointM, hill.profile, rng);
  return { start: { wind, randomSeed: rng.seed }, pilot };
}

/**
 * A computer jumper's jump, computed without drawing as the original computes an unwatched one: the score is the
 * one of the frame the result is ready in (the touchdown). The jump then goes on to where the jumper stops, so a
 * watched jump plays the same frames from the same inputs.
 */
export function cpuCompetitionJump(hill: HillChoice, record: CpuJumperRecord, seed: number): CpuJumpOutcome {
  const { start, pilot: firstPilot } = cpuJumpStart(hill, record, seed);
  const jump = startComputedJump(hill, start);
  let sim = jump.state;
  let pilot = firstPilot;
  const inputs: FrameInput[] = [];
  let score: JumpScore | null = null;
  while (jumpRunning(sim) && sim.logic.frame < MAX_CPU_JUMP_FRAMES) {
    sim = stepFrame(sim, jump.setup, (frame, at) => {
      const out = cpuPilotInput(
        pilot,
        pilotView(frame, at),
        hill.profile,
        FRAME_DT_S,
        new BorlandRandom(at.randomSeed),
      );
      pilot = out.pilot;
      inputs.push(out.input);
      return out.input;
    });
    if (score === null && sim.logic.finished) {
      score = { distanceM: sim.logic.distanceM, points: sim.logic.points, fell: sim.logic.fallType !== 0 };
    }
  }
  const L = sim.logic;
  return { score: score ?? { distanceM: L.distanceM, points: L.points, fell: L.fallType !== 0 }, start, inputs };
}
