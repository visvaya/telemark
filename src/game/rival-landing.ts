import type { CpuPilotState, CpuPilotView } from "../sim/cpu-pilot";
import { landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { PHASE, type FrameInput } from "../sim/jump-logic";

/**
 * How computer jumpers land. "original": the original's pilot unchanged; it starts the landing about 0.4 to 0.6 s before
 * the ground (weaker levels earlier), and a landing prepared that long often ends in a fall. "improved": the same
 * pilot, but the landing starts later, so the jumper lands like a good player. A layer over the ported pilot: the
 * simulation and the pilot itself are not changed, and a jump stays the same from the same seed.
 */
export const RIVAL_LANDINGS = ["original", "improved"] as const;
export type RivalLanding = (typeof RIVAL_LANDINGS)[number];

/**
 * The improved landing, measured with computer jumpers of every level on the own hills and the original's
 * (8640 jumps each way): the landing starts 0.31 to 0.43 s before the ground (the median by level, against 0.41 to
 * 0.57 s), and falls drop from 13.5% to 3.4%, nearly all of them the original's blundered jumps, which are kept.
 * The jumpers land 1.4 to 5.1 m farther (the weaker levels more) and score 5 to 12 points more.
 */
export const IMPROVED_LANDING = {
  /** The lead, by the pilot's estimate of the time to the ground, for a pilot whose own lead is at its base. */
  leadBaseS: 0.4,
  /** The base of the original's landing lead (0baf:8aeb); a longer lead (a weaker level) counts in part. */
  originalLeadBaseS: 0.6,
  /** The part of the original's lead above its base that the improved lead keeps, so weaker levels stay earlier. */
  originalLeadShare: 0.5,
  /** Lower than this above the landing hill, the landing starts sooner, as in the original's pilot... */
  lowHeightM: 1.3,
  /**
   * ...but only once the ground is this many leads away: low over a flat knoll the original's pilot starts it two
   * seconds early, and such a jump falls.
   */
  lowHeightWithinLeads: 3,
  /** Higher than this, no button counts, as in the original's pilot. */
  highHeightM: 3,
  /** The estimate when the path does not meet the hill. */
  noTouchdownS: 10,
} as const;

/** When an improved landing starts: the pilot's estimate of the time to the ground below which it presses. */
export function improvedLandingLeadS(pilot: CpuPilotState): number {
  const C = IMPROVED_LANDING;
  return C.leadBaseS + (pilot.landingLeadS - C.originalLeadBaseS) * C.originalLeadShare;
}

/** The time to the landing hill on a straight path, the estimate of the original's pilot (0baf:8ee4). */
function touchdownEstimateS(view: CpuPilotView, hill: HillProfile): number {
  const heightM = view.yM - landingYM(hill, view.xM);
  const t = heightM / (view.vyMPerS + landingSlope(hill, view.xM) * view.vxMPerS);
  return t >= 0 ? t : IMPROVED_LANDING.noTouchdownS;
}

/**
 * The input of a computer jumper in one frame under `landing`, from the input of the original's pilot (`input`)
 * and the pilot's state after it. Only the start of the landing in flight changes: the gate, the takeoff, the
 * flight position, the telemark button during the landing and a blundered jump stay the original's. The pilot still
 * runs its impact correction of the telemark delay when its own, earlier lead comes, and a telemark button it gives
 * in flight before the landing has started is dropped.
 */
export function rivalLandingInput(
  landing: RivalLanding,
  input: FrameInput,
  view: CpuPilotView,
  pilot: CpuPilotState,
  hill: HillProfile,
): FrameInput {
  if (landing === "original" || pilot.blunder) return input;
  if (view.phase < PHASE.flightHold || view.phase > PHASE.flight) return input;
  const C = IMPROVED_LANDING;
  const heightM = view.yM - landingYM(hill, view.xM);
  const leadS = improvedLandingLeadS(pilot);
  const touchdownS = view.vyMPerS > 0 ? touchdownEstimateS(view, hill) : C.noTouchdownS;
  const low = heightM < C.lowHeightM && touchdownS < leadS * C.lowHeightWithinLeads;
  const right = heightM <= C.highHeightM && (touchdownS < leadS || low);
  return { left: false, right, dy: input.dy };
}
