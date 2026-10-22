import type { HillChoice } from "../game/hill-choice";
import { LAYER_TABLE_LENGTH_M } from "../render/hill-layer-tables";
import { buildHillProfile } from "../sim/hill-setup";
import { hillGeometry } from "./hill-geometry";
import { oracleJump, type OracleResult } from "./hill-oracle";
import type { WindState } from "../sim/wind";
import {
  exactRivalJump,
  RIVAL_PLAYER_LEVELS,
  rivalJump,
  randomJump,
  scenarioJump,
  startWindOf,
  takeoffAimSearch,
  type AimSearch,
  type JumpOutcome,
  type Scenario,
} from "./hill-players";
import type { HillProblem, HillSpec } from "./hill-spec";
import { TRAINED_PLAYER_POLICY } from "./player-policy";

/** Thresholds of the simulation checks: what makes a hill play well and fairly, measured with the bots. */
export const PLAY_RULES = {
  /**
   * The rules judge hills up to this size. The rival players are credible on every size of the original's hills,
   * but the bounds below that are lengths are set on hills up to this size and do not yet grow with a larger hill.
   */
  botReliableMaxKPointM: 120,
  /** Takeoff aims within this distance of the best one count as hitting the takeoff. */
  windowToleranceM: 3,
  /**
   * No hill may require one exact frame of timing: the median takeoff window over the sweep seeds has at least
   * this many aim frames reaching the best distance. A 1-frame window appears now and then on any hill (the edge
   * falls between two frames on that wind), so the rule judges the median and a share, not the worst seed.
   */
  windowMinFrames: 2,
  /** Share of the sweep seeds whose takeoff window has at least `windowMinFrames` frames. */
  windowAtLeastMinMinShare: 0.75,
  /** Every sweep seed has at least this many clean takeoff aims: no wind may leave no clean takeoff at all. */
  windowCleanMinFrames: 1,
  /**
   * The good player's median lands near the K point: not far short of it, not far past it. The good rival goes
   * about 3 m further than the trained player did (the median over the hills up to K120), so the bound past it is
   * 3 m more than the trained player's 10 m.
   */
  goodMedianFromKMinM: -20,
  goodMedianFromKMaxM: 13,
  /** Skill must win: the good player beats the average one on at least this share of the same jumps. */
  goodBeatsAverageMinShare: 0.7,
  /**
   * A hill that throws practised players is unfair: falls (and disqualifications) of average and good players.
   * The average bot lands with a 0.5 m spread of its landing height, so an occasional fall is the bot's mistake,
   * not the hill's; a good player should almost never fall.
   */
  fallRateAverageMaxShare: 0.1,
  fallRateGoodMaxShare: 0.03,
  /** No wind class may throw a good player: falls of the good player within any one wind class of the sample. */
  goodFallsPerClassMax: 0,
  /**
   * The best jump, as the median over the wind seeds, reaches near the K point; less means the hill cannot be
   * jumped to its size. The median and not the worst seed: one strong head wind must not fail a fair hill.
   */
  bestFromKMinM: -10,
  /**
   * The oracle's best jump (the most points it finds, looking ahead at the wind) on the strongest seed of each wind
   * class stays within the landing area plus this much: no skilled player sails past it, even with the most helpful
   * wind class of the sample (the class whose best jump goes furthest).
   */
  bestPastLandingAreaMaxM: 5,
  /** A real flight: the good player's median time in the air. */
  goodMedianFlightMinS: 2.5,
  /**
   * Ski jumpers fly close to the slope; a 90th percentile higher than this means the profile throws them up. The
   * rivals fly up to 0.4 m higher than the trained player did on the hills up to K120, so 0.5 m more than its 8 m.
   */
  highestAboveTerrainP90MaxM: 8.5,
  /** Speed at the takeoff of every bot jump, within what a ski jump hill gives. */
  takeoffSpeedMinKmPerH: 50,
  takeoffSpeedMaxKmPerH: 120,
  /**
   * Wind may move a jump, but by less than skill does: deviation of the good player's distance at a fixed aim, as
   * a share of the K point, because the same wind carries a jumper further in a longer flight. Measured with the
   * exact rival: 5.5% on the training hill, up to 10.9% on the original's hills (K205).
   */
  windSpreadMaxShareOfK: 0.11,
  /** The scenery ends here; every designed and random jump must stop before it. */
  finalXMaxM: LAYER_TABLE_LENGTH_M,
  /**
   * How deep the jumper's point may go below the terrain in a designed or random jump. Measured 0 m on the
   * training hill over 316 random jumps; 0.5 m leaves room for rounding on another profile while still catching a
   * jumper who falls through the slope.
   */
  belowTerrainMaxM: 0.5,
} as const;

