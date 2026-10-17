import { hillChoiceOf } from "../game/hill-choice";
import type { HillLook } from "../render/hill-look";
import { BorlandRandom } from "../sim/borland-random";
import { detCos, detExp, detSin } from "../sim/deterministic-math";
import type { InrunSpec, LandingSpec } from "../sim/hill-setup";
import { geometryProblems, hillGeometry, kFromSteepestMaxM, type HillGeometry } from "./hill-geometry";
import { hillDistance, LIKENESS } from "./hill-likeness";
import { oracleJump } from "./hill-oracle";
import { PLAY_RULES, playMeasures, playProblems, windClassSeeds } from "./hill-play";
import { HILL_SPEC_SCHEMA_VERSION, type HillProblem, type HillSpec } from "./hill-spec";
import { OWN_HILL_SPECS } from "./own-hills";
import { parseHillSpec } from "./parse-hill-spec";
import { REFERENCE_PLAYER_POLICY } from "./player-policy";

/**
 * A hill generator: a hill from a few values a person can understand (its character), instead of the fourteen
 * numbers of its profile. The profile is built by construction where the rules can be solved directly (the joins,
 * the angles, the K point near the steepest point, the length of the landing area) and by a short deterministic
 * search where they cannot (the inrun length, so that the best jump lands a few metres past K). Every number of
 * the construction comes from `GENERATOR`, chosen from the physics and the play targets, and the result is checked
 * by the same rules as every other hill: a hill that misses an admission or play rule is an error.
 */

/** How a hill is to be, in values a person sets. */
export interface HillCharacter {
  /** Size of the hill: the K point, in metres along the landing hill from the takeoff. */
  kPointM: number;
  /** Steepest angle of the landing hill, in degrees down. */
  landingSteepnessDeg: number;
  /** How far the landing area reaches past the K point, as a share of K (the landing hill is wider with more). */
  landingAreaPastKShare: number;
  /**
   * Where the steepest part of the landing hill lies against the K point: a long knoll puts it past K (the hill
   * steepens late and the first part is rounder), a short one before K.
   */
  knoll: "short" | "medium" | "long";
  /** Angle of the straight part of the inrun, in degrees down. */
  inrunSteepnessDeg: number;
  /** Angle of the inrun at the takeoff edge, in degrees down. */
  takeoffAngleDeg: number;
  /** Colours of the scene; the look does not change how the hill plays. */
  look: LookTheme;
  /**
   * Where the start gate stands: the inrun's start, horizontal metres from the scene's origin, from 6 to 34
   * (`CHARACTER_LIMITS`); 10 when not given. A gate further on leaves less of the scene to the inrun.
   */
  gateXM?: number;
  /** Length of the flat part behind the gate, from 0.5 to 7 m; 1.4 m when not given. */
  flatBehindGateM?: number;
  /**
   * How far past K the oracle's best jump on the calmest seed is to land, in metres: at least 3 m wide, from K+3 up
   * to K+18 at most, and short of the end of the landing area the character asks for; K+3..K+8 when not given.
   */
  bestPastKM?: { readonly minM: number; readonly maxM: number };
  /** Height of the takeoff table over the landing hill, from 1.2 to 2.6 m (within the rule's 1..3 m); 2 m when not given. */
  tableHeightM?: number;
}

/** Ranges of the optional values of a character. */
const CHARACTER_LIMITS = {
  gateXM: { min: 6, max: 34 },
  flatBehindGateM: { min: 0.5, max: 7 },
  tableHeightM: { min: 1.2, max: 2.6 },
  /** The best jump's target: its lowest start, its highest end, its least width, metres past K. */
  bestPastKM: { min: 3, max: 18, minWidthM: 3 },
  /** The target ends at least this far before the end of the landing area, metres. */
  bestBeforeAreaEndM: 2,
} as const;

/** Colours of a generated hill's scene: the default look's colours and its sky at three times of day. */
type LookTheme = "day" | "dusk" | "winter";

/**
 * The construction. Lengths in metres, angles in degrees.
 *
 * - The inrun starts at `inrunStartXM` with a short flat part behind the start gate, runs straight at the
 *   character's angle and then bends along a parabola into the takeoff angle. The bend's radius grows with the
 *   size of the hill (`inrunCurveRadiusPerKM` times K), because a faster jumper needs a gentler bend for the same
 *   pressure on the skis, up to `inrunCurveRadiusMaxM`: on a big hill a bend of a quarter of K takes so much of
 *   the scene that the straight part has no room left for the speed the hill needs. The straight part's length is
 *   what the search sets.
 * - The takeoff edge sits at `takeoffYM`; the landing hill starts the character's table height below it (by
 *   default `tableHeightM`, in the middle of the range the geometry rules allow). The inrun starts at the
 *   character's gate with its flat part behind it (by default `inrunStartXM` and `flatBehindStartM`).
 * - The landing hill is the format's tanh curve, `y = cY - A tanh((x - cX) / w)`: its steepest slope is `A / w`,
 *   so `A = w tan(steepness)`. The takeoff lies the knoll's number of widths before the centre.
 * - The outrun joins the tanh `outrunJoinWidths` past its centre, while the slope is still steep, and flattens
 *   along a parabola whose curvature puts its lowest point `outrunFlatM` past the end of the landing area (where
 *   the parabola gets gentler than the rules' 32 degrees). One rule for every size: the landing area ends inside
 *   the outrun's curve, rather than far down a tanh that flattens slowly, which would take a big hill past the
 *   scene. On a landing hill so gentle that the tanh reaches 32 degrees before that point, the outrun joins there.
 * - The width `w` is solved so that the arc from the takeoff to the end of the landing area is K times one plus
 *   the character's share; K is where the arc from the takeoff reaches K.
 * - Search: the straight part of the inrun from `inrunLineMinM` to the longest the format and the scene allow; the
 *   oracle's best jump on the calmest seed grows with it, so a bracketing search (false position) finds a length
 *   whose best jump lands between `best.fromKMinM` and `best.fromKMaxM` past K. The oracle starts from the
 *   reference player, so the hills do not change when the trained player does.
 */
