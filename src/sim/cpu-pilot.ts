import type { BorlandRandom } from "./borland-random";
import { detAtan, detCos, detSin } from "./deterministic-math";
import { inrunYM, landingSlope, landingYM, terrainSlopeRad, type HillProfile } from "./hill-profile";
import { PHASE, type FrameInput } from "./jump-logic";
import { f32 } from "./physics-constants";
import { randomCentered } from "./wind";

/**
 * Computer jumpers of the original (docs/physics-spec.md, "Computer jumpers"): the per-jump setup
 * 0baf:8aeb, the per-frame pilot 0baf:8ee4 that replaces the mouse, and the draws of their talent (cup start)
 * and form (competition start). Every value the original keeps in a Single is rounded with f32 where it is
 * stored; intermediate results stay in doubles, as in the rest of the port.
 */

/** One computer jumper's record, DS:5cbf + 17 * index. */
export interface CpuJumperRecord {
  form1: number;
  form2: number;
  talent1: number;
  talent2: number;
  /** Skill level 0..4. */
  level: number;
}

/** State of the pilot, DS:3f56..3f7f. Written by the setup; the pilot changes only some of it. */
export interface CpuPilotState {
  /** 3f56: the impact correction of the telemark delay has not run yet. */
  impactPending: boolean;
  /** 3f57: a blundered jump (1 in 40): no impact correction, other landing limits. */
  blunder: boolean;
  /** 3f5c: time to the takeoff edge at which the first button goes down. */
  takeoffLeadS: number;
  /** 3f60: the same for the second button, never earlier than the first. */
  secondLeadS: number;
  /** 3f64: flight time before the first body correction. */
  flightHoldS: number;
  /** 3f68: time over which the correction threshold ramps up. */
  reactionS: number;
  /** 3f6c: what is left of reactionS. */
  reactionLeftS: number;
  /** 3f70: body angle the pilot steers towards. */
  targetBodyRad: number;
  /** 3f74: time to touchdown at which the landing button goes down. */
  landingLeadS: number;
  /** 3f78: landing preparation time after which the telemark button goes down. */
  telemarkDelayS: number;
  /** 3f7c: inrun height difference / 100; written by the setup and never read. */
  inrunDropHm: number;
}

/** What the pilot reads of the jump at the entry of read_input (0baf:9a3c). */
export interface CpuPilotView {
  frame: number;
  phase: number;
  xM: number;
  yM: number;
  vxMPerS: number;
  vyMPerS: number;
  speedMPerS: number;
  slopeAngleRad: number;
  bodyAngleRad: number;
  landingPrepS: number;
  /** Generator seed at the entry of read_input; the original restores it after the pilot. */
  randomSeed: number;
}

/** 1894: talent spread per level, Singles. */
const LEVEL_SPREAD = [4, 3, 2, 1, f32(0.2)] as const;
export const CPU_LEVEL_COUNT = LEVEL_SPREAD.length;
/** 5-level: the scale of the setup's level-dependent spreads. */
const LEVEL_SCALE_BASE = 5;
const K_POINT_SCALE_M = 250;
const TAKEOFF_LEAD_MIN_S = 0.108;
const TAKEOFF_LEAD_MAX_S = 0.252;
const TELEMARK_DELAY_MAX_S = 0.42;
const BLUNDER_ODDS = 40;
const GATE_FRAME = 70;
const NO_TOUCHDOWN_S = 10;
const IMPACT_PROBE_AHEAD_M = 5;
const IMPACT_LIMIT = 2;
const IMPACT_DELAY_PER_UNIT_S = 1.75;
const LOW_HEIGHT_M = 1.3;
const HIGH_HEIGHT_M = 3;
const BODY_DEAD_ZONE_RAD = 0.05;

/** 20e0:1e28 Random(n) over a 16-bit Word argument. */
const draw = (rng: BorlandRandom, n: number): number => rng.below(n);