/**
 * Kinds of start wind the samples cover on purpose, each found by a score of the game's start wind for a seed
 * (`startWindOf`, known before the jump): the strongest head wind (most negative component along the hill), calm
 * (lowest speed), the strongest tail wind (most positive component along the hill) and the most variable wind
 * (largest scale of the random walk the wind takes during the jump).
 */
export const WIND_CLASSES = ["head", "calm", "tail", "variable"] as const;
export type WindClass = (typeof WIND_CLASSES)[number];

/** A value for each wind class, computed in the order of `WIND_CLASSES`. */
function byWindClass<T>(of: (windClass: WindClass) => T): Record<WindClass, T> {
  const head = of("head");
  const calm = of("calm");
  const tail = of("tail");
  const variable = of("variable");
  return { head, calm, tail, variable };
}

const WIND_CLASS_SCORE: Readonly<Record<WindClass, (wind: WindState) => number>> = {
  head: (w) => -w.xMPerS,
  calm: (w) => -w.speedMPerS,
  tail: (w) => w.xMPerS,
  variable: (w) => w.variabilityMPerS,
};

/**
 * Seeds of each wind class: among `scanSeeds` seeds from `firstSeed`, the `perClass` seeds with the highest score
 * of the class, strongest first, classes taken in the order of `WIND_CLASSES` and no seed in two classes.
 */
export function windClassSeeds(
  firstSeed: number,
  scanSeeds: number,
  perClass: number,
): Readonly<Record<WindClass, readonly number[]>> {
  const winds = Array.from({ length: scanSeeds }, (_, i) => ({
    seed: firstSeed + i,
    wind: startWindOf(firstSeed + i),
  }));
  const picked = new Set<number>();
  // Classes are picked in the order of WIND_CLASSES, so a seed goes to the first class that wants it.
  return byWindClass((windClass) => {
    const score = WIND_CLASS_SCORE[windClass];
    const seeds = winds
      .filter(({ seed }) => !picked.has(seed))
      .toSorted((a, b) => score(b.wind) - score(a.wind) || a.seed - b.seed)
      .slice(0, perClass)
      .map(({ seed }) => seed);
    for (const seed of seeds) picked.add(seed);
    return seeds;
  });
}

/** Landing height of the designed jumps, as the trained player's when coming down slowly (metres above the terrain). */
const SCENARIO_LANDING_HEIGHT_M = TRAINED_PLAYER_POLICY.landingHeightM;

const BASE_SCENARIO: Scenario = {
  name: "best aim",
  takeoffShiftFrames: 0,
  pose: "steady",
  landingHeightM: SCENARIO_LANDING_HEIGHT_M,
  landing: "telemark",
};

/**
 * Designed jumps, each run once on every wind class: one thing changed from a good player's jump at the best aim
 * (takeoff shifts in frames, positive is earlier; flight poses; landing presses), and one jump with several.
 */