const GENERATOR = {
  inrunStartXM: 10,
  flatBehindStartM: 1.4,
  inrunCurveRadiusPerKM: 0.25,
  /** The bend's radius at most: hills from K160 up take this one. */
  inrunCurveRadiusMaxM: 40,
  /**
   * The bend's radius at least: a quarter of K gives a small hill a bend so tight that it presses the jumper into
   * the skis harder than on any bigger hill at a lower speed; this floor keeps small hills' bends near the tightest
   * a hill of this game has.
   */
  inrunCurveRadiusMinM: 19,
  takeoffYM: 200,
  tableHeightM: 2,
  /** The takeoff lies this many widths of the landing tanh before its centre: a longer knoll rounds over more. */
  knollTakeoffWidths: { short: 1.2, medium: 1.35, long: 1.5 },
  /** Where the landing area gives way, the shares of K past K it may take: the style rule's range with a margin. */
  areaPastKShareRange: { min: 0.11, max: 0.39 },
  /** K lies at most this share of the style rule's limit from the steepest point, horizontally: a margin. */
  kFromSteepestShareOfRule: 0.8,
  /** The landing area ends within this many widths past the centre for any steepness the format allows. */
  areaEndMaxWidths: 10,
  /** Where the rules' landing area ends. */
  landingAreaEndDeg: 32,
  /** The underground blend of the inrun into the landing hill: below the takeoff, so only the look sees it. */
  knollBlend: 0.3,
  /** The outrun joins the landing tanh this many widths past its centre (the steepest point). */
  outrunJoinWidths: 0.3,
  /** From the end of the landing area to the outrun's lowest point, horizontally: the rule's 30 m with a margin. */
  outrunFlatM: 40,
  /** Step of the arc length integration of the outrun's parabola, in metres. */
  arcStepM: 0.05,
  /** Trees reach this far past the outrun's lowest point. */
  treesPastLowestM: 30,
  /** The first of the three distance marks lies this far before K. */
  firstMarkBeforeKM: 15,
  inrunLineMinM: 1,
  /** The format's limit of the end of the straight part. */
  inrunLineEndMaxXM: 150,
  /** The scene is drawn this far; the outrun's lowest point stays before it. */
  sceneEndXM: 379,
  /** Steps of the false position search; each runs the oracle once. */
  searchMaxSteps: 14,
  /** Bisection steps of the landing hill's solution. */
  solveSteps: 50,
  /** Step of the arc length integration of the landing hill, in widths of its tanh. */
  arcStepWidths: 0.001,
  /** Numbers of the spec are rounded to these many decimals: lengths, slopes, curve coefficients. */
  decimals: { lengthM: 2, slope: 4, curve: 6 },
} as const;

/** What the generator aims at when the character does not say: behaviour, not parameters. */
export const GENERATOR_TARGETS = {
  /** The oracle's best jump on the calmest seed lands this far past K. */
  best: { fromKMinM: 3, fromKMaxM: 8 },
} as const;

const gateOf = (c: HillCharacter): number => c.gateXM ?? GENERATOR.inrunStartXM;
const flatOf = (c: HillCharacter): number => c.flatBehindGateM ?? GENERATOR.flatBehindStartM;
const tableOf = (c: HillCharacter): number => c.tableHeightM ?? GENERATOR.tableHeightM;
const bestOf = (c: HillCharacter): { minM: number; maxM: number } =>
  c.bestPastKM ?? { minM: GENERATOR_TARGETS.best.fromKMinM, maxM: GENERATOR_TARGETS.best.fromKMaxM };

const outsideRange = (v: number, r: { min: number; max: number }): boolean => !(v >= r.min && v <= r.max);