/** 0baf:8aeb: the per-jump setup of a computer jumper. Consumes `rng` in the original order. */
export function setupCpuPilot(
  record: CpuJumperRecord,
  kPointM: number,
  hill: HillProfile,
  rng: BorlandRandom,
): CpuPilotState {
  const inrunDropHm = f32((inrunYM(hill, hill.startXM) - inrunYM(hill, hill.takeoffXM)) / 100);
  let takeoffLeadS = f32((record.talent1 / 12) * 0.8 + 0.18 + (record.form1 / 20) * 0.8 + randomCentered(rng, 6) / 25);
  takeoffLeadS = f32((K_POINT_SCALE_M - kPointM) / 10000 + takeoffLeadS);
  if (TAKEOFF_LEAD_MIN_S > takeoffLeadS) {
    takeoffLeadS = f32((0.65 - draw(rng, 15) / 100) * 0.18);
  }
  if (!(TAKEOFF_LEAD_MAX_S >= takeoffLeadS)) {
    takeoffLeadS = f32((draw(rng, 15) / 100 + 1.35) * 0.18);
  }
  const levelScale = LEVEL_SCALE_BASE - record.level;
  let secondLeadS = f32((levelScale / 70) * (randomCentered(rng, 4) * 0.5) + takeoffLeadS - 0.01);
  if (!(secondLeadS >= takeoffLeadS)) {
    secondLeadS = takeoffLeadS;
  }
  const flightHoldS = f32(draw(rng, 10) / 100 + 0.05);
  const reactionS = f32(draw(rng, 30) / 100 + 0.5);
  const targetBodyRad = f32(
    ((record.talent2 / 12) * 1.3 + record.form2 / 10 + randomCentered(rng, 6) / 15) / 1.7 + -0.38,
  );
  const landingBase = randomCentered(rng, 3) * 0.3 + 0.6;
  let landingLeadS = f32(landingBase + levelScale * Math.abs(randomCentered(rng, 3) + 0.7) * 0.15);
  const telemarkBase = randomCentered(rng, 3) * 0.4 + 0.35;
  let telemarkDelayS = f32(telemarkBase + randomCentered(rng, 2) * 0.1);
  if (!(telemarkDelayS >= 0)) {
    telemarkDelayS = 0;
  }
  if (!(TELEMARK_DELAY_MAX_S >= telemarkDelayS)) {
    telemarkDelayS = f32(TELEMARK_DELAY_MAX_S);
  }
  const blunder = draw(rng, BLUNDER_ODDS) === 1;
  if (blunder) {
    if (draw(rng, 2) === 1) {
      telemarkDelayS = f32(randomCentered(rng, 3) * 0.2 + 0.7);
      landingLeadS = f32(0.7 + landingLeadS);
    } else {
      landingLeadS = f32(randomCentered(rng, 2) * 0.3);
    }
  }
  return {
    impactPending: true,
    blunder,
    takeoffLeadS,
    secondLeadS,
    flightHoldS,
    reactionS,
    reactionLeftS: reactionS,
    targetBodyRad,
    landingLeadS,
    telemarkDelayS,
    inrunDropHm,
  };
}

/** Lands-in estimate of the pilot: time until the jumper meets the landing hill, or NO_TOUCHDOWN_S. */
function timeToTouchdownS(v: CpuPilotView, hill: HillProfile): number {
  const heightM = v.yM - landingYM(hill, v.xM);
  const ratio = v.vyMPerS / v.vxMPerS;
  let t = f32(((heightM / (ratio + landingSlope(hill, v.xM))) * v.vyMPerS) / v.vxMPerS);
  t = f32(t / v.vyMPerS);
  return t >= 0 ? t : NO_TOUCHDOWN_S;
}

/** Impact estimate of 9165..9239: how hard the jumper will meet the slope. */
function impactEstimate(v: CpuPilotView, hill: HillProfile): number {
  const angle =
    v.vxMPerS === 0
      ? f32(Math.PI - v.slopeAngleRad)
      : f32(Math.abs(detAtan(-v.vyMPerS / v.vxMPerS) - terrainSlopeRad(hill, f32(v.xM + IMPACT_PROBE_AHEAD_M))));
  const speed = f32(Math.sqrt(v.vyMPerS * v.vyMPerS + v.vxMPerS * v.vxMPerS));
  return f32(Math.sqrt(Math.abs(detSin(angle) * speed)));
}

