import type { BorlandRandom } from "./borland-random";
import { detCos, detSin } from "./deterministic-math";
import { inrunSlope, landingArcLengthM, landingSlope, terrainYM, type HillProfile } from "./hill-profile";
import type { JumperState } from "./jumper-step";
import { roundHalfEven, toInt16, toWord, truncToInt } from "./pascal-numeric";
import { f32 } from "./physics-constants";
import {
  CRASH_POSE_ID,
  SKI_JOINT,
  UPPER_SEGMENT,
  UPPER_SEGMENT_MAX_M,
  animatePose,
  applyFlightPose,
  applyGroundPose,
  applyLandingAbsorbPose,
  applyLandingPrepPose,
  legOf,
  perturbPose,
  setPose,
  type PoseDefinition,
  type PoseState,
} from "./pose";

/**
 * Per-frame jump logic (0baf:9c52 of the original without drawing, sound and
 * text): phases, takeoff, flight control, landing, distance and judges.
 * See docs/physics-spec.md, section "Jump phases and control".
 */

export const PHASE = {
  gate: 1,
  inrun: 2,
  crouch: 3,
  takeoff: 4,
  afterTakeoff: 5,
  flightHold: 6,
  flight: 7,
  landingPrep: 8,
  landing: 9,
  outrun: 11,
  crash: 12,
} as const;

export const JUDGE_COUNT = 5;
export const START_COUNTDOWN_SECONDS = 16;
const FRAMES_PER_SECOND = 70;
const COUNTDOWN_TICK_FRAME = 35;
const START_MIN_FRAME = 65;
const CROUCH_AFTER_FRAMES = 20;
const TAKEOFF_FORCE_PER_BUTTON = 1275;
const KNEE_EXTENSION_LIMIT_M = 1.07;
const BODY_ANGLE_LIMIT_RAD = 0.6;
const LANDING_PREP_MAX_S = 0.6;
const FALL_THRESHOLD = 60;
const DISTANCE_STEP_M = f32(0.1);

interface JudgeState {
  showFrame: number;
  counted: boolean;
  note: number;
}

export interface JumpLogicState {
  frame: number;
  phase: number;
  startCountdown: number;
  finished: boolean;
  inrunFrames: number;
  bodyAngleRad: number;
  skiWobbleRad: [number, number];
  armWobbleRad: [number, number];
  takeoffForceNs: number;
  takeoffTimingS: number;
  flightStyle: number;
  styleRampS: number;
  flightTimeS: number;
  landingPrepS: number;
  impact: number[];
  impactMean: number;
  fallType: number;
  fallSeverity: number;
  legSpreadRad: number[];
  frontLeg: number;
  backLeg: number;
  bounceCount: number;
  liftFactor: number;
  groundProximity: number;
  distanceM: number;
  distanceHalfM: number;
  points: number;
  judges: JudgeState[];
  endFrame: number;
  landedFrame: number;
}

export interface FrameInput {
  left: boolean;
  right: boolean;
  /** Vertical mouse motion in mickeys, already clamped to -128..127. */
  dy: number;
}

export interface LogicContext {
  hill: HillProfile;
  /** K point of the hill in metres (integer in the original). */
  kPointM: number;
  poses: ReadonlyMap<number, PoseDefinition>;
  dtS: number;
  /** The original only draws (and draws a random sound pitch) outside fast-forward. */
  presentation: boolean;
}

export interface SimFrame {
  logic: JumpLogicState;
  jumper: JumperState;
  pose: PoseState;
  windSpeedMPerS: number;
  windDirectionRad: number;
}

/** True once the jump is scored and every judge's note is on screen at presentation frame `frame`. */
export function notesShownBy(logic: JumpLogicState, frame: number): boolean {
  return logic.finished && logic.judges.every((judge) => frame >= judge.showFrame);
}

function distancePoints(points: number, half: number, k: number): number {
  if (k <= 90) return f32(points + 60 + (half - k) * 2);
  if (k < 145) return f32(points + 60 + (half - k) * 1.8);
  return f32(points + 120 + (half - k) * 1.2);
}

function disqualificationPoints(points: number, k: number): number {
  if (k <= 90) return f32(points + 60 - k * 2);
  if (k < 145) return f32(points + 60 - k * 1.8);
  return f32(points + 120 - k * 1.2);
}

const signedUnit = (rng: BorlandRandom): number => rng.below(2) * 2 - 1;