/** Problems of a character's optional values against `CHARACTER_LIMITS`; empty when it has none. */
export function characterProblems(c: HillCharacter): HillProblem[] {
  const L = CHARACTER_LIMITS;
  const best = bestOf(c);
  const areaEndPastKM = c.landingAreaPastKShare * c.kPointM;
  const found: [boolean, string, string][] = [
    [outsideRange(gateOf(c), L.gateXM), "gateXM", `gate at ${gateOf(c)} m`],
    [outsideRange(flatOf(c), L.flatBehindGateM), "flatBehindGateM", `flat part ${flatOf(c)} m`],
    [outsideRange(tableOf(c), L.tableHeightM), "tableHeightM", `table ${tableOf(c)} m high`],
    [
      best.minM < L.bestPastKM.min || best.maxM > L.bestPastKM.max || best.maxM - best.minM < L.bestPastKM.minWidthM,
      "bestPastKM",
      `best jump K+${best.minM}..K+${best.maxM}`,
    ],
    [
      best.maxM > areaEndPastKM - L.bestBeforeAreaEndM,
      "bestPastKM",
      `best jump up to K+${best.maxM} reaches the landing area's end at K+${areaEndPastKM}`,
    ],
  ];
  return found.filter(([bad]) => bad).map(([, path, message]) => ({ rule: "generator.character", path, message }));
}

interface GeneratorReport {
  /** The oracle's best jump on the calmest seed, and its distance past K. */
  bestCalmM: number;
  bestCalmFromKM: number;
  /** Length of the straight part of the inrun the search set, horizontal metres. */
  inrunLineM: number;
  /** Oracle runs of the search. */
  searchSteps: number;
  /** The landing area past K the construction aimed at: the character's, unless it gave way to the K point. */
  landingAreaPastKShare: number;
  /** Style rules the hill misses: a target, reported rather than refused. */
  styleProblems: readonly HillProblem[];
  /** Whether the best jump of the search lies in the target range. */
  bestOnTarget: boolean;
  /** Whether the play rules judged the hill (up to the bots' limit), with no problem found. */
  playJudged: boolean;
  /** The closest own or other hill and its likeness distance; under `LIKENESS.tooAlike` is an error. */
  closestId: string | null;
  closestDistance: number;
}

export interface GeneratedHill {
  spec: HillSpec;
  report: GeneratorReport;
}

/** A generated hill that misses a format, admission or play rule, or is the same hill as another. */
export class HillGenerationError extends Error {
  readonly problems: readonly HillProblem[];

  constructor(message: string, problems: readonly HillProblem[]) {
    super(`${message}: ${problems.map((p) => `${p.rule} (${p.message})`).join("; ")}`);
    this.name = "HillGenerationError";
    this.problems = problems;
  }
}

export interface GeneratorOptions {
  /** Hills the result must not be too alike to, besides the catalog. */
  others?: readonly HillSpec[];
  /** The hills already in the game, which the result must not be too alike to: the own hills by default. */
  catalog?: readonly HillSpec[];
  /** Run the play rules on hills up to the bots' limit (the default); off only to save time where they run elsewhere. */
  checkPlay?: boolean;
}

const G = GENERATOR;
const DEG = Math.PI / 180;
const tanDeg = (deg: number): number => detSin(deg * DEG) / detCos(deg * DEG);
const round = (v: number, decimals: number): number => Number(v.toFixed(decimals));
const tanh = (u: number): number => (detExp(u) - detExp(-u)) / (detExp(u) + detExp(-u));

/** Slope dy/dx of the landing tanh at `u` widths from its centre, with steepest slope `-tanSteep`. */
function tanhSlope(u: number, tanSteep: number): number {
  const sum = detExp(u) + detExp(-u);
  return (-4 * tanSteep) / (sum * sum);
}

/** Arc length of the landing tanh between `fromU` and `toU` widths from its centre, per metre of width. */
function tanhArcPerWidth(fromU: number, toU: number, tanSteep: number): number {
  const steps = Math.max(1, Math.ceil(Math.abs(toU - fromU) / G.arcStepWidths));
  const du = (toU - fromU) / steps;
  let length = 0;
  for (let i = 0; i < steps; i++) {
    const s = tanhSlope(fromU + (i + 0.5) * du, tanSteep);
    length += Math.sqrt(1 + s * s) * du;
  }
  return length;
}

