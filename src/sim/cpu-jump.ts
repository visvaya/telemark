import { BorlandRandom } from "./borland-random";
import { cpuPilotInput, type CpuPilotState } from "./cpu-pilot";
import { jumpRunning, stepFrame, type InputContext, type JumpSetup, type JumpSimState } from "./jump-sim";
import { FRAME_DT_S } from "./physics-constants";

/** A computer jump: the simulation and the state of its pilot. */
export interface CpuJumpState {
  sim: JumpSimState;
  pilot: CpuPilotState;
}

/** The pilot's view of the jump at the entry of read_input. */
export function pilotView(frame: number, at: InputContext) {
  const j = at.jumper;
  return {
    frame,
    phase: at.logic.phase,
    xM: j.xM,
    yM: j.yM,
    vxMPerS: j.vxMPerS,
    vyMPerS: j.vyMPerS,
    speedMPerS: j.speedMPerS,
    slopeAngleRad: j.slopeAngleRad,
    bodyAngleRad: at.logic.bodyAngleRad,
    landingPrepS: at.logic.landingPrepS,
    randomSeed: at.randomSeed,
  };
}

/**
 * One frame of a computer jump (0baf:cc6e with the pilot 0baf:8ee4 in read_input). The pilot draws from a
 * copy of the generator, because the original restores the seed after it. Returns a new state.
 */
export function stepCpuFrame(prev: CpuJumpState, setup: JumpSetup): CpuJumpState {
  let pilot = prev.pilot;
  const sim = stepFrame(prev.sim, setup, (frame, at) => {
    const out = cpuPilotInput(
      prev.pilot,
      pilotView(frame, at),
      setup.hill,
      FRAME_DT_S,
      new BorlandRandom(at.randomSeed),
    );
    pilot = out.pilot;
    return out.input;
  });
  return { sim, pilot };
}

/**
 * Whether the jump loop of a computer jump goes on (0baf:d1cd..d1f6): a jump computed without drawing ends in
 * the frame its result is in, a watched one like any other jump.
 */
export function cpuJumpRunning(s: CpuJumpState, setup: JumpSetup): boolean {
  return setup.presentation ? jumpRunning(s.sim) : !s.sim.logic.finished;
}