/** 0baf:9c52 without presentation. Mutates `s`; consumes `rng` in the original order. */
// oxlint-disable-next-line max-lines-per-function, complexity -- the port of one routine of the original (0baf:9c52), kept in its shape
export function stepLogic(s: SimFrame, input: FrameInput, ctx: LogicContext, rng: BorlandRandom): void {
  const L = s.logic;
  const j = s.jumper;
  const p = s.pose;
  const h = ctx.hill;
  const dt = ctx.dtS;
  const [leg0, leg1] = p.legs;
  const left = input.left;
  const right = input.right;

  // Start countdown and time-out.
  if (L.phase < 2 && L.frame % FRAMES_PER_SECOND === COUNTDOWN_TICK_FRAME && L.startCountdown > 0) {
    L.startCountdown--;
  }
  if (L.startCountdown === 0) {
    L.distanceHalfM = 0;
    L.distanceM = 0;
    L.startCountdown = -1;
    L.points = disqualificationPoints(L.points, ctx.kPointM);
    L.endFrame = L.frame - 30;
    L.finished = true;
  }

  // Gate, inrun, crouch.
  if (L.phase === PHASE.gate && L.frame >= START_MIN_FRAME && left && L.startCountdown >= 0) {
    L.phase = PHASE.inrun;
    setPose(p, 2, j.slopeAngleRad, ctx.poses);
    p.poseTimeS = 0;
    j.refSpeedMPerS = 1;
    j.speedMPerS = j.refSpeedMPerS;
  }
  if (L.phase >= 2 && L.phase <= 3 && p.poseId === 2 && !(0.2 > p.poseTimeS)) {
    setPose(p, 3, j.slopeAngleRad, ctx.poses);
    p.poseTimeS = 0;
  }
  if (!j.airborne && L.phase >= 2 && L.phase <= 12) {
    applyGroundPose(p, j.slopeAngleRad);
  }
  if (L.phase === PHASE.inrun) {
    L.inrunFrames++;
  }
  if (L.phase === PHASE.inrun && L.inrunFrames > CROUCH_AFTER_FRAMES && !left && !right) {
    L.phase = PHASE.crouch;
  }
  if (L.phase === PHASE.crouch && (left || right)) {
    L.phase = PHASE.takeoff;
    setPose(p, 4, j.slopeAngleRad, ctx.poses);
    p.poseTimeS = 0;
    L.liftFactor = 1;
  }

  // Takeoff: pressing buttons before the edge builds an impulse.
  const knee = leg0.segments.current[UPPER_SEGMENT] ?? 0;
  if (L.phase === PHASE.takeoff && j.xM < h.takeoffXM) {
    const buttons = (right ? 1 : 0) + (left ? 1 : 0);
    L.takeoffForceNs = f32(
      buttons * TAKEOFF_FORCE_PER_BUTTON * dt * detCos(((knee / UPPER_SEGMENT_MAX_M - 0.5) / 0.5) * (Math.PI / 2)),
    );
    L.takeoffTimingS = f32((buttons * dt) / 2 + L.takeoffTimingS);
    j.impulseXNs = f32(j.impulseXNs - detSin(j.slopeAngleRad) * L.takeoffForceNs);
    j.impulseYNs = f32(detCos(j.slopeAngleRad) * L.takeoffForceNs + j.impulseYNs);
  }
  if (L.phase === PHASE.takeoff && !(KNEE_EXTENSION_LIMIT_M >= knee)) {
    if (!(j.xM > h.takeoffXM)) {
      j.contactEvent = true;
      const slope = inrunSlope(h, f32((j.xM + h.takeoffXM) / 2));
      L.takeoffTimingS = f32(L.takeoffTimingS - (Math.sqrt(slope * slope + 1) * (h.takeoffXM - j.xM)) / j.speedMPerS);
    }
    L.phase = PHASE.afterTakeoff;
  }
  if (L.phase === PHASE.afterTakeoff && j.airborne) {
    L.phase = PHASE.flightHold;
    setPose(p, 5, j.slopeAngleRad, ctx.poses);
    p.poseTimeS = 0;
  }
  if (L.phase === PHASE.flightHold && !left && !right) {
    L.phase = PHASE.flight;
  }

  // Flight style accumulators.
  if (j.airborne) {
    const body = 0.35 + L.bodyAngleRad;
    const skis = L.skiWobbleRad[0] * L.skiWobbleRad[0] + L.skiWobbleRad[1] * L.skiWobbleRad[1];
    const arms = L.armWobbleRad[0] * L.armWobbleRad[0] + L.armWobbleRad[1] * L.armWobbleRad[1];
    if (L.phase < PHASE.landingPrep) {
      L.flightStyle = f32(body * body * dt * 1.5 + L.flightStyle + skis * 0.3 * dt + arms * 0.3 * dt);
    } else {
      if (0.1 < L.styleRampS) {
        L.flightStyle = f32(
          (L.styleRampS * 3 - 0.1) * (body * body * dt * 1.5 + skis * 0.3 * dt + arms * 0.3 * dt) + L.flightStyle,
        );
      }
      if (!(0.4 <= L.styleRampS)) {
        L.styleRampS = f32(L.styleRampS + dt);
      }
    }
    L.flightTimeS = f32(L.flightTimeS + dt);
  }

  // Flight control: mouse lean and random wobble.
  if (L.phase >= PHASE.flightHold && L.phase <= PHASE.flight) {
    L.bodyAngleRad = f32(L.bodyAngleRad - input.dy * dt * 1.5);
    if (rng.below(5) === 1) {
      L.skiWobbleRad[0] = f32(L.skiWobbleRad[0] * dt * 65);
      L.skiWobbleRad[1] = f32(L.skiWobbleRad[1] * dt * 65);
    }
    if (rng.below(5) === 1) {
      L.armWobbleRad[0] = f32(L.armWobbleRad[0] * dt * 65);
      L.armWobbleRad[1] = f32(L.armWobbleRad[1] * dt * 65);
    }
    if (rng.below(30) === 1) {
      L.bodyAngleRad = f32(((7 - detCos(s.windDirectionRad) * s.windSpeedMPerS) * dt) / 10 + L.bodyAngleRad);
    }
    if (rng.below(60) === 1) {
      L.skiWobbleRad[0] = f32(rng.below(5) * dt + L.skiWobbleRad[0]);
    }
    if (rng.below(60) === 1) {
      L.skiWobbleRad[1] = f32(rng.below(5) * dt + L.skiWobbleRad[1]);
    }
    if (rng.below(100) === 1) {
      L.armWobbleRad[0] = f32(rng.below(10) * dt + L.armWobbleRad[0]);
    }
    if (rng.below(100) === 1) {
      L.armWobbleRad[1] = f32(rng.below(10) * dt + L.armWobbleRad[1]);
    }
    if (!(-BODY_ANGLE_LIMIT_RAD <= L.bodyAngleRad)) L.bodyAngleRad = f32(-BODY_ANGLE_LIMIT_RAD);
    if (!(BODY_ANGLE_LIMIT_RAD >= L.bodyAngleRad)) L.bodyAngleRad = f32(BODY_ANGLE_LIMIT_RAD);
    applyFlightPose(p, L.bodyAngleRad, L.armWobbleRad);
  }

  // Preparing to land; the button chooses the front leg.
  if (L.phase === PHASE.flight && (right || left)) {
    L.phase = PHASE.landingPrep;
    L.bodyAngleRad = f32(0.75);
    if (right) {
      L.frontLeg = 0;
      L.backLeg = 1;
    }
    if (left) {
      L.frontLeg = 1;
      L.backLeg = 0;
    }
    setPose(p, 6, j.slopeAngleRad, ctx.poses);
    leg0.joints.target[0] = 0;
    leg0.joints.rate[0] = 2;
    leg1.joints.target[0] = 0;
    leg1.joints.rate[0] = 2;
  }
  if (L.phase === PHASE.landingPrep || (j.landed && L.phase !== PHASE.crash)) {
    L.landingPrepS = f32(L.landingPrepS + dt);
    if (!(LANDING_PREP_MAX_S >= L.landingPrepS)) {
      L.landingPrepS = f32(LANDING_PREP_MAX_S);
      L.phase = PHASE.landing;
    }
    if (!j.landed) {
      applyLandingPrepPose(p, L.frontLeg, L.backLeg, L.landingPrepS, j.slopeAngleRad);
    }
    if ((left && L.frontLeg === 0) || (right && L.frontLeg === 1) || !j.airborne) {
      L.phase = PHASE.landing;
    }
  }

  // Clean landing: impact quality, possible fall, leg spread.
  if (j.landed && L.fallType === 0) {
    landClean(s, ctx, rng);
  }

  // Distance, distance points and judges, once after landing.
  if (L.phase >= PHASE.outrun && L.phase <= PHASE.crash && !L.finished) {
    scoreJump(s, ctx, rng);
  }

  // A fall developing after landing.
  if (
    p.poseId !== CRASH_POSE_ID &&
    L.fallType !== 0 &&
    L.phase !== PHASE.crash &&
    (1 - L.fallSeverity / 900) * 0.8 < p.poseTimeS
  ) {
    p.poseTimeS = 0;
    p.poseId = CRASH_POSE_ID;
    L.liftFactor = f32(0.6);
    L.bodyAngleRad = f32(0.5);
    leg0.joints.rate[0] = 3;
    leg1.joints.rate[0] = 3;
    leg0.joints.target[0] = f32((rng.below(60) / 100 + 1.8) * (leg0.joints.target[0] ?? 0));
    leg1.joints.target[0] = f32((rng.below(60) / 100 + 1.8) * (leg1.joints.target[0] ?? 0));
    leg0.joints.target[3] = f32(0.2 + (leg0.joints.target[0] ?? 0));
    leg1.joints.target[3] = f32(0.2 + (leg1.joints.target[0] ?? 0));
    leg0.joints.rate[3] = 3;
    leg1.joints.rate[3] = 3;
    j.impulseYNs = f32(0.4 * j.vyMPerS * j.massKg * (detCos(j.impactAngleRad) + 0.5));
    if (!(j.impulseYNs <= 300)) j.impulseYNs = 300;
    if (!(j.impulseYNs >= 150)) j.impulseYNs = 150;
    j.impulseXNs = f32(-j.impulseYNs / 5);
    j.contactEvent = true;
    perturbPose(p, { offsetRad: f32(3.4), spreadRad: f32(2.5), rateBase: f32(0.3), rateSpread: f32(2.2) }, rng);
    L.phase = PHASE.crash;
  }

  // Skis in flight follow the body and settle onto the slope near the ground.
  if (j.airborne && L.phase >= PHASE.flightHold && L.phase <= PHASE.outrun) {
    const behind = terrainYM(h, f32(j.xM - 1));
    if (!(behind <= j.yM)) {
      L.groundProximity = f32(
        (terrainYM(h, f32(j.xM - 1)) - j.yM) / (terrainYM(h, f32(j.xM - 1)) - terrainYM(h, j.xM)),
      );
    } else {
      L.groundProximity = 0;
    }
    const g = L.groundProximity;
    if (L.phase < PHASE.landingPrep) {
      leg0.joints.target[SKI_JOINT] = f32(
        j.slopeAngleRad * g +
          (L.bodyAngleRad / 4 + L.skiWobbleRad[0] + 0.2) * (1 - g) * detCos(leg0.joints.current[0] ?? 0),
      );
      leg1.joints.target[SKI_JOINT] = f32(
        j.slopeAngleRad * g +
          (L.bodyAngleRad / 4 + L.skiWobbleRad[1] + 0.2) * (1 - g) * detCos(leg1.joints.current[0] ?? 0),
      );
    } else {
      leg0.joints.target[SKI_JOINT] = f32(detCos(leg0.joints.current[0] ?? 0) * j.slopeAngleRad);
      leg1.joints.target[SKI_JOINT] = f32(detCos(leg1.joints.current[0] ?? 0) * j.slopeAngleRad);
    }
    for (const leg of p.legs) {
      leg.joints.rate[SKI_JOINT] =
        (leg.joints.target[SKI_JOINT] ?? 0) <= (leg.joints.current[SKI_JOINT] ?? 0) ? f32(g * 10 + 0.25) : 5;
    }
  }

  // Legs absorb the ground before touchdown.
  if (L.phase >= PHASE.flightHold && L.phase <= 10 && terrainYM(h, f32(j.xM - 1)) > j.yM) {
    fitLegsToGround(s, ctx);
  }

  // Outrun poses after a clean landing.
  if (L.fallType === 0 && L.phase >= PHASE.landing && L.phase <= PHASE.outrun) {
    const id = p.poseId & 0xff;
    if (!j.airborne && !((id >= 7 && id <= 8) || id === 10)) {
      if (!(p.poseTimeS < 0.5) && !(p.poseTimeS > 2)) {
        applyLandingAbsorbPose(p, L.frontLeg, L.backLeg, L.landingPrepS, j.slopeAngleRad);
      }
      if (p.poseTimeS > 2) {
        setPose(p, 7, j.slopeAngleRad, ctx.poses);
        p.poseTimeS = 0;
      }
    }
    if (p.poseTimeS > 0.5 && !(-0.6 >= landingSlope(h, j.xM))) {
      const id2 = p.poseId & 0xff;
      if (id2 === 7 || id2 === 10) {
        if (!(landingSlope(h, f32(j.xM + 5)) < landingSlope(h, j.xM))) {
          setPose(p, 8, j.slopeAngleRad, ctx.poses);
          p.poseTimeS = 0;
        }
      }
    }
  }

  // Landing while already falling (or after a bounce).
  if (j.landed) {
    landCrash(s, ctx, rng);
  }

  // Bounces while sliding fast after a crash.
  if (j.speedMPerS > 8 && L.phase === PHASE.crash && L.fallType !== 0 && !j.airborne && p.poseTimeS > 0) {
    if (L.bounceCount < 3) {
      L.bounceCount++;
      j.impulseYNs = f32(0.24 * j.vyMPerS * j.massKg * (detCos(j.impactAngleRad) + 0.5));
    }
    if (j.impulseYNs > 20) {
      if (!(j.impulseYNs >= 100)) j.impulseYNs = 100;
      if (!(j.impulseYNs <= 250)) j.impulseYNs = 250;
      j.impulseXNs = f32(-j.impulseYNs / 5);
      j.contactEvent = true;
      perturbPose(p, { offsetRad: 0, spreadRad: f32(0.9), rateBase: f32(0.5), rateSpread: f32(1.6) }, rng);
    }
  }
  if (L.fallType !== 0) {
    leg0.joints.target[8] = j.slopeAngleRad;
    leg0.joints.rate[8] = 1;
  }

  animatePose(p, dt);
}