/** The smallest argument in [lo, hi] where an increasing function reaches `target`, by bisection. */
function bisect(lo: number, hi: number, f: (x: number) => number, target: number): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < G.solveSteps; i++) {
    const mid = (a + b) / 2;
    if (f(mid) < target) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/** The landing hill relative to the takeoff edge: centre, width and amplitude, the outrun and the landing area. */
interface LandingShape {
  centerFromTakeoffM: number;
  widthM: number;
  amplitudeM: number;
  /** Where the outrun's parabola joins the tanh, from the centre, and its quadratic coefficient. */
  outrunJoinFromCenterM: number;
  outrunCurveA: number;
  /** The outrun's lowest point, from the centre. */
  lowestFromCenterM: number;
  /** Where the K point lies from the centre (the steepest point), horizontally. */
  kFromCenterM: number;
  /** The landing area past K as a share of K: the character's, unless it gave way. */
  areaPastKShare: number;
}

/** The outrun's parabola from the join: its slope there (down), its curvature, and the landing area's end on it. */
interface OutrunCurve {
  tanJoin: number;
  curveA: number;
  /** Horizontal distance from the join to the end of the landing area, and the arc length of that stretch. */
  areaEndPastJoinM: number;
  areaArcPastJoinM: number;
}

/** Arc length of the outrun's parabola over `dxM` metres past the join. */
function outrunArcM(tanJoin: number, curveA: number, dxM: number): number {
  const steps = Math.max(1, Math.ceil(dxM / G.arcStepM));
  const step = dxM / steps;
  let length = 0;
  for (let i = 0; i < steps; i++) {
    const s = tanJoin - 2 * curveA * (i + 0.5) * step;
    length += Math.sqrt(1 + s * s) * step;
  }
  return length;
}

/** The landing hill with the takeoff `takeoffU` widths from the tanh's centre and the area `pastKShare` past K. */
function shapeOf(
  c: HillCharacter,
  pastKShare: number,
  takeoffU: number,
  joinU: number,
  outrun: OutrunCurve,
): LandingShape {
  const tanSteep = tanDeg(c.landingSteepnessDeg);
  const tanhArc = tanhArcPerWidth(takeoffU, joinU, tanSteep);
  const widthM = (c.kPointM * (1 + pastKShare) - outrun.areaArcPastJoinM) / tanhArc;
  const joinFromCenterM = joinU * widthM;
  const kFromCenterM =
    widthM * tanhArc >= c.kPointM
      ? widthM * bisect(takeoffU, joinU, (u) => widthM * tanhArcPerWidth(takeoffU, u, tanSteep), c.kPointM)
      : joinFromCenterM +
        bisect(
          0,
          outrun.areaEndPastJoinM,
          (dx) => outrunArcM(outrun.tanJoin, outrun.curveA, dx),
          c.kPointM - widthM * tanhArc,
        );
  return {
    centerFromTakeoffM: -takeoffU * widthM,
    widthM,
    amplitudeM: widthM * tanSteep,
    outrunJoinFromCenterM: joinFromCenterM,
    outrunCurveA: outrun.curveA,
    lowestFromCenterM: joinFromCenterM + outrun.tanJoin / (2 * outrun.curveA),
    kFromCenterM,
    areaPastKShare: pastKShare,
  };
}

/** The outrun of a landing hill of this steepness, joining the tanh `joinU` widths past its centre. */
function outrunOf(tanSteep: number, joinU: number): OutrunCurve {
  const tanAreaEnd = tanDeg(G.landingAreaEndDeg);
  const coshJoin = (detExp(joinU) + detExp(-joinU)) / 2;
  const tanJoin = tanSteep / (coshJoin * coshJoin);
  // From the area's end, where the slope is tan 32 degrees, the parabola flattens out within `outrunFlatM`.
  const curveA = round(tanAreaEnd / (2 * G.outrunFlatM), G.decimals.curve);
  const areaEndPastJoinM = Math.max(0, (tanJoin - tanAreaEnd) / (2 * curveA));
  return { tanJoin, curveA, areaEndPastJoinM, areaArcPastJoinM: outrunArcM(tanJoin, curveA, areaEndPastJoinM) };
}

/**
 * Solves the landing hill of a character; it does not depend on where the takeoff is. The outrun joins the tanh a
 * fixed number of widths past its centre, so its slope there and the parabola that flattens it depend on the
 * steepness alone, and so do the stretch of the parabola down to 32 degrees and its arc. The arc of the tanh
 * between two points a fixed number of widths from its centre is proportional to the width, so the width follows
 * from one division: the tanh's arc from the takeoff to the join plus the parabola's to the end of the landing
 * area is K times one plus the character's share. When that puts K further from the steepest point than the
 * generator's share of the rule's limit, the landing area gives way: its share is solved so K lies at that
 * distance (a longer area moves K back towards the takeoff). The knoll does not give way, because a long flat
 * knoll throws the jumper high above the slope.
 */
function landingShape(c: HillCharacter): LandingShape {
  const tanSteep = tanDeg(c.landingSteepnessDeg);
  const ratio = Math.sqrt(tanSteep / tanDeg(G.landingAreaEndDeg));
  // acosh by bisection: where the tanh gets as gentle as the end of the landing area, in widths past the centre.
  const tanhAreaEndU = bisect(0, G.areaEndMaxWidths, (u) => (detExp(u) + detExp(-u)) / 2, ratio);
  const joinU = Math.min(G.outrunJoinWidths, tanhAreaEndU);
  const outrun = outrunOf(tanSteep, joinU);
  const takeoffU = -G.knollTakeoffWidths[c.knoll];
  const shape = shapeOf(c, c.landingAreaPastKShare, takeoffU, joinU, outrun);
  const maxM = G.kFromSteepestShareOfRule * kFromSteepestMaxM(c.kPointM);
  if (Math.abs(shape.kFromCenterM) <= maxM) return shape;
  const limitM = Math.sign(shape.kFromCenterM) * maxM;
  const share = bisect(
    G.areaPastKShareRange.min,
    G.areaPastKShareRange.max,
    (s) => -shapeOf(c, s, takeoffU, joinU, outrun).kFromCenterM,
    -limitM,
  );
  return shapeOf(c, share, takeoffU, joinU, outrun);
}

/** The inrun and the landing hill with the straight part of the inrun `lineM` long. */
function profileOf(c: HillCharacter, shape: LandingShape, lineM: number): { inrun: InrunSpec; landing: LandingSpec } {
  const d = G.decimals;
  const lineSlope = round(-tanDeg(c.inrunSteepnessDeg), d.slope);
  const takeoffSlope = -tanDeg(c.takeoffAngleDeg);
  const radiusM = Math.max(
    G.inrunCurveRadiusMinM,
    Math.min(G.inrunCurveRadiusMaxM, G.inrunCurveRadiusPerKM * c.kPointM),
  );
  const curveA = round(1 / (2 * radiusM), d.curve);
  const lineEndXM = round(gateOf(c) + lineM, d.lengthM);
  const takeoffXM = round(lineEndXM + (takeoffSlope - lineSlope) / (2 * curveA), d.lengthM);
  const curveM = takeoffXM - lineEndXM;
  // The parabola's mean slope over the bend is the mean of its end slopes.
  const lineEndYM = G.takeoffYM - ((lineSlope + takeoffSlope) / 2) * curveM;
  const centerXM = takeoffXM + shape.centerFromTakeoffM;
  const landingTakeoffYM = G.takeoffYM - tableOf(c);
  const tanhAtTakeoff = tanh((takeoffXM - centerXM) / shape.widthM);
  const outrunStartXM = centerXM + shape.outrunJoinFromCenterM;
  return {
    inrun: {
      startXM: gateOf(c),
      flatEndXM: round(gateOf(c) - flatOf(c), d.lengthM),
      lineEndXM,
      takeoffXM,
      lineSlope,
      lineInterceptM: round(lineEndYM - lineSlope * lineEndXM, d.lengthM),
      curveA,
    },
    landing: {
      centerXM: round(centerXM, d.lengthM),
      centerYM: round(landingTakeoffYM + shape.amplitudeM * tanhAtTakeoff, d.lengthM),
      amplitudeM: round(shape.amplitudeM, d.lengthM),
      widthM: round(shape.widthM, d.lengthM),
      outrunStartXM: round(outrunStartXM, d.lengthM),
      outrunCurveA: shape.outrunCurveA,
      knollBlend: G.knollBlend,
    },
  };
}

const THEME_SKY_RGB6: Readonly<Record<LookTheme, readonly [number, number, number]>> = {
  day: [30, 50, 63],
  dusk: [44, 30, 36],
  winter: [44, 52, 58],
};

/**
 * Colours of the inrun's walls, the start gate and the fences, as palette indices: the darkest shade each uses,
 * on the scene palette's ramps (grey, blue, red, green, orange, violet, cyan for the walls; gold, red, blue,
 * yellow, orange, cyan, pink, violet for the fences). A hill takes one of each by its seed; lists of different
 * lengths give neighbouring seeds different combinations.
 */
const LOOK_COLOURS = {
  wall: [228, 100, 68, 84, 164, 212, 132],
  gate: [163, 67, 115, 99, 195, 83],
  fence: [192, 64, 96, 112, 160, 128, 176, 208],
} as const;

const colourOf = (list: readonly number[], seed: number): number =>
  list[((seed % list.length) + list.length) % list.length] ?? 0;

/** Seeds of the terrain and the trees are spread over their range by these odd multipliers. */
const LOOK_SEED_MULTIPLIERS = { terrain: 7919, trees: 104_729, shape: 31_337 } as const;
const SEED_RANGE = 65_536;

/**
 * Ranges the seed draws a generated hill's look from, so that hills differ in more than colour: the original's hills
 * use 2 to 6 supports, walls of 10 to 15 rows above the track and 3 to 40 below, platforms up to about 11 m and
 * terrain of 15 to 120 m. Supports: one under the start platform, then up to four along the inrun, each thin or wide.
 */
const LOOK_RANGES = {
  /**
   * The deck behind the gate (the flat part and the platform behind it) as a share of K: the original's hills use
   * from about 0.02 to 0.14 of K, most of them 0.04 to 0.07; a longer deck looks like a pier on a small hill.
   */
  deckShareOfK: { min: 0.035, max: 0.09 },
  /** The platform behind the flat part at least, in metres. */
  platformMinM: 0.5,
  nearWallUpPx: { min: 10, max: 15 },
  nearWallDownPx: [5, 11, 18, 26, 34],
  /**
   * Supports between the one under the platform and the one under the end of the inrun. The original's hills leave
   * long spans in between (a quarter to two thirds of the inrun), but their last support always reaches the
   * takeoff: it ends 0 to 3.5 m before the edge, mostly within 1 m, so the table never hangs in the air.
   */
  middleSupports: { min: 0, max: 3 },
  /** Length of the inrun each support between the two ends takes at least, in metres. */
  middleStretchMinM: 3,
  /** How far before the takeoff edge the last support ends, in metres. */
  endBeforeTakeoffM: { min: 0.1, max: 0.8 },
  /** A thin support's half width, and a wide one's at a 60 m long inrun (wider on longer inruns), in metres. */
  thinHalfM: { min: 0.4, max: 0.7 },
  wideHalfM: { min: 1, max: 3 },
  supportJitterShare: 0.15,
  supportColour: { min: 10, max: 13 },
  terrainAmplitudeM: { min: 25, max: 90 },
  treesFirstCount: { min: 40, max: 90 },
  treesSecondCount: { min: 10, max: 50 },
  fenceStartM: { min: -4, max: 2 },
} as const;

/** Draws from a range: integers when both ends are integers, otherwise a step of a tenth. */
function drawFrom(rng: BorlandRandom, r: { readonly min: number; readonly max: number }): number {
  const tenths = Math.round((r.max - r.min) * 10);
  return Number.isInteger(r.min) && Number.isInteger(r.max)
    ? r.min + rng.below(r.max - r.min + 1)
    : round(r.min + rng.below(tenths + 1) / 10, 1);
}

/** A length of the look rounded as the spec's lengths are. */
const at = (x: number): number => round(x, G.decimals.lengthM);

/**
 * The supports of the inrun: one under the platform, a wide one under the end of the inrun reaching almost to the
 * takeoff edge, and thin or wide ones in between.
 */
function supportsOf(inrun: InrunSpec, rng: BorlandRandom): HillLook["supports"] {
  const L = LOOK_RANGES;
  const colour = drawFrom(rng, L.supportColour);
  const lengthM = inrun.takeoffXM - inrun.flatEndXM;
  const widen = 1 + lengthM / 60;
  const under = {
    fromXM: at(Math.max(0, inrun.flatEndXM - drawFrom(rng, { min: 1, max: 3 }))),
    toXM: at(inrun.flatEndXM + 0.3),
  };
  const endToXM = inrun.takeoffXM - drawFrom(rng, L.endBeforeTakeoffM);
  const endFromXM = endToXM - 2 * drawFrom(rng, L.wideHalfM) * widen;
  const from = inrun.flatEndXM + 3;
  const to = endFromXM - 2;
  // Each support in between takes a stretch of at least `middleStretchMinM`, so a short inrun gets fewer or none.
  const count = Math.min(drawFrom(rng, L.middleSupports), Math.floor(Math.max(0, to - from) / L.middleStretchMinM));
  const stretchM = (to - from) / Math.max(1, count);
  const middle = Array.from({ length: count }, (_, i) => {
    const jitter = (rng.below(31) / 15 - 1) * L.supportJitterShare;
    const centre = from + stretchM * (i + 0.5 + jitter);
    const wide = rng.below(2) === 1;
    const half = wide ? drawFrom(rng, L.wideHalfM) * widen : drawFrom(rng, L.thinHalfM);
    // With the centre moved up to `supportJitterShare` of the stretch, 0.3 of it each way keeps neighbours apart.
    const halfM = Math.min(half, 0.3 * stretchM);
    return { fromXM: at(centre - halfM), toXM: at(Math.min(to, centre + halfM)), wide };
  });
  return [
    { ...under, colour, frontColour: 25 },
    ...middle.map(({ fromXM, toXM, wide }) => ({ fromXM, toXM, colour, frontColour: wide ? 25 : 17 })),
    { fromXM: at(Math.max(under.toXM + 1, endFromXM)), toXM: at(endToXM), colour, frontColour: 25 },
  ];
}

/**
 * The platform behind the flat part: so long that the deck behind the gate (the flat part and the platform) takes a
 * share of K in `deckShareOfK`, and at least `platformMinM`.
 */
function platformBehindM(c: HillCharacter, inrun: InrunSpec, rng: BorlandRandom): number {
  const L = LOOK_RANGES;
  const share = L.deckShareOfK.min + (rng.below(101) / 100) * (L.deckShareOfK.max - L.deckShareOfK.min);
  return Math.max(L.platformMinM, share * c.kPointM - (inrun.startXM - inrun.flatEndXM));
}

/**
 * The look of a generated hill: the theme's sky, and every position taken from the profile (the start platform
 * behind the gate, supports under the inrun ending before the takeoff, trees from the takeoff to past the
 * outrun's bottom, three marks before K). `seed` sets the colours of the inrun's walls, the start gate and the
 * fences, and draws the rest from `LOOK_RANGES`: the supports, the walls, the platform, the terrain, the trees and
 * where the fences start.
 */
export function lookOf(c: HillCharacter, inrun: InrunSpec, lowestXM: number, seed: number): HillLook {
  const L = LOOK_RANGES;
  const rng = new BorlandRandom((seed * LOOK_SEED_MULTIPLIERS.shape) % SEED_RANGE);
  const supports = supportsOf(inrun, rng);
  const nearWallDownPx = L.nearWallDownPx[rng.below(L.nearWallDownPx.length)] ?? L.nearWallDownPx[0];
  return {
    skyRgb6: THEME_SKY_RGB6[c.look],
    terrain: {
      seed: (seed * LOOK_SEED_MULTIPLIERS.terrain) % SEED_RANGE,
      amplitudeM: drawFrom(rng, L.terrainAmplitudeM),
      baseOverOutrunM: 3,
    },
    trees: {
      firstCount: drawFrom(rng, L.treesFirstCount),
      secondCount: drawFrom(rng, L.treesSecondCount),
      fromXM: at(inrun.takeoffXM),
      toXM: at(lowestXM + G.treesPastLowestM),
      seed: (seed * LOOK_SEED_MULTIPLIERS.trees) % SEED_RANGE,
      hidden: [],
    },
    supports,
    inrun: {
      platformStartXM: at(Math.max(0, inrun.flatEndXM - platformBehindM(c, inrun, rng))),
      nearWallUpPx: drawFrom(rng, L.nearWallUpPx),
      nearWallDownPx,
      wallColour: colourOf(LOOK_COLOURS.wall, seed),
      gateColour: colourOf(LOOK_COLOURS.gate, seed),
    },
    marks: {
      firstMarkM: c.kPointM - G.firstMarkBeforeKM,
      markCount: 3,
      fenceColour: colourOf(LOOK_COLOURS.fence, seed),
      fenceStartM: drawFrom(rng, L.fenceStartM),
    },
  };
}

/** The calmest seed of the play checks' wind scan: the wind the generator's best jump is measured in. */
const CALM_SEED: number = windClassSeeds(1, 256, 1).calm[0] ?? 1;

/** A stable id from the character and the seed: the same character always gets the same id. */
export function generatedHillId(c: HillCharacter, seed: number): string {
  if (
    c.gateXM !== undefined ||
    c.flatBehindGateM !== undefined ||
    c.bestPastKM !== undefined ||
    c.tableHeightM !== undefined
  ) {
    // The id has room for 40 characters: a character with the optional values is named by a hash of all of them.
    const values = [c.kPointM, c.landingSteepnessDeg, c.landingAreaPastKShare, c.knoll, c.inrunSteepnessDeg];
    const text = JSON.stringify([
      ...values,
      c.takeoffAngleDeg,
      gateOf(c),
      flatOf(c),
      bestOf(c).minM,
      bestOf(c).maxM,
      tableOf(c),
    ]);
    const hash = Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)).reduce(
      (h, code) => Math.imul(h ^ code, 0x01000193) >>> 0,
      0x811c9dc5,
    );
    return `gen-k${c.kPointM}-${hash.toString(16).padStart(8, "0")}-${c.look}${seed}`;
  }
  const knoll = { short: "s", medium: "m", long: "l" }[c.knoll];
  return [
    "gen",
    `k${c.kPointM}`,
    `l${Math.round(c.landingSteepnessDeg * 10)}`,
    `a${Math.round(c.landingAreaPastKShare * 100)}`,
    knoll,
    `i${Math.round(c.inrunSteepnessDeg * 10)}`,
    `t${Math.round(c.takeoffAngleDeg * 10)}`,
    `${c.look}${seed}`,
  ].join("-");
}

