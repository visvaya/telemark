import { inrunYM, landingYM, type HillProfile } from "../sim/hill-profile";
import { buildHillProfile } from "../sim/hill-setup";
import { hillGeometry } from "./hill-geometry";
import type { HillSpec } from "./hill-spec";

/** A built hill: the K point and the profile, as a `HillChoice` carries them. */
interface BuiltHill {
  readonly kPointM: number;
  readonly profile: HillProfile;
}

/** How many points of the landing hill, evenly spaced from the takeoff to the end of the landing area, are compared. */
const LANDING_POINT_COUNT = 12;

/**
 * Differences that count as one unit of likeness distance. Each component is divided by its scale, so a change of
 * one scale in any single component weighs the same: a size that a jumper notices on the hill, not the spread of
 * the numbers themselves (a K point in metres and a slope share would otherwise differ by orders of magnitude).
 */
const LIKENESS_SCALES = {
  kPointM: 10,
  /** Root mean square of the landing hill's drop below the takeoff, as a share of K, over the compared points. */
  landingDropShareOfK: 0.02,
  /** Horizontal length from the takeoff to the end of the landing area, as a share of K. */
  landingSpanShareOfK: 0.05,
  inrunDropM: 5,
  takeoffAngleDeg: 1,
  tableHeightM: 0.5,
} as const;

export const LIKENESS = {
  /**
   * Two hills closer than this are the same hill to a jumper: every scale above is about the smallest difference a
   * jumper notices, so a distance under 1 is a difference hardly noticed. Set with a margin under the distance of
   * the closest two different hills of the original, so those count as different. Moving the profile numbers by a
   * share of their own value is no test of a copy: 1% of an absolute height already moves the takeoff table by
   * metres, which makes another hill to jump, judged by the other rules as any new hill.
   */
  tooAlike: 0.4,
} as const;

/** What describes how a hill plays and looks in profile, independent of its look. */
export interface HillShape {
  kPointM: number;
  /** Drop of the landing hill below the takeoff edge, as a share of K, at `LANDING_POINT_COUNT` even steps. */
  landingDropShareOfK: readonly number[];
  landingSpanShareOfK: number;
  inrunDropM: number;
  takeoffAngleDeg: number;
  tableHeightM: number;
}

const builtOf = (hill: HillSpec | BuiltHill): BuiltHill =>
  "schemaVersion" in hill
    ? { kPointM: hill.kPointM, profile: buildHillProfile(hill.profile.inrun, hill.profile.landing) }
    : hill;

/**
 * The shape of a hill. The landing hill is sampled at even fractions of its horizontal span to the end of the
 * landing area rather than at fixed metres, and its drops are divided by K, so hills of different sizes compare.
 */
export function hillShape(hill: HillSpec | BuiltHill): HillShape {
  const known = shapes.get(hill);
  if (known !== undefined) return known;
  const shape = measureShape(hill);
  shapes.set(hill, shape);
  return shape;
}

/**
 * Shapes already measured, by the hill's object: a hill's data is not changed once made (a new hill is a new
 * object), and one shape takes a walk along the whole profile, which the generator would repeat for every hill of
 * its catalog at every hill it makes.
 */
const shapes = new WeakMap<HillSpec | BuiltHill, HillShape>();

function measureShape(hill: HillSpec | BuiltHill): HillShape {
  const { kPointM, profile } = builtOf(hill);
  const g = hillGeometry(profile, kPointM);
  const takeoffY = inrunYM(profile, profile.takeoffXM);
  const span = g.landingAreaEndXM - profile.takeoffXM;
  return {
    kPointM,
    landingDropShareOfK: Array.from(
      { length: LANDING_POINT_COUNT },
      (_, i) => (takeoffY - landingYM(profile, profile.takeoffXM + (span * (i + 1)) / LANDING_POINT_COUNT)) / kPointM,
    ),
    landingSpanShareOfK: span / kPointM,
    inrunDropM: g.inrunDropM,
    takeoffAngleDeg: g.takeoffAngleDeg,
    tableHeightM: g.tableHeightM,
  };
}

const COMPONENT_COUNT = Object.keys(LIKENESS_SCALES).length;

/**
 * Hills whose K points differ by this much or more are never too alike: the K component alone makes the distance
 * at least |dK| / scale / sqrt(components), which reaches `LIKENESS.tooAlike` here (9.8 m).
 */
export const NEVER_ALIKE_K_GAP_M = LIKENESS.tooAlike * Math.sqrt(COMPONENT_COUNT) * LIKENESS_SCALES.kPointM;

/**
 * How unlike two hills are: the root mean square of the scaled differences of their shapes' components. The
 * landing points form one component (their own root mean square), so the profile does not outweigh the rest by
 * its number of points. Zero for the same hill, symmetric, and never negative.
 */
export function hillDistance(a: HillSpec | BuiltHill, b: HillSpec | BuiltHill): number {
  return shapeDistance(hillShape(a), hillShape(b));
}

/**
 * The likeness distance of two shapes (`hillDistance` of the hills they come from). Without the inrun's drop, it is
 * the distance less that one component: never more than the whole distance, and known before the generator's
 * search sets the inrun, so a hill it already puts beyond `LIKENESS.tooAlike` is no copy whatever the inrun.
 */
export function shapeDistance(x: HillShape, y: HillShape, { withInrun = true } = {}): number {
  const s = LIKENESS_SCALES;
  const drops = Math.sqrt(
    x.landingDropShareOfK.reduce((sum, v, i) => sum + (v - (y.landingDropShareOfK[i] ?? 0)) ** 2, 0) /
      LANDING_POINT_COUNT,
  );
  const parts = [
    (x.kPointM - y.kPointM) / s.kPointM,
    drops / s.landingDropShareOfK,
    (x.landingSpanShareOfK - y.landingSpanShareOfK) / s.landingSpanShareOfK,
    withInrun ? (x.inrunDropM - y.inrunDropM) / s.inrunDropM : 0,
    (x.takeoffAngleDeg - y.takeoffAngleDeg) / s.takeoffAngleDeg,
    (x.tableHeightM - y.tableHeightM) / s.tableHeightM,
  ];
  return Math.sqrt(parts.reduce((sum, p) => sum + p * p, 0) / COMPONENT_COUNT);
}
