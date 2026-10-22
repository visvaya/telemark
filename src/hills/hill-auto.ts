import { BorlandRandom } from "../sim/borland-random";
import {
  characterProblems,
  generateHill,
  HillGenerationError,
  landingFallOf,
  sketchOf,
  type GeneratedHill,
  type GeneratorOptions,
  type HillCharacter,
  type LandingFall,
} from "./hill-generator";
import { hillShape, NEVER_ALIKE_K_GAP_M, shapeDistance } from "./hill-likeness";
import { geometryProblems, HILL_RULES } from "./hill-geometry";
import { HILL_LOOK_RULES } from "./hill-look-rules";
import type { HillProblem, HillSpec } from "./hill-spec";
import { OWN_HILL_SPECS } from "./own-hills";

/**
 * Hills from their size alone: the character is drawn from what is typical of the original's hills of that size,
 * so a hill needs no hand tuning. Every value of the original's 37 hills follows a linear trend over K (larger
 * hills have steeper landing hills and inruns, and fall away less right under the takeoff); the typical range is
 * the middle 80% of the originals around the trend (from the tenth to the ninetieth percentile of how far they lie
 * from it), measured 2026-10-22. The generator aims for typical hills; the rules admit the whole family
 * (`hill-family.ts`). A drawn character whose landing hill falls away unlike a typical one is drawn again before any
 * jump; one that the generator refuses (an unreachable target, a play rule, a hill too alike to another) is drawn
 * again from the next attempt's seed.
 */

/** A typical range: the trend at K = 0, its change per metre of K, and the middle 80% below and above it. */
interface TypicalRange {
  trendAtZero: number;
  trendPerMetreOfK: number;
  below: number;
  above: number;
}

/** The typical ranges of what the character sets. */
const TYPICAL_CHARACTER = {
  landingSteepnessDeg: { trendAtZero: 41.1178, trendPerMetreOfK: 0.019497, below: -4.8776, above: 4.535 },
  inrunSteepnessDeg: { trendAtZero: 46.42, trendPerMetreOfK: 0.030651, below: -5.8318, above: 4.0149 },
  takeoffAngleDeg: { trendAtZero: 5.7965, trendPerMetreOfK: 0.001992, below: -2.7555, above: 2.5653 },
  tableHeightM: { trendAtZero: 1.7052, trendPerMetreOfK: 0.001689, below: -0.5014, above: 0.4408 },
} as const satisfies Record<string, TypicalRange>;

const FALL_KEYS = [
  "dropAtTenthOfK",
  "dropAtQuarterOfK",
  "dropAtHalfOfK",
  "dropAtThreeQuartersOfK",
  "heightOverLength",
] as const satisfies readonly (keyof LandingFall)[];

/** The typical ranges of how the landing hill falls away under the takeoff (`landingFallOf`). */
export const TYPICAL_FALL = {
  dropAtTenthOfK: { trendAtZero: 0.0497, trendPerMetreOfK: -0.000087, below: -0.0048, above: 0.0062 },
  dropAtQuarterOfK: { trendAtZero: 0.0889, trendPerMetreOfK: -0.000024, below: -0.0149, above: 0.0147 },
  dropAtHalfOfK: { trendAtZero: 0.1923, trendPerMetreOfK: 0.000233, below: -0.0409, above: 0.0309 },
  dropAtThreeQuartersOfK: { trendAtZero: 0.3617, trendPerMetreOfK: 0.000561, below: -0.0609, above: 0.0741 },
  heightOverLength: { trendAtZero: 0.5347, trendPerMetreOfK: 0.000634, below: -0.0771, above: 0.0854 },
} as const satisfies Record<keyof LandingFall, TypicalRange>;