/** Part of 0baf:9c52 run in the frame of a clean touchdown. Mutates `s`. */
function landClean(s: SimFrame, ctx: LogicContext, rng: BorlandRandom): void {
  const L = s.logic;
  const j = s.jumper;
  const p = s.pose;
  const [leg0, leg1] = p.legs;
  L.phase = PHASE.outrun;
  L.impact[0] = f32(Math.sqrt(Math.abs(detSin(j.impactAngleRad) * j.impactSpeedMPerS)) * 14);
  L.impact[1] = f32(L.landingPrepS * 92);
  const torso = Math.abs((leg0.joints.current[4] ?? 0) - (leg0.joints.target[4] ?? 0));
  const shin = Math.abs((leg0.joints.current[2] ?? 0) - (leg0.joints.target[2] ?? 0));
  // The original adds the first leg's term twice.
  L.impact[2] = f32(torso * 30 + shin * 20 + shin * 20);
  L.impact[3] = f32((leg0.joints.current[0] ?? 0) * 140 + (leg1.joints.current[0] ?? 0) * 140);
  L.impact[4] = f32(
    (2.16 - (leg0.segments.current[UPPER_SEGMENT] ?? 0) - (leg1.segments.current[UPPER_SEGMENT] ?? 0)) * 50,
  );
  L.impactMean = f32(
    ((L.impact[0] ?? 0) + (L.impact[1] ?? 0) + (L.impact[2] ?? 0) + (L.impact[3] ?? 0) + (L.impact[4] ?? 0)) / 5,
  );
  if (!(j.xM >= ctx.hill.takeoffXM)) {
    L.fallType = 2;
    L.impactMean = 40;
  }
  for (let k = 1; k <= 5; k++) {
    const v = (L.impact[k - 1] ?? 0) + L.impactMean;
    if (v > FALL_THRESHOLD) {
      L.fallType = k;
    }
    if (!(L.fallSeverity >= v)) {
      L.fallSeverity = toInt16(roundHalfEven(v));
    }
  }
  L.fallSeverity = toInt16(L.fallSeverity - 42 - rng.below(10));
  if (L.fallSeverity < 0) {
    L.fallSeverity = 0;
  }
  L.fallSeverity = toInt16((L.fallSeverity * L.fallSeverity) & 0xffff);
  if (L.fallSeverity > 700) {
    L.fallSeverity = 700;
  }
  if (L.fallType < 4) {
    applyLandingAbsorbPose(p, L.frontLeg, L.backLeg, L.landingPrepS, j.slopeAngleRad);
  }
  if (L.fallType === 1) {
    L.fallSeverity = 500;
  }
  if (L.fallType >= 1 && L.fallType <= 2) {
    leg0.segments.target[UPPER_SEGMENT] = f32(0.432);
    leg1.segments.target[UPPER_SEGMENT] = f32(0.432);
    leg0.segments.rate[UPPER_SEGMENT] = 1;
    leg1.segments.rate[UPPER_SEGMENT] = 1;
  }
  for (const leg of [L.backLeg, L.frontLeg]) {
    const base = L.fallSeverity + rng.below(toWord(L.fallSeverity)) / 2;
    L.legSpreadRad[leg] = f32((base * signedUnit(rng)) / 1300);
  }
  if (L.fallType >= 3 && L.fallType <= 4) {
    L.legSpreadRad[L.backLeg] = Math.abs(L.legSpreadRad[L.backLeg] ?? 0);
    L.legSpreadRad[L.frontLeg] = Math.abs(L.legSpreadRad[L.frontLeg] ?? 0);
  }
  for (const leg of [L.backLeg, L.frontLeg]) {
    const spread = L.legSpreadRad[leg] ?? 0;
    const joints = legOf(p, leg).joints;
    joints.target[0] = spread;
    joints.rate[0] = f32(5 * spread + 0.3);
  }
  for (const leg of [L.backLeg, L.frontLeg]) {
    const spread = L.legSpreadRad[leg] ?? 0;
    const joints = legOf(p, leg).joints;
    joints.target[3] = f32(0.24 + spread);
    joints.rate[3] = 3;
  }
  const spreadSum = () => Math.abs(L.legSpreadRad[L.backLeg] ?? 0) + Math.abs(L.legSpreadRad[L.frontLeg] ?? 0);
  leg0.joints.target[4] = f32((leg0.joints.target[4] ?? 0) - spreadSum());
  leg0.joints.rate[4] = 3;
  leg0.joints.target[6] = f32(spreadSum() * (rng.below(5) + 1) + (leg0.joints.target[6] ?? 0));
  leg0.joints.rate[6] = 5;
  leg1.joints.target[6] = f32(spreadSum() * (rng.below(5) + 1) + (leg1.joints.target[6] ?? 0));
  leg1.joints.rate[6] = 5;
  j.landed = false;
  p.poseTimeS = 0;
}

