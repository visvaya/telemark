import type { HillChoice } from "../game/hill-choice";
import { rivalLandingInput } from "../game/rival-landing";
import { isJumpOver, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import { BorlandRandom } from "../sim/borland-random";
import { pilotView } from "../sim/cpu-jump";
import {
  cpuPilotInput,
  drawCpuForm,
  drawCpuTalents,
  setupCpuPilot,
  type CpuJumperRecord,
  type CpuPilotState,
} from "../sim/cpu-pilot";
import { stepFrame } from "../sim/jump-sim";
import { FRAME_DT_S } from "../sim/physics-constants";
import { landingSlope, terrainYM } from "../sim/hill-profile";
import { PHASE, type FrameInput } from "../sim/jump-logic";
import { createStartWind } from "../sim/training-wind";
import type { WindState } from "../sim/wind";
import {
  policyLandingHeightM,
  policyLeanRad,
  policyTakesOff,
  TRAINED_PLAYER_POLICY,
  type PlayerPolicy,
} from "./player-policy";
import { playerView, type PlayerView } from "./player-view";

/**
 * Bots that play a hill like a player does, for the simulation checks of a hill. Everything here is pure and
 * seeded, with no Node or browser imports, so the same checks can later run in a browser worker.
 */

const FRAME_S = 1 / 70;
const M_PER_S_TO_KM_PER_H = 3.6;

/** How a bot presses, frame by frame. */
const BOT_TIMING = {
  /** The frame of the left press that leaves the gate. */
  startFrame: 70,
  /**
   * From this frame on the bot holds left on the inrun, as a player might; the jumper crouches by itself after a
   * few inrun frames, so this changes nothing in the jumps measured so far.
   */
  crouchFromFrame: 140,
  /** A jump that has not ended after this many frames counts as stuck. */
  maxJumpFrames: 6000,
  /** Mouse motion is clamped to this many mickeys per frame, either way. */
  maxSteerMickeys: 40,
  /** Mickeys per radian of body angle error. */
  steerMickeysPerRad: 60,
  /** Landing: right for this many frames, then left from 8 to 12 frames after the first press (telemark). */
  landingRightFrames: 4,
  landingLeftFromFrame: 8,
  landingLeftToFrame: 12,
} as const;

/** Random inputs: each button is pressed with this chance per frame; the mouse moves uniformly within the clamp. */
const RANDOM_PRESS_CHANCE = 0.08;

export interface PlayerLevel {
  /** Standard deviation of the takeoff press around the aim, in seconds. */
  timingSpreadS: number;
  /** Share of the steering a player gets right (1 = the full correction). */
  steerGain: number;
  /** Standard deviation of the mouse motion added each frame, in mickeys. */
  steerNoiseMickeys: number;
  /**
   * Height of the landing press relative to the policy's (negative is later), and its standard deviation, in
   * metres: a weaker player waits too long.
   */
  landingHeightOffsetM: number;
  landingHeightSpreadM: number;
}

/** Three players: weak, average and good. A good one presses on time, steers well and lands on time. */
export const PLAYER_LEVELS = {
  weak: {
    timingSpreadS: 0.08,
    steerGain: 0.6,
    steerNoiseMickeys: 8,
    landingHeightOffsetM: -0.7,
    landingHeightSpreadM: 1,
  },
  average: {
    timingSpreadS: 0.04,
    steerGain: 1,
    steerNoiseMickeys: 4,
    landingHeightOffsetM: -0.2,
    landingHeightSpreadM: 0.5,
  },
  good: {
    timingSpreadS: 0.015,
    steerGain: 1,
    steerNoiseMickeys: 2,
    landingHeightOffsetM: 0,
    landingHeightSpreadM: 0.2,
  },
} as const satisfies Record<string, PlayerLevel>;

/** A good player that never misses: the trained policy exactly, the reference for the takeoff window. */
export const EXACT_PLAYER_LEVEL: PlayerLevel = {
  ...PLAYER_LEVELS.good,
  timingSpreadS: 0,
  steerNoiseMickeys: 0,
  landingHeightSpreadM: 0,
};

/** Where the aim search starts: frames of time left to the edge. */
const DEFAULT_TAKEOFF_AIM_FRAMES = 14;

/** What one jump came to. */
export interface JumpOutcome {
  distanceM: number;
  fell: boolean;
  /** The game's kind of fall (`fallType`), 0 for none. */
  fallType: number;
  disqualified: boolean;
  /** The game's points for the jump (`logic.points`): distance points and the judges' notes. */
  points: number;
  /** Speed at the first airborne frame; 0 when the jumper never left the ground. */
  takeoffSpeedKmPerH: number;
  flightTimeS: number;
  /** Highest point above the terrain during the flight, in metres. */
  highestAboveTerrainM: number;
  /** Velocity along the slope normal (into the slope) at the first contact after the flight, in m/s. */
  landingImpactMPerS: number;
  frames: number;
  finalXM: number;
  /** Whether the jump ended before the frame cap. */
  ended: boolean;
  /** Whether every sampled number stayed finite. */
  finite: boolean;
  /** How deep the jumper's point went below the terrain at worst, in metres (0 when never below). */
  deepestBelowTerrainM: number;
  /** FNV-1a (32-bit) over the final numbers of the jump as single-precision bit patterns. */
  finalHash: number;
}

/** A source of noise for a bot: uniform numbers in [0, 1) from a seeded generator. */
interface Noise {
  uniform: () => number;
  /** Approximately normal with mean 0 and deviation 1 (sum of twelve uniforms, arithmetic only). */
  normal: () => number;
}

/** `BorlandRandom.below` takes a 16-bit range, so 0x10000 would read as 0. */
const NOISE_RESOLUTION = 0x8000;
const NORMAL_TERMS = 12;

/**
 * Noise from the generator the game itself uses (`BorlandRandom`): a separate instance per jump, owned here, so
 * the bot's draws never touch the jump's own randomness. The normal draw uses only additions, which give the
 * same bits in every engine, unlike `Math.log` or `Math.cos`.
 */
function noiseFrom(seed: number): Noise {
  const rng = new BorlandRandom(seed);
  const uniform = (): number => rng.below(NOISE_RESOLUTION) / NOISE_RESOLUTION;
  const normal = (): number => {
    let sum = 0;
    for (let i = 0; i < NORMAL_TERMS; i++) sum += uniform();
    return sum - NORMAL_TERMS / 2;
  };
  return { uniform, normal };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const inFlight = (phase: number): boolean => phase === PHASE.flightHold || phase === PHASE.flight;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function finalNumbers(jump: TrainingJump): number[] {
  const { logic, jumper } = jump.state;
  return [
    logic.frame,
    logic.phase,
    logic.distanceM,
    logic.fallType,
    logic.flightTimeS,
    logic.takeoffTimingS,
    logic.points,
    logic.bodyAngleRad,
    jumper.xM,
    jumper.yM,
    jumper.vxMPerS,
    jumper.vyMPerS,
    jumper.speedMPerS,
    jump.state.randomSeed,
  ];
}

function hashOf(numbers: readonly number[]): number {
  const view = new DataView(new ArrayBuffer(4));
  return numbers.reduce((h, n) => {
    view.setFloat32(0, n, true);
    return Math.imul(h ^ view.getUint32(0, true), FNV_PRIME) >>> 0;
  }, FNV_OFFSET);
}

/** What a bot sees of the jump at each frame and decides from. */
type Decide = (jump: TrainingJump, frame: number) => FrameInput;

interface Track {
  takeoffSpeedKmPerH: number;
  highestAboveTerrainM: number;
  landingImpactMPerS: number | null;
  wasAirborne: boolean;
  finite: boolean;
  deepestBelowTerrainM: number;
}

function observe(track: Track, jump: TrainingJump): Track {
  const { jumper, logic } = jump.state;
  const hill = jump.hill.profile;
  const aboveM = jumper.yM - terrainYM(hill, jumper.xM);
  const finite = [jumper.xM, jumper.yM, jumper.vxMPerS, jumper.vyMPerS, jumper.speedMPerS, logic.distanceM].every(
    Number.isFinite,
  );
  const firstAir = jumper.airborne && !track.wasAirborne && track.takeoffSpeedKmPerH === 0;
  const firstContact = !jumper.airborne && track.wasAirborne && track.landingImpactMPerS === null;
  const slope = landingSlope(hill, jumper.xM);
  return {
    takeoffSpeedKmPerH: firstAir ? jumper.speedMPerS * M_PER_S_TO_KM_PER_H : track.takeoffSpeedKmPerH,
    highestAboveTerrainM:
      jumper.airborne && inFlight(logic.phase)
        ? Math.max(track.highestAboveTerrainM, aboveM)
        : track.highestAboveTerrainM,
    // With y up and the slope s = dy/dx, the speed into the slope is (vx s + vy) / sqrt(1 + s^2), vy positive down.
    landingImpactMPerS: firstContact
      ? (jumper.vxMPerS * slope + jumper.vyMPerS) / Math.sqrt(1 + slope * slope)
      : track.landingImpactMPerS,
    wasAirborne: track.wasAirborne || jumper.airborne,
    finite: track.finite && finite,
    deepestBelowTerrainM: Math.max(track.deepestBelowTerrainM, -aboveM),
  };
}

function run(hill: HillChoice, seed: number, decide: Decide): JumpOutcome {
  return runSteps(hill, seed, (jump) => stepTrainingJump(jump, decide(jump, jump.state.logic.frame + 1)));
}

/** A jump from `seed`, one `step` per frame, until it is over or stuck, with what the checks measure of it. */
function runSteps(hill: HillChoice, seed: number, step: (jump: TrainingJump) => TrainingJump): JumpOutcome {
  let jump = startTrainingJump(hill, seed);
  let track: Track = {
    takeoffSpeedKmPerH: 0,
    highestAboveTerrainM: 0,
    landingImpactMPerS: null,
    wasAirborne: false,
    finite: true,
    deepestBelowTerrainM: 0,
  };
  let steps = 0;
  while (!isJumpOver(jump) && steps < BOT_TIMING.maxJumpFrames) {
    jump = step(jump);
    track = observe(track, jump);
    steps++;
  }
  const { logic, jumper } = jump.state;
  const disqualified = logic.distanceM === 0;
  return {
    distanceM: logic.distanceM,
    points: logic.points,
    fell: logic.fallType !== 0 && !disqualified,
    fallType: logic.fallType,
    disqualified,
    takeoffSpeedKmPerH: track.takeoffSpeedKmPerH,
    flightTimeS: logic.flightTimeS,
    highestAboveTerrainM: track.highestAboveTerrainM,
    landingImpactMPerS: track.landingImpactMPerS ?? 0,
    frames: logic.frame,
    finalXM: jumper.xM,
    ended: isJumpOver(jump),
    finite: track.finite,
    deepestBelowTerrainM: track.deepestBelowTerrainM,
    finalHash: hashOf(finalNumbers(jump)),
  };
}

/** How a landing is pressed: telemark (right, then left), two-footed (right only) or not at all. */
type LandingStyle = "telemark" | "two-footed" | "none";

/** What a bot sets out to do in one jump, from what it sees, apart from the noise of its level. */
export interface BotPlan {
  /** Whether the takeoff press comes at this view; null never presses for the takeoff. */
  takesOff: ((view: PlayerView) => boolean) | null;
  /** Lean the flight steering holds at this view, in radians: it steers towards a body angle of minus this. */
  leanRad: (view: PlayerView) => number;
  /** Height above the terrain below which the landing press comes at this view, in metres. */
  landingHeightM: (view: PlayerView) => number;
  landing: LandingStyle;
}

/** The plan of a policy, with a player's aim shift (seconds, positive presses earlier) and landing offset (m). */
function policyPlan(policy: PlayerPolicy, aimShiftS: number, landingOffsetM: number): BotPlan {
  return {
    takesOff: (view) => policyTakesOff(policy, view, aimShiftS),
    leanRad: (view) => policyLeanRad(policy, view),
    landingHeightM: (view) => policyLandingHeightM(policy, view) + landingOffsetM,
    landing: policy.telemark ? "telemark" : "two-footed",
  };
}

/** The bot of one player level; its noise and its per-jump draws (aim, landing height) come from `noiseSeed`. */
function playerBot(policy: PlayerPolicy, player: PlayerLevel, noiseSeed: number): Decide {
  const noise = noiseFrom(noiseSeed);
  const aimShiftS = noise.normal() * player.timingSpreadS;
  const landingOffsetM = player.landingHeightOffsetM + noise.normal() * player.landingHeightSpreadM;
  return planBot(player, noise, policyPlan(policy, aimShiftS, landingOffsetM));
}

/** A bot that follows a plan, with the steering and the noise of a player level. */
function planBot(player: PlayerLevel, noise: Noise, plan: BotPlan): Decide {
  let pressedTakeoff = false;
  let takeoffFrame: number | null = null;
  let landingFrame: number | null = null;
  let previousAboveM = 0;
  return (jump, frame) => {
    const { jumper, logic } = jump.state;
    const { phase } = logic;
    if (takeoffFrame === null && jumper.airborne) takeoffFrame = frame;
    const view = playerView(jump, frame, takeoffFrame);
    if (plan.takesOff !== null && !pressedTakeoff) pressedTakeoff = plan.takesOff(view);
    const takingOff = pressedTakeoff && (phase === PHASE.crouch || phase === PHASE.takeoff) && !jumper.airborne;
    // Only a sinking jumper lands: just past the edge the jumper is as low as the table is high, but rising.
    const aboveM = view.aboveTerrainM;
    const sinking = aboveM < previousAboveM;
    previousAboveM = aboveM;
    if (
      plan.landing !== "none" &&
      landingFrame === null &&
      inFlight(phase) &&
      sinking &&
      aboveM < plan.landingHeightM(view)
    ) {
      landingFrame = frame;
    }
    const sinceLanding = landingFrame === null ? -1 : frame - landingFrame;
    const t = BOT_TIMING;
    const landingRight = sinceLanding >= 0 && sinceLanding < t.landingRightFrames;
    const landingLeft =
      plan.landing === "telemark" && sinceLanding >= t.landingLeftFromFrame && sinceLanding <= t.landingLeftToFrame;
    const flying = inFlight(phase) && landingFrame === null;
    const steer = flying ? (logic.bodyAngleRad + plan.leanRad(view)) * t.steerMickeysPerRad * player.steerGain : 0;
    const dy = flying ? steer + noise.normal() * player.steerNoiseMickeys : 0;
    return {
      left: frame === t.startFrame || (phase === PHASE.inrun && frame >= t.crouchFromFrame) || takingOff || landingLeft,
      right: takingOff || landingRight,
      dy: clamp(Math.round(dy), -t.maxSteerMickeys, t.maxSteerMickeys),
    };
  };
}

/**
 * One jump of a player on a hill: `seed` sets the jump (wind), `noiseSeed` the player's own errors, `policy` how
 * it plays (the trained player unless given).
 */
export function playJump(
  hill: HillChoice,
  seed: number,
  player: PlayerLevel,
  noiseSeed: number,
  policy: PlayerPolicy = TRAINED_PLAYER_POLICY,
): JumpOutcome {
  return run(hill, seed, playerBot(policy, player, noiseSeed));
}

/**
 * Players of the checks made from the original's computer jumpers, by level (0 the weakest, 4 "super"). The
 * original's author made them to jump every one of its hills, from K50 to K250, and the improved landing keeps
 * them on their feet, so they play large hills as reliably as small ones, where the trained player does not.
 */
export const RIVAL_PLAYER_LEVELS = { weak: 0, average: 2, good: 4 } as const;

/** Setups drawn until one is not a blundered jump: a player of the checks never blunders on purpose. */
const MAX_RIVAL_SETUPS = 64;

/**
 * One jump of a computer jumper of the original on a hill, as a player of the checks: `seed` sets the jump (wind)
 * as for every bot, `noiseSeed` the jumper's talents and form (as at the start of a cup and a competition) and the
 * setup of its pilot. The pilot sees what the original's pilot sees and lands as with the improved landing.
 */
export function rivalJump(hill: HillChoice, seed: number, level: number, noiseSeed: number): JumpOutcome {
  const rng = new BorlandRandom(noiseSeed);
  const record = { ...drawCpuTalents(level, rng), ...drawCpuForm(rng) };
  return pilotJump(hill, seed, rivalSetup(hill, record, rng));
}

/** The pilot's setup for `record`, drawn again until it is not a blundered jump. */
function rivalSetup(hill: HillChoice, record: CpuJumperRecord, rng: BorlandRandom): CpuPilotState {
  let pilot = setupCpuPilot(record, hill.kPointM, hill.profile, rng);
  for (let i = 1; pilot.blunder && i < MAX_RIVAL_SETUPS; i++) {
    pilot = setupCpuPilot(record, hill.kPointM, hill.profile, rng);
  }
  return pilot;
}

/**
 * The setup of the exact rival: the original's setup (0baf:8aeb) for the best level with no talent or form either
 * way, at the mean of every draw, so that only the wind changes from jump to jump.
 */
const EXACT_RIVAL_SETUP = {
  /** `0.18 + (250 - K) / 10000`, before the original's limits, which no size of hill reaches. */
  takeoffLeadBaseS: 0.18,
  takeoffLeadKPointM: 250,
  takeoffLeadPerKPointSPerM: 0.0001,
  /** `Random(10) / 100 + 0.05` at the mean draw. */
  flightHoldS: 0.095,
  /** `Random(30) / 100 + 0.5` at the mean draw. */
  reactionS: 0.645,
  /** `(talent / 12 * 1.3 + form / 10) / 1.7 - 0.38` with both 0. */
  targetBodyRad: -0.38,
  /** `0.6 + (5 - level) * 0.7 * 0.15` at level 4. */
  landingLeadS: 0.705,
  telemarkDelayS: 0.35,
} as const;

/** The pilot of the exact rival on `hill`. */
function exactRivalSetup(hill: HillChoice): CpuPilotState {
  const C = EXACT_RIVAL_SETUP;
  const takeoffLeadS = C.takeoffLeadBaseS + (C.takeoffLeadKPointM - hill.kPointM) * C.takeoffLeadPerKPointSPerM;
  const record = { form1: 0, form2: 0, talent1: 0, talent2: 0, level: RIVAL_PLAYER_LEVELS.good };
  return {
    ...setupCpuPilot(record, hill.kPointM, hill.profile, new BorlandRandom(0)),
    blunder: false,
    impactPending: true,
    takeoffLeadS,
    secondLeadS: takeoffLeadS,
    flightHoldS: C.flightHoldS,
    reactionS: C.reactionS,
    reactionLeftS: C.reactionS,
    targetBodyRad: C.targetBodyRad,
    landingLeadS: C.landingLeadS,
    telemarkDelayS: C.telemarkDelayS,
  };
}

/**
 * One jump of the exact rival, which measures the hill and the wind alone: its takeoff is pressed `aimFrames`
 * frames before the edge when given (both buttons at once), at the pilot's own lead otherwise.
 */
export function exactRivalJump(hill: HillChoice, seed: number, aimFrames?: number): JumpOutcome {
  const pilot = exactRivalSetup(hill);
  const leadS = aimFrames === undefined ? null : aimFrames * FRAME_S;
  return pilotJump(hill, seed, leadS === null ? pilot : { ...pilot, takeoffLeadS: leadS, secondLeadS: leadS });
}

/** A jump steered by the original's pilot from `first`, landing as with the improved landing. */
function pilotJump(hill: HillChoice, seed: number, first: CpuPilotState): JumpOutcome {
  let pilot = first;
  return runSteps(hill, seed, (jump) => ({
    ...jump,
    state: stepFrame(jump.state, jump.setup, (frame, at) => {
      const view = pilotView(frame, at);
      const out = cpuPilotInput(pilot, view, hill.profile, FRAME_DT_S, new BorlandRandom(at.randomSeed));
      pilot = out.pilot;
      return rivalLandingInput("improved", out.input, view, out.pilot, hill.profile);
    }),
  }));
}

/** One jump of a player who never errs and follows `plan`: what the oracle tries. */
export function planJump(hill: HillChoice, seed: number, plan: BotPlan): JumpOutcome {
  return run(hill, seed, planBot(EXACT_PLAYER_LEVEL, noiseFrom(seed), plan));
}

/** A policy with its takeoff aim set to `aimFrames` frames of time left to the edge. */
export const withAimFrames = (policy: PlayerPolicy, aimFrames: number): PlayerPolicy => ({
  ...policy,
  takeoffAimS: aimFrames * FRAME_S,
});

/** One jump with random inputs: both buttons pressed now and then, the mouse anywhere within its clamp. */
export function randomJump(hill: HillChoice, seed: number, noiseSeed: number): JumpOutcome {
  const noise = noiseFrom(noiseSeed);
  const max = BOT_TIMING.maxSteerMickeys;
  return run(hill, seed, () => ({
    left: noise.uniform() < RANDOM_PRESS_CHANCE,
    right: noise.uniform() < RANDOM_PRESS_CHANCE,
    dy: Math.floor(noise.uniform() * (2 * max + 1)) - max,
  }));
}

/** The takeoff aims an aim search may try, in frames of time left to the edge (negative is past it). */
export const AIM_RANGE_FRAMES = { from: -10, to: 30 } as const;

/**
 * The aim search stops on a side after this many aims in a row that are not clean or fall more than the tolerance
 * below the best so far. Two in a row, so that one frame which lands short next to the peak does not end it.
 */
const AIM_SEARCH_STOP_AFTER_FRAMES = 2;

export interface AimSweep {
  bestDistanceM: number;
  bestAimFrames: number;
  /** Aim frames within the tolerance of the best distance, without a fall or a disqualification. */
  windowFrames: number;
}

/** One takeoff aim of an exact good player and what it came to. */
export interface AimTry {
  aim: number;
  outcome: JumpOutcome;
}

/** The best aim, its distance and the takeoff window from the aims tried; the lowest aim wins a tie. */
export function aimSweepOf(tries: readonly AimTry[], toleranceM: number): AimSweep {
  const clean = tries.filter(({ outcome: o }) => !o.fell && !o.disqualified).toSorted((a, b) => a.aim - b.aim);
  const best = clean.reduce<AimTry | null>(
    (b, t) => (b === null || t.outcome.distanceM > b.outcome.distanceM ? t : b),
    null,
  );
  if (best === null) return { bestDistanceM: 0, bestAimFrames: AIM_RANGE_FRAMES.from, windowFrames: 0 };
  const bestDistanceM = best.outcome.distanceM;
  return {
    bestDistanceM,
    bestAimFrames: best.aim,
    windowFrames: clean.filter(({ outcome: o }) => o.distanceM >= bestDistanceM - toleranceM).length,
  };
}

/** An aim search's result for one seed, with the number of jumps it took. */
export interface AimSearch extends AimSweep {
  jumps: number;
}

/**
 * Finds the best takeoff aim of a good player who never misses it, once per jump seed. Distance against the aim
 * rises to one peak and falls past it (with a cliff a few frames early), so instead of trying every aim of
 * `AIM_RANGE_FRAMES` the search starts at the best aim of the previous seed (`startAimFrames` for the first) and
 * steps outward on both sides until the distance has fallen more than the tolerance below the best. A side that
 * finds a new best keeps going, so a best at the edge of what was tried widens the search.
 */
export function takeoffAimSearch(
  hill: HillChoice,
  seeds: readonly number[],
  toleranceM: number,
  startAimFrames: number = DEFAULT_TAKEOFF_AIM_FRAMES,
  policy: PlayerPolicy = TRAINED_PLAYER_POLICY,
  jumpAt: (seed: number, aimFrames: number) => JumpOutcome = (seed, aim) =>
    playJump(hill, seed, EXACT_PLAYER_LEVEL, seed, withAimFrames(policy, aim)),
): AimSearch[] {
  const results: AimSearch[] = [];
  let start = clamp(startAimFrames, AIM_RANGE_FRAMES.from, AIM_RANGE_FRAMES.to);
  for (const seed of seeds) {
    const tries: AimTry[] = [];
    const tryAim = (aim: number): AimTry => {
      const t = { aim, outcome: jumpAt(seed, aim) };
      tries.push(t);
      return t;
    };
    const short = ({ outcome: o }: AimTry): boolean =>
      o.fell || o.disqualified || o.distanceM < aimSweepOf(tries, toleranceM).bestDistanceM - toleranceM;
    const side = (step: -1 | 1): void => {
      let misses = 0;
      for (
        let aim = start + step;
        aim >= AIM_RANGE_FRAMES.from && aim <= AIM_RANGE_FRAMES.to && misses < AIM_SEARCH_STOP_AFTER_FRAMES;
        aim += step
      ) {
        misses = short(tryAim(aim)) ? misses + 1 : 0;
      }
    };
    tryAim(start);
    side(1);
    side(-1);
    const sweep = aimSweepOf(tries, toleranceM);
    results.push({ ...sweep, jumps: tries.length });
    if (sweep.windowFrames > 0) start = sweep.bestAimFrames;
  }
  return results;
}

/** The game's start wind for a jump seed, drawn as `startTrainingJump` draws it, known before the jump. */
export function startWindOf(seed: number): WindState {
  return createStartWind(new BorlandRandom(seed));
}

/** A designed jump: when the takeoff is pressed, how the flight is held and how the landing is pressed. */
export interface Scenario {
  name: string;
  /** Takeoff aim relative to the best aim, in frames (positive is earlier); null presses no takeoff at all. */
  takeoffShiftFrames: number | null;
  pose: "steady" | "forward" | "back" | "oscillating";
  /** Height above the terrain of the landing press, in metres. */
  landingHeightM: number;
  landing: LandingStyle;
}

/** Leans the scenario poses hold, in radians; the steady pose is the trained player's flight. */
const SCENARIO_POSE = {
  forwardRad: 0.6,
  backRad: 0,
  /** The oscillating pose switches between forward and back every this many frames. */
  oscillationHalfPeriodFrames: 35,
} as const;

const LEAN_OF_POSE: Readonly<Record<Scenario["pose"], (view: PlayerView) => number>> = {
  steady: (view) => policyLeanRad(TRAINED_PLAYER_POLICY, view),
  forward: () => SCENARIO_POSE.forwardRad,
  back: () => SCENARIO_POSE.backRad,
  oscillating: (view) =>
    Math.floor(view.frame / SCENARIO_POSE.oscillationHalfPeriodFrames) % 2 === 0
      ? SCENARIO_POSE.forwardRad
      : SCENARIO_POSE.backRad,
};

/** One designed jump of an exact good player, its takeoff shifted from `aimFrames` as the scenario says. */
export function scenarioJump(hill: HillChoice, seed: number, scenario: Scenario, aimFrames: number): JumpOutcome {
  const shift = scenario.takeoffShiftFrames;
  const aim = withAimFrames(TRAINED_PLAYER_POLICY, aimFrames + (shift ?? 0));
  return planJump(hill, seed, {
    takesOff: shift === null ? null : (view) => policyTakesOff(aim, view, 0),
    leanRad: LEAN_OF_POSE[scenario.pose],
    landingHeightM: () => scenario.landingHeightM,
    landing: scenario.landing,
  });
}