export const DESIGNED_SCENARIOS: readonly Scenario[] = [
  BASE_SCENARIO,
  { ...BASE_SCENARIO, name: "takeoff far too early", takeoffShiftFrames: 20 },
  { ...BASE_SCENARIO, name: "takeoff early", takeoffShiftFrames: 4 },
  { ...BASE_SCENARIO, name: "takeoff late", takeoffShiftFrames: -4 },
  { ...BASE_SCENARIO, name: "no takeoff", takeoffShiftFrames: null },
  { ...BASE_SCENARIO, name: "pose forward", pose: "forward" },
  { ...BASE_SCENARIO, name: "pose back", pose: "back" },
  { ...BASE_SCENARIO, name: "pose oscillating", pose: "oscillating" },
  { ...BASE_SCENARIO, name: "landing early", landingHeightM: 8 },
  { ...BASE_SCENARIO, name: "landing two-footed", landing: "two-footed" },
  { ...BASE_SCENARIO, name: "no landing", landing: "none" },
  {
    ...BASE_SCENARIO,
    name: "late, oscillating, no landing",
    takeoffShiftFrames: -4,
    pose: "oscillating",
    landing: "none",
  },
];

/** How many jumps the checks run, per hill. */
export const PLAY_SAMPLE = {
  /** Jump seeds (wind) per wind class that each player level, and the exact bot for the wind alone, jumps on. */
  playerSeedsPerClass: 16,
  /** Jump seeds per wind class of the takeoff aim search (about 10 jumps each). */
  sweepSeedsPerClass: 4,
  /** Jumps with random inputs, a fuzz on top of the designed jumps (one per scenario and wind class). */
  randomJumps: 16,
  /** Seeds whose start wind is read to pick the seeds of each wind class. */
  scanSeeds: 256,
  /** First seed of each set; another start gives a disjoint sample of the same size. */
  firstScanSeed: 1,
  firstRandomSeed: 1,
} as const;

/** Seeds of the player's own errors are offset from the jump seeds, so the two do not repeat each other. */
export const NOISE_SEED_OFFSET = 100_000;

/** Plain numbers measured on a hill by the bots; no threshold is applied here. */
export interface PlayMeasures {
  /** Median takeoff window over the sweep seeds, in aim frames. */
  windowMedianFrames: number;
  /** Share of the sweep seeds with a takeoff window of at least `PLAY_RULES.windowMinFrames`. */
  windowAtLeastMinShare: number;
  /** Smallest takeoff window over the sweep seeds, in aim frames. */
  windowMinFrames: number;
  /** Median best distance of the aim search over its seeds. */
  bestMedianM: number;
  /** The furthest of the oracle's best jumps, one on the strongest seed of each wind class. */
  bestMaxM: number;
  /** The wind class of that jump: the most helpful one. */
  bestMaxWindClass: WindClass;
  medianWeakM: number;
  medianAverageM: number;
  medianGoodM: number;
  /** Share of paired jumps on which the good player went further than the average one. */
  goodBeatsAverageShare: number;
  fallRateAverage: number;
  fallRateGood: number;
  /** Falls (and disqualifications) of the good player in each wind class. */
  goodFallsByClass: Readonly<Record<WindClass, number>>;
  medianGoodFlightS: number;
  /** 90th percentile over all player jumps. */
  highestAboveTerrainP90M: number;
  takeoffSpeedMinKmPerH: number;
  takeoffSpeedMaxKmPerH: number;
  /** Standard deviation of an exact good player's distance at one fixed aim over the jump seeds. */
  windSpreadM: number;
  /** Names of the designed and random jumps that did not end before the frame cap, or produced a number that is not finite. */
  stressNotEnded: readonly string[];
  stressNotFinite: readonly string[];
  /** The furthest final x of a designed or random jump, and that jump's name. */
  stressFinalXMaxM: number;
  stressFinalXMaxName: string;
  /** The deepest point below the terrain in a designed or random jump, and that jump's name. */
  stressBelowTerrainMaxM: number;
  stressBelowTerrainMaxName: string;
}

export interface PlaySample {
  playerSeedsPerClass: number;
  sweepSeedsPerClass: number;
  randomJumps: number;
  scanSeeds: number;
  firstScanSeed: number;
  firstRandomSeed: number;
}

/** A designed or random jump, by name: `<wind class>/<scenario>` or `random/<seed>`. */
interface NamedJump {
  name: string;
  outcome: JumpOutcome;
}