/** How the draw is made beyond the typical ranges. */
const AUTO = {
  /** Landing area past K, as a share of K: the middle of the generator's range. */
  landingAreaPastKShare: { min: 0.15, max: 0.3 },
  /**
   * The gate stands at most this far on a K45 and this much nearer per metre of K, at least at the scene's start:
   * a large hill needs the scene for its inrun and landing hill (the original's large hills start at 6 to 14 m).
   */
  gateMaxAtK45M: 30,
  gateNearerPerMetreOfK: 0.12,
  gateMinM: 6,
  /**
   * The gate stands at least this share of K from the scene's start: the deck behind it (the flat part and the
   * platform, which cannot reach behind the scene's start) must be at least the look rules' share of K, so a ski
   * flying hill's gate stands further on than a small hill's. A little over the rule, for rounding.
   */
  gateMinShareOfK: HILL_LOOK_RULES.deckShareOfKMin * 1.1,
  flatBehindGateM: { min: 0.5, max: 4 },
  /**
   * The oracle's best jump in calm lands this share of K past K: around the original's best jumps (7 to 8% of K on
   * the trend), at least 3 m wide and from K+3 m at the least, ending 2 m before the landing area's end.
   */
  bestPastKShare: { min: 0.04, max: 0.09 },
  /** The generator's limit of the target's end. */
  bestPastKMaxM: 25,
  /** Draws of a character whose landing hill is untypical, before one is generated; each is a few milliseconds. */
  drawsPerAttempt: 200,
  /**
   * Typical characters drawn for each attempt; the one farthest from every hill already there is generated. Each
   * is a few milliseconds, where a generation refused as too alike costs the search of its inrun (about 1.5 s).
   */
  candidatesPerAttempt: 8,
  /** Characters generated at most. */
  attempts: 30,
  /** Decimals of the drawn values, so that a character reads well. */
  decimals: 1,
} as const;

const KNOLLS = ["short", "medium", "long"] as const;
const LOOKS = ["day", "dusk", "winter"] as const;
/** Seeds of the draws stay within what `BorlandRandom` takes. */
const SEED_RANGE = 65_536;

const trendOf = (r: TypicalRange, kPointM: number): number => r.trendAtZero + r.trendPerMetreOfK * kPointM;
const round = (v: number, decimals: number): number => Number(v.toFixed(decimals));

/** A value drawn evenly from the typical range at this K. */
function drawTypical(
  rng: BorlandRandom,
  r: TypicalRange,
  kPointM: number,
  within: { min: number; max: number } = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
): number {
  const lo = Math.max(trendOf(r, kPointM) + r.below, within.min);
  const hi = Math.max(lo, Math.min(trendOf(r, kPointM) + r.above, within.max));
  return round(lo + (rng.below(1001) / 1000) * (hi - lo), AUTO.decimals);
}

const between = (rng: BorlandRandom, lo: number, hi: number, decimals: number): number =>
  round(lo + (rng.below(1001) / 1000) * (hi - lo), decimals);

/** Whether a landing hill falls away as a typical one of the original of this size does. */
export function isTypicalFall(fall: LandingFall, kPointM: number): boolean {
  return FALL_KEYS.every((key) => {
    const r: TypicalRange = TYPICAL_FALL[key];
    const t = trendOf(r, kPointM);
    return fall[key] >= t + r.below && fall[key] <= t + r.above;
  });
}

/** A character of the given size drawn from the typical ranges with `rng`, within the generator's limits. */
export function drawCharacter(kPointM: number, rng: BorlandRandom): HillCharacter {
  const T = TYPICAL_CHARACTER;
  const bestMinM = Math.max(3, Math.round(AUTO.bestPastKShare.min * kPointM));
  // The landing area holds a target 3 m wide that ends 2 m before its end, with a metre to spare for rounding.
  const areaMin = Math.max(AUTO.landingAreaPastKShare.min, Math.ceil(((bestMinM + 6) / kPointM) * 100) / 100);
  const area = between(rng, areaMin, Math.max(areaMin, AUTO.landingAreaPastKShare.max), 2);
  const gateMinM = Math.max(AUTO.gateMinM, Math.ceil(AUTO.gateMinShareOfK * kPointM * 10) / 10);
  const gateMaxM = Math.max(gateMinM, AUTO.gateMaxAtK45M - AUTO.gateNearerPerMetreOfK * (kPointM - 45));
  const gateXM = between(rng, gateMinM, gateMaxM, AUTO.decimals);
  const bestMaxM = Math.min(
    Math.max(bestMinM + 3, Math.round(AUTO.bestPastKShare.max * kPointM)),
    Math.floor(area * kPointM) - 2,
    AUTO.bestPastKMaxM,
  );
  return {
    kPointM,
    // Within the style rules every hill of the game passes: the landing at K, never steeper than the steepest point,
    // at most the rule's, and the takeoff in the rule's range (the original's typical takeoff reaches below it).
    landingSteepnessDeg: drawTypical(rng, T.landingSteepnessDeg, kPointM, {
      min: Number.NEGATIVE_INFINITY,
      max: HILL_RULES.landingAngleAtKMaxDeg,
    }),
    landingAreaPastKShare: area,
    knoll: KNOLLS[rng.below(KNOLLS.length)] ?? "medium",
    inrunSteepnessDeg: drawTypical(rng, T.inrunSteepnessDeg, kPointM),
    takeoffAngleDeg: drawTypical(rng, T.takeoffAngleDeg, kPointM, {
      min: HILL_RULES.takeoffAngleMinDeg,
      max: HILL_RULES.takeoffAngleMaxDeg,
    }),
    look: LOOKS[rng.below(LOOKS.length)] ?? "day",
    gateXM,
    flatBehindGateM: between(rng, AUTO.flatBehindGateM.min, Math.min(AUTO.flatBehindGateM.max, gateXM), AUTO.decimals),
    bestPastKM: { minM: bestMinM, maxM: bestMaxM },
    tableHeightM: Math.min(2.6, Math.max(1.2, drawTypical(rng, T.tableHeightM, kPointM))),
  };
}