/**
 * 0baf:8ee4: the input a computer jumper gives in one frame, and its pilot state afterwards. `rng` is a
 * generator at the seed of `view` that the caller throws away: the original restores the seed after the pilot.
 */
export function cpuPilotInput(
  pilot: CpuPilotState,
  view: CpuPilotView,
  hill: HillProfile,
  dtS: number,
  rng: BorlandRandom,
): { input: FrameInput; pilot: CpuPilotState } {
  const p = { ...pilot };
  let left = view.frame === GATE_FRAME;
  let right = false;
  let dy = 0;
  if (view.phase >= PHASE.crouch && view.phase <= PHASE.takeoff) {
    const toEdgeS = f32((hill.takeoffXM - view.xM) / detCos(view.slopeAngleRad) / view.speedMPerS);
    if (!(toEdgeS >= p.takeoffLeadS)) left = true;
    if (!(toEdgeS >= p.secondLeadS)) right = true;
  }
  if (view.phase >= PHASE.flightHold && view.phase <= PHASE.flight) {
    if (p.flightHoldS > 0) {
      p.flightHoldS = f32(p.flightHoldS - dtS);
    } else {
      p.flightHoldS = 0;
      p.reactionLeftS = f32(p.reactionLeftS - dtS);
      const offTarget = Math.abs(view.bodyAngleRad / p.targetBodyRad);
      const ramp = (p.reactionS - p.reactionLeftS) / p.reactionS;
      if (ramp > offTarget || !(p.reactionLeftS >= 0)) {
        if (view.bodyAngleRad - BODY_DEAD_ZONE_RAD - draw(rng, 30) / 100 > p.targetBodyRad) dy = 1;
        if (!(BODY_DEAD_ZONE_RAD + view.bodyAngleRad + draw(rng, 30) / 100 >= p.targetBodyRad)) dy = -1;
      }
    }
  }
  if (view.phase >= PHASE.flightHold && view.phase <= PHASE.landingPrep) {
    const touchdownS = timeToTouchdownS(view, hill);
    if (view.vyMPerS > 0) {
      if (!(touchdownS >= p.landingLeadS)) right = true;
      if (right && p.impactPending && !p.blunder) {
        const impact = impactEstimate(view, hill);
        if (impact > IMPACT_LIMIT) {
          p.telemarkDelayS = f32(p.telemarkDelayS - (impact - IMPACT_LIMIT) * IMPACT_DELAY_PER_UNIT_S);
        }
        p.impactPending = false;
      }
      if (!(p.telemarkDelayS >= view.landingPrepS)) left = true;
    }
    const blunder = p.blunder ? 1 : 0;
    const heightM = view.yM - landingYM(hill, view.xM);
    if (LOW_HEIGHT_M - blunder > heightM) right = true;
    if (!(blunder + HIGH_HEIGHT_M >= heightM)) {
      left = false;
      right = false;
    }
  }
  return { input: { left, right, dy }, pilot: p };
}

/** The talents of one computer jumper at the start of a cup (003f:4dda..4fb1). */
export interface CpuTalentDraw {
  talent1: number;
  talent2: number;
  level: number;
}

/** 003f:4dda..4fb1: talents for a level setting 0..4, or a random level for a larger setting. */
export function drawCpuTalents(levelSetting: number, rng: BorlandRandom): CpuTalentDraw {
  const level = levelSetting < CPU_LEVEL_COUNT ? levelSetting : draw(rng, CPU_LEVEL_COUNT);
  const spread = LEVEL_SPREAD[level] ?? 0;
  const talent = (): number => {
    const sign = draw(rng, 2) * 2 - 1;
    const base = sign * spread * 0.3;
    return f32(base + randomCentered(rng, 6) * (spread / 10 + 0.3));
  };
  const talent1 = talent();
  const talent2 = talent();
  return { talent1, talent2, level };
}

/** 003f:51c2..51dd: the form of one computer jumper for one competition. */
export function drawCpuForm(rng: BorlandRandom): { form1: number; form2: number } {
  const form1 = randomCentered(rng, 6);
  const form2 = randomCentered(rng, 6);
  return { form1, form2 };
}