/** Distance, distance points, judges' notes. Mutates `s`. */
function scoreJump(s: SimFrame, ctx: LogicContext, rng: BorlandRandom): void {
  const L = s.logic;
  const j = s.jumper;
  const h = ctx.hill;
  if (j.xM > h.takeoffXM) {
    const arc = landingArcLengthM(h, h.takeoffXM, f32(j.xM - L.landingPrepS), DISTANCE_STEP_M);
    L.distanceM = f32(truncToInt(arc * 100) / 100);
    L.distanceHalfM = f32(truncToInt(L.distanceM * 2) / 2);
  } else {
    L.distanceHalfM = 0;
    L.distanceM = 0;
    L.startCountdown = -1;
    L.endFrame = L.frame - 30;
    L.finished = true;
  }
  L.points = distancePoints(L.points, L.distanceHalfM, ctx.kPointM);
  if (!L.finished) {
    L.finished = true;
    L.flightStyle = f32((L.flightStyle / (0.1 + L.flightTimeS)) * 3.5 - 0.4);
    if (!(L.takeoffTimingS >= 0)) L.takeoffTimingS = 0;
    if (!(L.flightStyle >= 0)) L.flightStyle = 0;
    if (!(0.35 >= L.flightStyle)) L.flightStyle = f32(0.35);
    for (const judge of L.judges) {
      let t = 20 - (Math.sqrt(Math.abs(L.legSpreadRad[0] ?? 0)) * (rng.below(75) + 40)) / 100;
      t -= (Math.sqrt(Math.abs(L.legSpreadRad[1] ?? 0)) * (rng.below(75) + 40)) / 100;
      const fallPenalty = (((L.fallType > 0 ? 1 : 0) * 10 * (rng.below(35) + 70)) & 0xffff) / 100;
      t -= fallPenalty;
      const late = 0.4 - L.landingPrepS;
      t -= (late * late * 18 * (rng.below(45) + 70)) / 100;
      t -= ((0.2 - L.takeoffTimingS) * 12.5 * (rng.below(55) + 60)) / 100;
      t -= (L.flightStyle * 10 * (rng.below(55) + 60)) / 100;
      t += randomCenteredFromRng(rng, 6);
      t += randomCenteredFromRng(rng, 2) * 0.4;
      t -= 0.3;
      judge.note = f32(t);
      if (judge.note > 20) judge.note = 20;
      if (judge.note > 10 && L.fallType > 0) judge.note = f32(10 - rng.below(15) / 10);
      if (!(judge.note >= 0)) judge.note = 0;
      judge.note = f32(roundHalfEven((0.24999 + judge.note) * 2) / 2);
    }
    let low = 21;
    let high = -1;
    let lowIndex = 0;
    let highIndex = 0;
    L.judges.forEach((judge, i) => {
      if (!(low <= judge.note)) {
        low = judge.note;
        lowIndex = i;
      }
      if (!(high >= judge.note)) {
        high = judge.note;
        highIndex = i;
      }
    });
    if (lowIndex === highIndex) {
      lowIndex = 3;
      highIndex = 4;
    }
    L.judges.forEach((judge, i) => {
      judge.counted = i !== lowIndex && i !== highIndex;
    });
    for (const judge of L.judges) {
      judge.showFrame = L.frame + 60 + rng.below(120);
      if (judge.showFrame > L.endFrame) {
        L.endFrame = judge.showFrame;
      }
    }
    for (const judge of L.judges) {
      if (judge.counted) {
        L.points = f32(L.points + judge.note);
      }
    }
  }
  L.landedFrame = L.frame;
  L.liftFactor = 1;
  L.bodyAngleRad = 1;
  L.points = f32(truncToInt(L.points * 10) / 10);
}