/** Typical characters of this size: drawn until their landing hill falls away as a typical one does. */
function typicalCharacters(kPointM: number, rng: BorlandRandom, count: number): HillCharacter[] {
  const found: HillCharacter[] = [];
  for (let draw = 0; draw < AUTO.drawsPerAttempt && found.length < count; draw++) {
    const c = drawCharacter(kPointM, rng);
    if (characterProblems(c).length > 0) continue;
    const fall = landingFallOf(c);
    if (fall === undefined || !isTypicalFall(fall, kPointM)) continue;
    // Every geometry rule, the style ones too, as every hill of the game passes them; the inrun does not change
    // what they judge but its length, which the format and the scene check later.
    const sketch = sketchOf(c);
    if (sketch !== undefined && geometryProblems(sketch).length === 0) found.push(c);
  }
  return found;
}

/**
 * The candidate farthest from every hill already there, by the likeness distance without the inrun's drop (which
 * the search sets later; the whole distance is never less). Hills spread over the room the rules leave, and one
 * too alike to another is refused only where little room is left.
 */
function farthest(candidates: readonly HillCharacter[], known: readonly HillSpec[]): HillCharacter | undefined {
  let best: { c: HillCharacter; distance: number } | undefined;
  for (const c of candidates) {
    const sketch = sketchOf(c);
    if (sketch === undefined) continue;
    const near = known.filter((k) => Math.abs(k.kPointM - c.kPointM) < NEVER_ALIKE_K_GAP_M);
    const mine = hillShape(sketch);
    const distance = Math.min(
      Number.POSITIVE_INFINITY,
      ...near.map((k) => shapeDistance(mine, hillShape(k), { withInrun: false })),
    );
    if (best === undefined || distance > best.distance) best = { c, distance };
  }
  return best?.c;
}

export interface SizedHill extends GeneratedHill {
  character: HillCharacter;
  /** Characters generated before this one: those the generator refused. */
  refused: readonly { character: HillCharacter; problems: readonly HillProblem[] }[];
}

/**
 * A hill of the given K point and nothing else: typical characters drawn from `seed`, the one farthest from the
 * hills already there (`options.catalog`, the own hills by default, and `options.others`) generated with every
 * check of `generateHill`; a character the generator refuses is drawn again, up to `AUTO.attempts` times. The same
 * size, seed and options make the same hill.
 */
export function generateHillOfSize(kPointM: number, seed = 1, options: GeneratorOptions = {}): SizedHill {
  const refused: { character: HillCharacter; problems: readonly HillProblem[] }[] = [];
  for (let attempt = 0; attempt < AUTO.attempts; attempt++) {
    const rng = new BorlandRandom((seed * 7919 + attempt * 104_729 + kPointM) % SEED_RANGE);
    const known = [...(options.catalog ?? OWN_HILL_SPECS), ...(options.others ?? [])];
    const character = farthest(typicalCharacters(kPointM, rng, AUTO.candidatesPerAttempt), known);
    if (character === undefined) continue;
    try {
      return { ...generateHill(character, seed, options), character, refused };
    } catch (error) {
      if (!(error instanceof HillGenerationError)) throw error;
      refused.push({ character, problems: error.problems });
    }
  }
  throw new HillGenerationError(`no hill of K ${kPointM} m after ${AUTO.attempts} characters`, [
    {
      rule: "generator.no-typical-hill",
      path: "",
      message: refused.map((r) => r.problems.map((p) => p.rule).join(",")).join("; "),
    },
  ]);
}