/** Everything one evaluation of a hill ran: the measures and what they come from. */
export interface PlayEvaluation {
  measures: PlayMeasures;
  windSeeds: Readonly<Record<WindClass, readonly number[]>>;
  sweep: readonly (AimSearch & { windClass: WindClass })[];
  /** The aim the designed jumps take, in frames: the median best aim of the sweep. */
  aimFrames: number;
  /** The oracle's best jump on the strongest seed of each wind class, in the order of `WIND_CLASSES`. */
  oracle: readonly (OracleResult & { windClass: WindClass; seed: number })[];
  stress: readonly NamedJump[];
}

const seedsOf = (count: number, first: number): number[] => Array.from({ length: count }, (_, i) => first + i);

function quantile(values: readonly number[], q: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (at - lo);
}

const median = (values: readonly number[]): number => quantile(values, 0.5);

function deviation(values: readonly number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length);
}

const failed = (o: JumpOutcome): boolean => o.fell || o.disqualified;
const share = (outcomes: readonly JumpOutcome[], test: (o: JumpOutcome) => boolean): number =>
  outcomes.filter(test).length / outcomes.length;
const distances = (outcomes: readonly JumpOutcome[]): number[] => outcomes.map((o) => o.distanceM);

/** The jump with the largest value of `of`, by name; the first wins a tie. */
function largest(jumps: readonly NamedJump[], of: (o: JumpOutcome) => number): { name: string; value: number } {
  return jumps.reduce((b, j) => (of(j.outcome) > b.value ? { name: j.name, value: of(j.outcome) } : b), {
    name: "",
    value: Number.NEGATIVE_INFINITY,
  });
}