function randomCenteredFromRng(rng: BorlandRandom, samples: number): number {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    sum += rng.below(0xffff);
  }
  return f32((sum / samples / 65534) * 2 - 1);
}

/** Leg lengths that keep both feet on the slope while landing (5420..5438). Mutates `s`. */
function fitLegsToGround(s: SimFrame, ctx: LogicContext): void {
  const L = s.logic;
  const j = s.jumper;
  const p = s.pose;
  const front = legOf(p, L.frontLeg);
  const back = legOf(p, L.backLeg);
  const slope = j.xM > ctx.hill.takeoffXM ? landingSlope(ctx.hill, j.xM) : inrunSlope(ctx.hill, j.xM);
  const roll = p.legs[0].joints.current[8] ?? 0;
  const angleFront = f32((front.joints.current[2] ?? 0) + roll);
  const angleBack = f32((back.joints.current[2] ?? 0) + roll);
  let cosBack = f32(detCos(back.joints.current[3] ?? 0));
  let cosFront = f32(detCos(front.joints.current[3] ?? 0));
  let lengthFront = front.segments.current[UPPER_SEGMENT] ?? 0;
  let lengthBack = back.segments.current[UPPER_SEGMENT] ?? 0;
  if (cosFront === 0) cosFront = f32(0.001);
  if (cosBack === 0) cosBack = f32(0.001);
  const reach = (a: number) => detSin(a) - detCos(a) * slope;
  if (reach(angleBack) === 0) {
    lengthBack = f32(UPPER_SEGMENT_MAX_M);
  } else {
    lengthBack = f32((((reach(angleFront) * lengthFront) / reach(angleBack)) * cosFront) / cosBack);
    if (UPPER_SEGMENT_MAX_M < lengthBack || 0.216 > lengthBack) {
      if (!(UPPER_SEGMENT_MAX_M >= lengthBack)) lengthBack = f32(UPPER_SEGMENT_MAX_M);
      if (!(0.216 <= lengthBack)) lengthBack = f32(0.216);
      if (reach(angleFront) === 0) {
        lengthFront = f32(UPPER_SEGMENT_MAX_M);
      } else {
        lengthFront = f32((((reach(angleBack) * lengthBack) / reach(angleFront)) * cosBack) / cosFront);
      }
      if (!(UPPER_SEGMENT_MAX_M >= lengthFront)) lengthFront = f32(UPPER_SEGMENT_MAX_M);
      if (!(0.216 <= lengthFront)) lengthFront = f32(0.216);
    }
  }
  front.segments.target[UPPER_SEGMENT] = lengthFront;
  back.segments.target[UPPER_SEGMENT] = lengthBack;
  p.legs[0].segments.rate[UPPER_SEGMENT] = f32(1.5);
  p.legs[1].segments.rate[UPPER_SEGMENT] = f32(1.5);
}