/** The hill's spec with the straight part of the inrun `lineM` long. */
function specOf(c: HillCharacter, shape: LandingShape, lineM: number, seed: number): HillSpec {
  const profile = profileOf(c, shape, lineM);
  return {
    schemaVersion: HILL_SPEC_SCHEMA_VERSION,
    id: generatedHillId(c, seed),
    name: "Generowana",
    kPointM: c.kPointM,
    profile,
    look: lookOf(c, profile.inrun, profile.landing.centerXM + shape.lowestFromCenterM, seed),
  };
}

/** The longest straight part of the inrun the format and the scene allow, for this landing hill. */
function longestLineM(c: HillCharacter, shape: LandingShape): number {
  const probe = profileOf(c, shape, 0);
  const lowestPastLineEndM = probe.landing.centerXM + shape.lowestFromCenterM - probe.inrun.lineEndXM;
  return Math.min(G.inrunLineEndMaxXM, G.sceneEndXM - lowestPastLineEndM) - gateOf(c);
}

interface SearchPoint {
  lineM: number;
  bestM: number;
}

const fromTarget = (c: HillCharacter, p: SearchPoint): number =>
  p.bestM - c.kPointM - (bestOf(c).minM + bestOf(c).maxM) / 2;
const onTarget = (c: HillCharacter, p: SearchPoint): boolean =>
  p.bestM - c.kPointM >= bestOf(c).minM && p.bestM - c.kPointM <= bestOf(c).maxM;

