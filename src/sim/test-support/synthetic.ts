import { terrainYM, type HillProfile } from "../hill-profile";
import { buildHillProfile } from "../hill-setup";
import { PHASE, type FrameInput } from "../jump-logic";
import type { JumpSimState } from "../jump-sim";
import { f32 } from "../physics-constants";
import type { WindState } from "../wind";

/** A hill made up for tests (not taken from the original game). */
export function syntheticHill(): HillProfile {
  return buildHillProfile(
    {
      startXM: 11.4,
      flatEndXM: 10,
      lineEndXM: 32,
      takeoffXM: 44,
      lineSlope: -0.9,
      lineInterceptM: 230,
      curveA: 0.0296,
    },
    { centerXM: 95, centerYM: 166, amplitudeM: 30, widthM: 40, outrunStartXM: 160, outrunCurveA: 0.012, knollBlend: 0 },
  );
}

export function calmWind(seedOffset = 0): WindState {
  return {
    xMPerS: f32(-0.4 + seedOffset * 0.1),
    yMPerS: f32(0.3),
    variabilityMPerS: f32(0.2),
    speedMPerS: f32(0.5),
    directionRad: f32(2.5),
    indicatorDirectionRad: f32(2.5),
    indicatorTurnRateRad: 0,
    indicatorMaxTurnRateRad: f32(0.2),
  };
}

export interface BotOptions {
  startFrame: number;
  /** Metres before the edge at which both takeoff buttons go down. */
  takeoffLeadM: number;
  /** Height above the terrain at which the landing button is pressed; null never lands. */
  landingHeightM: number | null;
  /** Mouse motion pattern during flight. */
  leanPattern: (frame: number) => number;
}

/** Input that reacts to the current state, like a player would. */
export function makeBot(
  hill: HillProfile,
  opts: BotOptions,
  current: () => JumpSimState,
): (frame: number) => FrameInput {
  return (frame) => {
    const s = current();
    const { phase } = s.logic;
    const j = s.jumper;
    if (frame === opts.startFrame) return { left: true, right: false, dy: 0 };
    if (phase === PHASE.crouch && j.xM >= hill.takeoffXM - opts.takeoffLeadM) return { left: true, right: true, dy: 0 };
    if (phase === PHASE.takeoff && !j.airborne) return { left: true, right: true, dy: 0 };
    if (phase === PHASE.flight) {
      const height = j.yM - terrainYM(hill, j.xM);
      if (opts.landingHeightM !== null && height < opts.landingHeightM) return { left: false, right: true, dy: 0 };
      return { left: false, right: false, dy: opts.leanPattern(frame) };
    }
    return { left: false, right: false, dy: 0 };
  };
}

/**
 * FNV-1a over the bytes of the main state, frame by frame: the jumper's motion, the body angle, every joint and
 * segment of both legs (the figure is drawn from all of them), the generator's seed and the phase. Byte by byte:
 * mixed as whole words, a sign flipped in two values cancels out ([1, 2] and [-1, -2] hash alike).
 */
export function stateHash(prev: number, s: JumpSimState): number {
  const view = new DataView(new ArrayBuffer(4));
  let h = prev >>> 0;
  const mixWord = () => {
    for (let byte = 0; byte < 4; byte++) h = Math.imul(h ^ view.getUint8(byte), 0x01000193) >>> 0;
  };
  const floats = [
    s.jumper.xM,
    s.jumper.yM,
    s.jumper.vxMPerS,
    s.jumper.vyMPerS,
    s.jumper.speedMPerS,
    s.logic.bodyAngleRad,
    ...s.pose.legs.flatMap((leg) => [
      ...leg.joints.current,
      ...leg.joints.target,
      ...leg.segments.current,
      ...leg.segments.target,
    ]),
  ];
  for (const v of floats) {
    view.setFloat32(0, v, true);
    mixWord();
  }
  for (const word of [s.randomSeed, s.logic.phase, s.pose.poseId]) {
    view.setUint32(0, word >>> 0, true);
    mixWord();
  }
  return h;
}