/** Touchdown while a fall is already under way. Mutates `s`. */
function landCrash(s: SimFrame, ctx: LogicContext, rng: BorlandRandom): void {
  const L = s.logic;
  const j = s.jumper;
  const p = s.pose;
  const [leg0, leg1] = p.legs;
  j.landed = false;
  if (ctx.presentation) {
    rng.below(3000);
  }
  p.poseId = CRASH_POSE_ID;
  if (!(j.speedMPerS >= 5)) {
    p.poseTimeS = f32(-100);
  } else {
    p.poseTimeS = f32(-8 / (j.speedMPerS - 4.2) + rng.below(10) / 30);
  }
  leg0.joints.target[0] = leg0.joints.current[0] ?? 0;
  leg1.joints.target[0] = leg1.joints.current[0] ?? 0;
  perturbPose(
    p,
    {
      offsetRad: f32(0.01 * j.speedMPerS),
      spreadRad: f32(0.2 * j.speedMPerS),
      rateBase: f32((2 * j.speedMPerS) / 100),
      rateSpread: f32((3 * j.speedMPerS) / 100),
    },
    rng,
  );
  legOf(p, L.frontLeg).joints.rate[2] = 4;
  legOf(p, L.backLeg).joints.rate[2] = f32(2.5);
  leg0.joints.rate[4] = 2;
  leg1.joints.rate[5] = 2;
  const turn = roundHalfEven(((leg0.joints.current[4] ?? 0) - (0.5 * j.vxMPerS + rng.below(7)) / 10) / Math.PI);
  leg0.joints.target[4] = f32(turn * Math.PI);
  if (!(Math.PI / 4 >= Math.abs((leg0.joints.target[4] ?? 0) - (leg0.joints.current[4] ?? 0)))) {
    j.impulseYNs = f32(1 * j.vyMPerS * j.massKg * (detCos(j.impactAngleRad) + 0.5));
    if (!(j.impulseYNs <= 230)) j.impulseYNs = 230;
    if (!(0.5 * j.vyMPerS * j.massKg >= j.impulseYNs)) j.impulseYNs = f32(0.5 * j.vyMPerS * j.massKg);
    j.impulseXNs = f32(-j.impulseYNs / 5);
    j.contactEvent = true;
    perturbPose(p, { offsetRad: f32(0.6), spreadRad: f32(1.1), rateBase: f32(0.5), rateSpread: f32(1.6) }, rng);
    if (roundHalfEven((leg0.joints.target[4] ?? 0) / Math.PI) % 2 === 0) {
      leg0.joints.rate[4] = rng.below(3) + 4;
      leg0.joints.rate[5] = rng.below(3) + 4;
      leg0.joints.rate[2] = rng.below(3) + 3;
      leg1.joints.rate[2] = rng.below(3) + 3;
    } else {
      leg0.joints.rate[4] = rng.below(2) + 2;
      leg0.joints.rate[5] = rng.below(2) + 2;
      leg0.joints.rate[2] = rng.below(2) + 2;
      leg1.joints.rate[2] = rng.below(2) + 2;
      j.impulseYNs = f32(1.4 * j.impulseYNs);
    }
  }
  leg0.joints.target[5] = f32(rng.below(15) / 10 + (leg0.joints.target[4] ?? 0));
  for (const leg of [L.frontLeg, L.backLeg]) {
    const scale = rng.below(5) / 20;
    legOf(p, leg).joints.target[2] = f32(scale * (rng.below(3) - 1) + (leg0.joints.target[4] ?? 0));
  }
  if (j.speedMPerS > 8) {
    const half = roundHalfEven((leg0.joints.target[4] ?? 0) / Math.PI);
    if (half % 2 === 0) {
      leg0.joints.target[4] = f32((leg0.joints.target[4] ?? 0) - rng.below(15) / 20);
    } else {
      leg0.joints.target[4] = f32(rng.below(15) / 20 + (leg0.joints.target[4] ?? 0));
    }
    leg0.joints.target[6] = f32(
      roundHalfEven(((leg0.joints.current[6] ?? 0) - (rng.below(10) + 7) / 10) / Math.PI) * Math.PI,
    );
    leg1.joints.target[6] = f32(
      roundHalfEven(((leg1.joints.current[6] ?? 0) - (rng.below(10) + 7) / 10) / Math.PI) * Math.PI,
    );
    leg0.joints.target[7] = f32(rng.below(5) / 10 + 0.8);
    leg1.joints.target[7] = f32(rng.below(5) / 10 + 0.8);
    leg0.joints.target[3] = f32(rng.below(5) / 10 + 0.5);
    leg1.joints.target[3] = f32(rng.below(5) / 10 + 0.5);
  }
}