/** Runs the bots on a hill and keeps what they measured, with the seeds and jumps behind the measures. */
export function playEvaluation(hill: HillChoice, sample: PlaySample = PLAY_SAMPLE): PlayEvaluation {
  const perClass = Math.max(sample.playerSeedsPerClass, sample.sweepSeedsPerClass, 1);
  const windSeeds = windClassSeeds(sample.firstScanSeed, sample.scanSeeds, perClass);
  const classSeeds = (count: number) =>
    WIND_CLASSES.flatMap((windClass) => windSeeds[windClass].slice(0, count).map((seed) => ({ windClass, seed })));
  const sweepSeeds = classSeeds(sample.sweepSeedsPerClass);
  const searched = takeoffAimSearch(
    hill,
    sweepSeeds.map((s) => s.seed),
    PLAY_RULES.windowToleranceM,
    undefined,
    undefined,
    (seed, aim) => exactRivalJump(hill, seed, aim),
  );
  const sweep = searched.map((s, i) => ({ ...s, windClass: sweepSeeds[i]?.windClass ?? "calm" }));
  const windows = sweep.map((s) => s.windowFrames);
  // The pilot presses the takeoff by the time left to the edge, as the trained player aims, so the designed jumps
  // take this aim too.
  const aim = Math.round(median(sweep.map((s) => s.bestAimFrames)));
  const playerSeeds = classSeeds(sample.playerSeedsPerClass);
  const level = (rivalLevel: number) =>
    playerSeeds.map(({ seed }) => rivalJump(hill, seed, rivalLevel, seed + NOISE_SEED_OFFSET));
  const weak = level(RIVAL_PLAYER_LEVELS.weak);
  const average = level(RIVAL_PLAYER_LEVELS.average);
  const good = level(RIVAL_PLAYER_LEVELS.good);
  const players = [...weak, ...average, ...good];
  const lifted = players.filter((o) => o.takeoffSpeedKmPerH > 0).map((o) => o.takeoffSpeedKmPerH);
  const windOnly = playerSeeds.map(({ seed }) => exactRivalJump(hill, seed));
  const designed = WIND_CLASSES.flatMap((windClass) => {
    const [seed] = windSeeds[windClass];
    if (seed === undefined) return [];
    return DESIGNED_SCENARIOS.map((scenario) => ({
      name: `${windClass}/${scenario.name}`,
      outcome: scenarioJump(hill, seed, scenario, aim),
    }));
  });
  const random = seedsOf(sample.randomJumps, sample.firstRandomSeed).map((seed) => ({
    name: `random/${seed}`,
    outcome: randomJump(hill, seed, seed + NOISE_SEED_OFFSET),
  }));
  const stress = [...designed, ...random];
  const oracle = WIND_CLASSES.flatMap((windClass) => {
    const [seed] = windSeeds[windClass];
    return seed === undefined ? [] : [{ ...oracleJump(hill, seed), windClass, seed }];
  });
  const bestMax = oracle.reduce<(typeof oracle)[number] | null>(
    (b, o) => (b === null || o.outcome.distanceM > b.outcome.distanceM ? o : b),
    null,
  );
  const goodFallsByClass = byWindClass(
    (windClass) => good.filter((o, i) => playerSeeds[i]?.windClass === windClass && failed(o)).length,
  );
  const finalX = largest(stress, (o) => o.finalXM);
  const below = largest(stress, (o) => o.deepestBelowTerrainM);
  const measures: PlayMeasures = {
    windowMedianFrames: median(windows),
    windowAtLeastMinShare: windows.filter((w) => w >= PLAY_RULES.windowMinFrames).length / windows.length,
    windowMinFrames: Math.min(...windows),
    bestMedianM: median(sweep.map((s) => s.bestDistanceM)),
    bestMaxM: bestMax?.outcome.distanceM ?? 0,
    bestMaxWindClass: bestMax?.windClass ?? "calm",
    medianWeakM: median(distances(weak)),
    medianAverageM: median(distances(average)),
    medianGoodM: median(distances(good)),
    goodBeatsAverageShare: good.filter((o, i) => o.distanceM > (average[i]?.distanceM ?? 0)).length / good.length,
    fallRateAverage: share(average, failed),
    fallRateGood: share(good, failed),
    goodFallsByClass,
    medianGoodFlightS: median(good.map((o) => o.flightTimeS)),
    highestAboveTerrainP90M: quantile(
      players.map((o) => o.highestAboveTerrainM),
      0.9,
    ),
    takeoffSpeedMinKmPerH: Math.min(...lifted),
    takeoffSpeedMaxKmPerH: Math.max(...lifted),
    windSpreadM: deviation(distances(windOnly)),
    stressNotEnded: stress.filter((j) => !j.outcome.ended).map((j) => j.name),
    stressNotFinite: stress.filter((j) => !j.outcome.finite).map((j) => j.name),
    stressFinalXMaxM: finalX.value,
    stressFinalXMaxName: finalX.name,
    stressBelowTerrainMaxM: below.value,
    stressBelowTerrainMaxName: below.name,
  };
  return { measures, windSeeds, sweep, aimFrames: aim, stress, oracle };
}

/** Runs the bots on a hill and measures how it plays. */
export function playMeasures(hill: HillChoice, sample: PlaySample = PLAY_SAMPLE): PlayMeasures {
  return playEvaluation(hill, sample).measures;
}

const problem = (rule: string, message: string): HillProblem => ({ rule: `play.${rule}`, path: "", message });
const outside = (v: number, lo: number, hi: number): boolean => !(v >= lo && v <= hi);