/**
 * The straight part of the inrun whose best jump lands in the target range: false position (the Illinois variant,
 * which halves the weight of an end that stays) between the shortest and the longest inrun, on the oracle's best
 * distance on the calmest seed. Returns the closest point found when the range is not reached within the steps.
 */
function searchInrun(c: HillCharacter, shape: LandingShape, seed: number): { point: SearchPoint; steps: number } {
  let steps = 0;
  const measure = (lineM: number): SearchPoint => {
    steps++;
    const hill = hillChoiceOf(specOf(c, shape, lineM, seed));
    return { lineM, bestM: oracleJump(hill, CALM_SEED, REFERENCE_PLAYER_POLICY).outcome.distanceM };
  };
  const error = (p: SearchPoint): number => fromTarget(c, p);
  const closer = (a: SearchPoint, b: SearchPoint): SearchPoint => (Math.abs(error(b)) < Math.abs(error(a)) ? b : a);
  let lo = measure(G.inrunLineMinM);
  if (error(lo) >= 0 || onTarget(c, lo)) return { point: lo, steps };
  let hi = measure(longestLineM(c, shape));
  if (error(hi) <= 0 || onTarget(c, hi)) return { point: hi, steps };
  let best = closer(lo, hi);
  let loWeight = 1;
  let hiWeight = 1;
  let side = 0;
  while (steps < G.searchMaxSteps) {
    const eLo = error(lo) * loWeight;
    const eHi = error(hi) * hiWeight;
    const p = measure(round((lo.lineM * eHi - hi.lineM * eLo) / (eHi - eLo), G.decimals.lengthM));
    best = closer(best, p);
    if (onTarget(c, p)) return { point: p, steps };
    if (error(p) < 0) {
      lo = p;
      loWeight = 1;
      if (side === -1) hiWeight /= 2;
      side = -1;
    } else {
      hi = p;
      hiWeight = 1;
      if (side === 1) loWeight /= 2;
      side = 1;
    }
  }
  return { point: best, steps };
}

