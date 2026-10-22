import { SCENE_LENGTH_MAX_M, SCENE_PAST_OUTRUN_LOWEST_M } from "../render/hill-layer-tables";
import { inrunSlope, inrunYM, landingArcLengthM, landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { buildHillProfile } from "../sim/hill-setup";
import type { HillProblem, HillRuleLevel, HillSpec } from "./hill-spec";

/**
 * Design thresholds of a hill's geometry: what makes a hill fair to jump, as opposed to the format limits of
 * `HILL_SPEC_LIMITS`, which only say what the engine can take.
 */
export const HILL_RULES = {
  joinHeightGapMaxM: 0.01,
  joinSlopeGapMaxDeg: 0.5,
  takeoffAngleMinDeg: 6,
  takeoffAngleMaxDeg: 12,
  tableHeightMinM: 1,
  tableHeightMaxM: 3,
  landingAngleAtKMinDeg: 34,
  landingAngleAtKMaxDeg: 48,
  /**
   * Horizontal distance of the K point from the steepest point of the landing hill, either way: at most the larger
   * of a fixed floor and a share of K (`kFromSteepestMaxM`). On a bigger hill the nearly steepest stretch of the
   * landing hill is longer, so its steepest point may lie further from K. The share leaves the generator's big
   * hills room for its margin; the floor keeps small hills to the few metres a jumper can tell apart.
   */
  kFromSteepestMinM: 15,
  kFromSteepestShareOfK: 0.12,
  /** Where the landing area ends: the first point past the steepest one with a flatter slope than this. */
  landingAreaEndDeg: 32,
  /** Length of the landing area past the K point, as a share of the K point. */
  landingAreaPastKMinShare: 0.1,
  landingAreaPastKMaxShare: 0.4,
  outrunFlatMinM: 30,
  /**
   * The scenery of an own hill is drawn at most this far, a jumper's coast up the outrun past its lowest point
   * included (the original's hills keep the original's 380 m).
   */
  outrunLowestMaxXM: SCENE_LENGTH_MAX_M - SCENE_PAST_OUTRUN_LOWEST_M,
} as const;

/** How far the K point may lie from the steepest point of the landing hill, horizontally, on a hill of this K. */
export const kFromSteepestMaxM = (kPointM: number): number =>
  Math.max(HILL_RULES.kFromSteepestMinM, HILL_RULES.kFromSteepestShareOfK * kPointM);

/** Spacing of the samples along the hill, in metres. */
const SAMPLE_STEP_M = 0.1;
/** Step of the arc length integration, in metres. */
const ARC_STEP_M = 0.5;
const K_BISECTION_STEPS = 40;
/** How far before a join the left part is read, in metres. */
const BEFORE_JOIN_M = 1e-3;

/** Height and slope angle differences where two parts of the hill meet. */
interface JoinGap {
  heightM: number;
  slopeDeg: number;
}

export interface HillGeometry {
  joins: { flatToLine: JoinGap; lineToCurve: JoinGap; landingToOutrun: JoinGap };
  /** Angle of the inrun just before the takeoff, positive downwards. */
  takeoffAngleDeg: number;
  steepestInrunDeg: number;
  inrunDropM: number;
  /** Inrun height at the takeoff over the landing hill there. */
  tableHeightM: number;
  kXM: number;
  landingAngleAtKDeg: number;
  steepestLandingXM: number;
  steepestLandingDeg: number;
  landingAreaEndXM: number;
  /** Arc length of the landing hill from the takeoff to the end of the landing area. */
  landingAreaEndM: number;
  outrunLowestXM: number;
  /** Horizontal distance from the end of the landing area to the lowest point of the outrun. */
  outrunFlatM: number;
  inrunDescends: boolean;
  landingDescends: boolean;
}

/** Downward angle of a slope dy/dx, in degrees. */
const downDeg = (slope: number) => (-Math.atan(slope) * 180) / Math.PI;

/** Positions from `from` to `to` every `SAMPLE_STEP_M`, both ends included. */
function samples(from: number, to: number): number[] {
  // The last step ends on `to`: between half a step and a step and a half long, never a sliver.
  const count = Math.max(1, Math.round((to - from) / SAMPLE_STEP_M));
  return [...Array.from({ length: count }, (_, i) => from + i * SAMPLE_STEP_M), to];
}

const curveYM = (h: HillProfile, x: number) => h.inrunCurveA * x * x + h.inrunCurveB * x + h.inrunCurveCM;
const outrunYM = (h: HillProfile, x: number) => h.outrunCurveA * x * x + h.outrunCurveB * x + h.outrunCurveCM;

function joinGap(leftY: number, rightY: number, leftSlope: number, rightSlope: number): JoinGap {
  return { heightM: Math.abs(leftY - rightY), slopeDeg: Math.abs(downDeg(leftSlope) - downDeg(rightSlope)) };
}

function joinsOf(h: HillProfile): HillGeometry["joins"] {
  const flatEnd = h.inrunFlatEndXM;
  const lineEnd = h.inrunLineEndXM;
  const outrun = h.outrunStartXM;
  return {
    flatToLine: joinGap(inrunYM(h, flatEnd - BEFORE_JOIN_M), inrunYM(h, flatEnd), 0, h.inrunLineSlope),
    lineToCurve: joinGap(
      inrunYM(h, lineEnd),
      curveYM(h, lineEnd),
      h.inrunLineSlope,
      2 * h.inrunCurveA * lineEnd + h.inrunCurveB,
    ),
    landingToOutrun: joinGap(
      landingYM(h, outrun),
      outrunYM(h, outrun),
      landingSlope(h, outrun),
      2 * h.outrunCurveA * outrun + h.outrunCurveB,
    ),
  };
}

/** Landing arc length from the takeoff, guarded against the integrator's need of float32 ends past the start. */
function arcFromTakeoff(h: HillProfile, toXM: number): number {
  const to = Math.fround(toXM);
  return to > h.takeoffXM ? landingArcLengthM(h, h.takeoffXM, to, ARC_STEP_M) : 0;
}

/** Where the landing arc from the takeoff equals the K point: the arc is never shorter than its x span. */
function kPointXM(h: HillProfile, kPointM: number): number {
  const search = Array.from({ length: K_BISECTION_STEPS }).reduce<{ lo: number; hi: number }>(
    ({ lo, hi }) => {
      const mid = (lo + hi) / 2;
      return arcFromTakeoff(h, mid) < kPointM ? { lo: mid, hi } : { lo, hi: mid };
    },
    { lo: h.takeoffXM, hi: h.takeoffXM + kPointM },
  );
  return (search.lo + search.hi) / 2;
}

/** The lowest point of the outrun: the vertex of its parabola, or its start when that already rises. */
function outrunLowestXM(h: HillProfile): number {
  const vertex = h.outrunCurveA > 0 ? -h.outrunCurveB / (2 * h.outrunCurveA) : h.outrunStartXM;
  return Math.max(h.outrunStartXM, vertex);
}

/**
 * How much a sample may lie above the one before and still count as descending: near the bottom of a gentle outrun
 * two samples differ by less than single precision resolves at the hill's heights, so they can tie or swap.
 */
const RISE_TOLERANCE_M = 1e-3;

const descends = (xs: readonly number[], y: (x: number) => number) =>
  xs.every((x, i) => i === 0 || y(x) <= y(xs[i - 1] ?? x) + RISE_TOLERANCE_M);

function steepest(xs: readonly number[], angleAt: (x: number) => number): { xM: number; deg: number } {
  return xs.reduce<{ xM: number; deg: number }>(
    (best, x) => {
      const deg = angleAt(x);
      return deg > best.deg ? { xM: x, deg } : best;
    },
    { xM: xs[0] ?? 0, deg: Number.NEGATIVE_INFINITY },
  );
}

/** Measures of a built profile with its K point; finite for every hill the format allows. */
export function hillGeometry(h: HillProfile, kPointM: number): HillGeometry {
  const inrunXs = samples(h.startXM, h.takeoffXM);
  const lowestXM = outrunLowestXM(h);
  const landingXs = samples(h.takeoffXM, lowestXM);
  const landingDeg = (x: number) => downDeg(landingSlope(h, x));
  const steepestLanding = steepest(landingXs, landingDeg);
  const kXM = kPointXM(h, kPointM);
  const areaEndXM =
    landingXs.find((x) => x > steepestLanding.xM && landingDeg(x) < HILL_RULES.landingAreaEndDeg) ?? lowestXM;
  const takeoffY = inrunYM(h, h.takeoffXM);
  return {
    joins: joinsOf(h),
    takeoffAngleDeg: downDeg(inrunSlope(h, h.takeoffXM - BEFORE_JOIN_M)),
    steepestInrunDeg: steepest(inrunXs, (x) => downDeg(inrunSlope(h, x))).deg,
    inrunDropM: inrunYM(h, h.startXM) - takeoffY,
    tableHeightM: takeoffY - landingYM(h, h.takeoffXM),
    kXM,
    landingAngleAtKDeg: landingDeg(kXM),
    steepestLandingXM: steepestLanding.xM,
    steepestLandingDeg: steepestLanding.deg,
    landingAreaEndXM: areaEndXM,
    landingAreaEndM: arcFromTakeoff(h, areaEndXM),
    outrunLowestXM: lowestXM,
    outrunFlatM: lowestXM - areaEndXM,
    inrunDescends: descends(inrunXs, (x) => inrunYM(h, x)),
    landingDescends: descends(landingXs, (x) => landingYM(h, x)),
  };
}

/**
 * The level of each geometry rule. Admission rules are what the engine and the scene need, or what no hill of this
 * game lacks; style rules describe a modern hill, which the game's own hills follow and the play checks judge in
 * what matters (sailing past the landing area, stopping in the scene, landing near K).
 */
export const GEOMETRY_RULE_LEVELS = {
  /** A step in the track is a blow to the skis. */
  "join-height": "admission",
  /** A kink in the track is a blow to the skis. */
  "join-slope": "admission",
  /** A rising inrun can stop the jumper before the takeoff. */
  "inrun-descends": "admission",
  /** A rising landing hill is a wall the jumper flies into. */
  "landing-descends": "admission",
  /**
   * The scenery is drawn only this far, but what matters is that the jumper stops before it, which the play checks
   * judge; the outrun's lowest point may lie further (some of the original's hills have it past the scene).
   */
  "outrun-within-scene": "style",
  /** A table far above or below the landing hill makes the takeoff meaningless. */
  "table-height": "admission",
  /** The game's hills take off at angles well outside the modern range and play well. */
  "takeoff-angle": "style",
  /** The play checks judge whether a skilled player can sail past the landing area. */
  "landing-area-length": "style",
  /** The play checks judge whether the jumper stops inside the scene. */
  "outrun-length": "style",
  /** The play checks judge whether the good player lands near K. */
  "k-near-steepest": "style",
  /** The play checks judge whether the good player lands near K, where this slope matters. */
  "landing-angle-at-k": "style",
} as const satisfies Record<string, HillRuleLevel>;

type GeometryRule = keyof typeof GEOMETRY_RULE_LEVELS;

const problem = (rule: GeometryRule, message: string): HillProblem => ({
  rule: `geometry.${rule}`,
  path: "profile",
  message,
  level: GEOMETRY_RULE_LEVELS[rule],
});

const outside = (value: number, min: number, max: number) => !(value >= min && value <= max);
const r = HILL_RULES;

function joinProblems(g: HillGeometry): HillProblem[] {
  const named = [
    ["flat-to-line", g.joins.flatToLine, false],
    ["line-to-curve", g.joins.lineToCurve, true],
    ["landing-to-outrun", g.joins.landingToOutrun, true],
  ] as const;
  return named.flatMap(([name, gap, smooth]) => [
    ...(gap.heightM > r.joinHeightGapMaxM ? [problem("join-height", `step of ${gap.heightM} m at ${name}`)] : []),
    ...(smooth && gap.slopeDeg > r.joinSlopeGapMaxDeg
      ? [problem("join-slope", `kink of ${gap.slopeDeg} deg at ${name}`)]
      : []),
  ]);
}

/**
 * Problems of a hill's measures. The flat part of the inrun lies behind the start gate and meets the straight part
 * at its full angle, so only its height is checked.
 */
export function geometryRuleProblems(g: HillGeometry, kPointM: number): HillProblem[] {
  const pastK = (g.landingAreaEndM - kPointM) / kPointM;
  const checks: readonly [boolean, GeometryRule, string][] = [
    [
      outside(g.takeoffAngleDeg, r.takeoffAngleMinDeg, r.takeoffAngleMaxDeg),
      "takeoff-angle",
      `takeoff at ${g.takeoffAngleDeg} deg`,
    ],
    [outside(g.tableHeightM, r.tableHeightMinM, r.tableHeightMaxM), "table-height", `table ${g.tableHeightM} m high`],
    [
      outside(g.landingAngleAtKDeg, r.landingAngleAtKMinDeg, r.landingAngleAtKMaxDeg),
      "landing-angle-at-k",
      `landing at K is ${g.landingAngleAtKDeg} deg`,
    ],
    [
      !(Math.abs(g.kXM - g.steepestLandingXM) <= kFromSteepestMaxM(kPointM)),
      "k-near-steepest",
      `K is ${g.kXM - g.steepestLandingXM} m from the steepest point`,
    ],
    [
      outside(pastK, r.landingAreaPastKMinShare, r.landingAreaPastKMaxShare),
      "landing-area-length",
      `landing area ends ${pastK} of K past K`,
    ],
    [!(g.outrunFlatM >= r.outrunFlatMinM), "outrun-length", `outrun ${g.outrunFlatM} m long`],
    [!(g.outrunLowestXM <= r.outrunLowestMaxXM), "outrun-within-scene", `outrun bottom at ${g.outrunLowestXM} m`],
    [!g.inrunDescends, "inrun-descends", "the inrun rises somewhere"],
    [!g.landingDescends, "landing-descends", "the landing hill rises somewhere"],
  ];
  return [
    ...joinProblems(g),
    ...checks.filter(([failed]) => failed).map(([, rule, message]) => problem(rule, message)),
  ];
}

/** Problems of a hill's geometry by every rule, each with its level; empty when the hill passes them all. */
export function geometryProblems(spec: HillSpec): readonly HillProblem[] {
  const profile = buildHillProfile(spec.profile.inrun, spec.profile.landing);
  return geometryRuleProblems(hillGeometry(profile, spec.kPointM), spec.kPointM);
}

/** Geometry problems that refuse a hill: those of the admission rules. */
export function admissionProblems(spec: HillSpec): readonly HillProblem[] {
  return geometryProblems(spec).filter((p) => p.level === "admission");
}
