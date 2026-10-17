import { BorlandRandom } from "../sim/borland-random";
import { ORIGINAL_POSES } from "../sim/data/pose-table";
import { notesShownBy, type FrameInput, type JumpLogicState } from "../sim/jump-logic";
import { createJump, jumpRunning, stepFrame, type JumpSetup, type JumpSimState } from "../sim/jump-sim";
import { createStartWind } from "../sim/training-wind";
import type { WindState } from "../sim/wind";
import type { HillChoice } from "./hill-choice";
import { displayedWindMPerS } from "./wind-display";

const FRAME_S = 1 / 70;

/** One training jump: everything the simulation needs, plus its current state. */
export interface TrainingJump {
  hill: HillChoice;
  setup: JumpSetup;
  state: JumpSimState;
  /** Generator seed the jump was created from; with the inputs it reproduces the jump. */
  seed: number;
  /** Frames stepped after the simulation stopped (the judges' notes keep appearing). */
  framesAfterEnd: number;
  /** How far the displayed wind has carried the air so far, in metres (moves the falling snow; visual only). */
  windDriftM: { x: number; y: number };
}

export function startTrainingJump(hill: HillChoice, seed: number): TrainingJump {
  const rng = new BorlandRandom(seed);
  const wind = createStartWind(rng);
  return jumpFrom(hill, { wind, randomSeed: rng.seed }, seed >>> 0);
}

/** How a recorded jump of the original starts: its wind and the state of its generator, as a replay keeps them. */
export interface RecordedStart {
  wind: WindState;
  randomSeed: number;
}

/** A jump that starts as a replay of the original says (the original's replays keep no seed of their own). */
export function startRecordedJump(hill: HillChoice, start: RecordedStart): TrainingJump {
  return jumpFrom(hill, start, start.randomSeed >>> 0);
}

/**
 * A jump the original computes without drawing (a computer jumper's, not watched): the same start, but the
 * simulation skips what the original does only while it draws.
 */
export function startComputedJump(hill: HillChoice, start: RecordedStart): TrainingJump {
  return jumpFrom(hill, start, start.randomSeed >>> 0, false);
}

function jumpFrom(hill: HillChoice, start: RecordedStart, seed: number, presentation = true): TrainingJump {
  const setup: JumpSetup = {
    hill: hill.profile,
    kPointM: hill.kPointM,
    poses: ORIGINAL_POSES,
    wind: start.wind,
    randomSeed: start.randomSeed,
    points: 0,
    presentation,
  };
  return { hill, setup, state: createJump(setup), seed, framesAfterEnd: 0, windDriftM: { x: 0, y: 0 } };
}

/** The session one simulation frame later; once the jump is over only the presentation clock moves. */
export function stepTrainingJump(jump: TrainingJump, input: FrameInput): TrainingJump {
  const wind = displayedWindMPerS(jump.state.wind);
  const windDriftM = { x: jump.windDriftM.x + wind.x * FRAME_S, y: jump.windDriftM.y + wind.y * FRAME_S };
  if (!jumpRunning(jump.state)) {
    return { ...jump, windDriftM, framesAfterEnd: jump.framesAfterEnd + 1 };
  }
  return { ...jump, windDriftM, state: stepFrame(jump.state, jump.setup, () => input) };
}

/** Clock for presentation, in simulation frames; it keeps counting after the jump is over. */
export function presentationFrame(jump: TrainingJump): number {
  return jump.state.logic.frame + jump.framesAfterEnd;
}

/** How long after a disqualification the next jump can start: long enough to read it, short enough not to wait. */
const NEXT_JUMP_AFTER_DISQUALIFICATION_S = 0.5;
/** The simulation sets the end of a disqualified jump this many frames before the frame that disqualified it. */
const DISQUALIFICATION_END_LEAD_FRAMES = 30;

/**
 * Whether a press may start the next jump, at presentation frame `clock`. A scored jump allows it once every
 * judge's note is up, which is while the jumper is still sliding out; a disqualified one (no distance, no notes)
 * a moment after the disqualification, so the press that was meant for the jump does not start another.
 */
export function nextJumpAllowed(logic: JumpLogicState, clock: number): boolean {
  if (!logic.finished) return false;
  if (logic.distanceM > 0) return notesShownBy(logic, clock);
  const disqualifiedAt = logic.endFrame + DISQUALIFICATION_END_LEAD_FRAMES;
  return clock - disqualifiedAt >= Math.round(NEXT_JUMP_AFTER_DISQUALIFICATION_S / FRAME_S);
}

export function isJumpOver(jump: TrainingJump): boolean {
  return !jumpRunning(jump.state);
}

/** A fresh seed for a new jump (the original seeds from the clock with Randomize). */
export function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}