/** The closest of `others` to `spec` by likeness, or none. */
function closestOf(spec: HillSpec, others: readonly HillSpec[]): { id: string | null; distance: number } {
  return others
    .map((other) => ({ id: other.id, distance: hillDistance(spec, other) }))
    .reduce<{ id: string | null; distance: number }>((b, o) => (o.distance < b.distance ? o : b), {
      id: null,
      distance: Number.POSITIVE_INFINITY,
    });
}

/** What the checks of a generated hill found, when it passed them. */
export interface GeneratedHillChecks {
  styleProblems: readonly HillProblem[];
  playJudged: boolean;
  closestId: string | null;
  closestDistance: number;
}

/**
 * The checks of a generated hill, cheapest first: the format, the admission rules, the likeness to the catalog
 * and to `options.others`, and the play rules up to the bots' limit. Throws `HillGenerationError` at the first
 * that fails; style problems are returned, because they are targets and not refusals.
 */
export function checkGeneratedHill(spec: HillSpec, options: GeneratorOptions = {}): GeneratedHillChecks {
  const parsed = parseHillSpec(spec);
  if (!parsed.ok) throw new HillGenerationError(`generated hill ${spec.id} is not valid hill data`, parsed.problems);
  const geometry = geometryProblems(spec);
  const admission = geometry.filter((p) => p.level === "admission");
  if (admission.length > 0) throw new HillGenerationError(`generated hill ${spec.id} is not admitted`, admission);
  const closest = closestOf(spec, [...(options.catalog ?? OWN_HILL_SPECS), ...(options.others ?? [])]);
  if (closest.distance < LIKENESS.tooAlike) {
    throw new HillGenerationError(`generated hill ${spec.id} is the same hill as another`, [
      { rule: "generator.too-alike", path: "", message: `likeness distance ${closest.distance} to ${closest.id}` },
    ]);
  }
  const playJudged = (options.checkPlay ?? true) && spec.kPointM <= PLAY_RULES.botReliableMaxKPointM;
  if (playJudged) {
    const play = playProblems(spec, playMeasures(hillChoiceOf(spec)));
    if (play.length > 0) throw new HillGenerationError(`generated hill ${spec.id} plays badly`, play);
  }
  return {
    styleProblems: geometry.filter((p) => p.level === "style"),
    playJudged,
    closestId: closest.id,
    closestDistance: closest.distance,
  };
}