/** Problems of a hill by the simulation rules, from its measures; empty when the hill passes them all. */
export function playProblems(spec: HillSpec, m: PlayMeasures): readonly HillProblem[] {
  const r = PLAY_RULES;
  const k = spec.kPointM;
  if (k > r.botReliableMaxKPointM) {
    return [
      problem(
        "bot-unreliable",
        `K ${k} m is above ${r.botReliableMaxKPointM} m, where the bots' steering decides more than the hill; ` +
          "this hill cannot pass until a stronger bot exists",
      ),
    ];
  }
  const { landingAreaEndM } = hillGeometry(buildHillProfile(spec.profile.inrun, spec.profile.landing), k);
  const checks: readonly [boolean, string, string][] = [
    [
      !(m.windowMedianFrames >= r.windowMinFrames),
      "takeoff-window",
      `median takeoff window of ${m.windowMedianFrames} frames`,
    ],
    [
      !(m.windowAtLeastMinShare >= r.windowAtLeastMinMinShare),
      "takeoff-window-share",
      `takeoff window of at least ${r.windowMinFrames} frames on ${m.windowAtLeastMinShare} of the winds`,
    ],
    [
      !(m.windowMinFrames >= r.windowCleanMinFrames),
      "takeoff-clean",
      `a wind with a takeoff window of ${m.windowMinFrames} frames`,
    ],
    [
      outside(m.medianGoodM - k, r.goodMedianFromKMinM, r.goodMedianFromKMaxM),
      "good-median",
      `good player's median ${m.medianGoodM} m on K ${k} m`,
    ],
    [
      !(m.medianWeakM < m.medianAverageM && m.medianAverageM < m.medianGoodM),
      "levels-ordered",
      `medians weak ${m.medianWeakM} m, average ${m.medianAverageM} m, good ${m.medianGoodM} m`,
    ],
    [
      !(m.goodBeatsAverageShare >= r.goodBeatsAverageMinShare),
      "skill-wins",
      `good beats average on ${m.goodBeatsAverageShare} of the jumps`,
    ],
    [
      !(m.fallRateAverage <= r.fallRateAverageMaxShare && m.fallRateGood <= r.fallRateGoodMaxShare),
      "fall-rate",
      `fall rates average ${m.fallRateAverage}, good ${m.fallRateGood}`,
    ],
    [
      WIND_CLASSES.some((c) => !(m.goodFallsByClass[c] <= r.goodFallsPerClassMax)),
      "good-falls-in-class",
      `good player's falls by wind class: ${WIND_CLASSES.map((c) => `${c} ${m.goodFallsByClass[c]}`).join(", ")}`,
    ],
    [!(m.bestMedianM >= k + r.bestFromKMinM), "best-short", `best distance only ${m.bestMedianM} m on K ${k} m`],
    [
      !(m.bestMaxM <= landingAreaEndM + r.bestPastLandingAreaMaxM),
      "best-past-landing-area",
      `best distance ${m.bestMaxM} m in the ${m.bestMaxWindClass} wind, past the landing area ending at ` +
        `${landingAreaEndM} m`,
    ],
    [!(m.medianGoodFlightS >= r.goodMedianFlightMinS), "flight-time", `median flight ${m.medianGoodFlightS} s`],
    [
      !(m.highestAboveTerrainP90M <= r.highestAboveTerrainP90MaxM),
      "flight-height",
      `90th percentile of the flight height ${m.highestAboveTerrainP90M} m`,
    ],
    [
      !(m.takeoffSpeedMinKmPerH >= r.takeoffSpeedMinKmPerH && m.takeoffSpeedMaxKmPerH <= r.takeoffSpeedMaxKmPerH),
      "takeoff-speed",
      `takeoff speed ${m.takeoffSpeedMinKmPerH}..${m.takeoffSpeedMaxKmPerH} km/h`,
    ],
    [
      !(m.windSpreadM <= r.windSpreadMaxShareOfK * k),
      "wind-spread",
      `wind moves the distance by ${m.windSpreadM} m on K ${k} m`,
    ],
    [
      m.stressNotEnded.length > 0,
      "stress-ends",
      `jumps that did not end before the frame cap: ${m.stressNotEnded.join(", ")}`,
    ],
    [
      m.stressNotFinite.length > 0,
      "stress-finite",
      `jumps that produced a number that is not finite: ${m.stressNotFinite.join(", ")}`,
    ],
    [
      !(m.stressFinalXMaxM <= r.finalXMaxM),
      "stress-within-scene",
      `jump ${m.stressFinalXMaxName} stopped at ${m.stressFinalXMaxM} m`,
    ],
    [
      !(m.stressBelowTerrainMaxM <= r.belowTerrainMaxM),
      "stress-below-terrain",
      `jump ${m.stressBelowTerrainMaxName} went ${m.stressBelowTerrainMaxM} m below the terrain`,
    ],
  ];
  return checks.filter(([bad]) => bad).map(([, rule, message]) => problem(rule, message));
}