/**
 * A hill of the given character. `seed` sets the scenery (terrain and trees) and the id; the profile depends on
 * the character alone. Throws `HillGenerationError` when the result misses a format, admission or play rule, or is
 * too alike to a hill of the catalog or one of `options.others` (`checkGeneratedHill`); the style rules and the best jump's
 * range are targets, and the report says whether they were reached.
 */
export function generateHill(character: HillCharacter, seed = 1, options: GeneratorOptions = {}): GeneratedHill {
  const asked = characterProblems(character);
  if (asked.length > 0) throw new HillGenerationError("the character is outside its ranges", asked);
  const shape = landingShape(character);
  const { point, steps } = searchInrun(character, shape, seed);
  const spec = specOf(character, shape, point.lineM, seed);
  return {
    spec,
    report: {
      bestCalmM: point.bestM,
      bestCalmFromKM: point.bestM - character.kPointM,
      inrunLineM: point.lineM,
      searchSteps: steps,
      bestOnTarget: onTarget(character, point),
      landingAreaPastKShare: shape.areaPastKShare,
      ...checkGeneratedHill(spec, options),
    },
  };
}

/** Measures of a hill's built profile. */
function geometryOf(spec: HillSpec): HillGeometry {
  const { profile, kPointM } = hillChoiceOf(spec);
  return hillGeometry(profile, kPointM);
}

/**
 * A hill made by an earlier version of the generator and kept as data (an own hill), taken as it is: measured and
 * checked as `generateHill` measures and checks what it makes, with nothing searched. A change of the construction
 * leaves such a hill as the game has it, since records and replays belong to its profile.
 */
export function keptHill(character: HillCharacter, spec: HillSpec, options: GeneratorOptions = {}): GeneratedHill {
  const point = {
    lineM: spec.profile.inrun.lineEndXM - spec.profile.inrun.startXM,
    bestM: oracleJump(hillChoiceOf(spec), CALM_SEED, REFERENCE_PLAYER_POLICY).outcome.distanceM,
  };
  return {
    spec,
    report: {
      bestCalmM: point.bestM,
      bestCalmFromKM: point.bestM - spec.kPointM,
      inrunLineM: point.lineM,
      searchSteps: 0,
      bestOnTarget: onTarget(character, point),
      landingAreaPastKShare: (geometryOf(spec).landingAreaEndM - spec.kPointM) / spec.kPointM,
      ...checkGeneratedHill(spec, options),
    },
  };
}
