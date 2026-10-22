import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import {
  DESIGNED_SCENARIOS,
  PLAY_RULES,
  PLAY_SAMPLE,
  playEvaluation,
  playProblems,
  sizeGrowthM,
  WIND_CLASSES,
  windClassSeeds,
  windowToleranceOf,
  type PlayMeasures,
} from "./hill-play";
import type { HillSpec } from "./hill-spec";
import { OWN_HILL_SPECS } from "./own-hills";

/**
 * The whole evaluation of one hill takes about 4 s alone; under coverage, which instruments the simulation, and the
 * full parallel suite on a slow machine it takes several times longer.
 */
const EVALUATION_TIMEOUT_MS = 120_000;

const [training] = OWN_HILL_SPECS;
if (training === undefined) throw new Error("no own hill");

/** Measures that pass every rule on the training hill (K 90 m, landing area ending near 121 m). */
const passing: PlayMeasures = {
  windowMedianFrames: 3,
  windowAtLeastMinShare: 1,
  windowMinFrames: 3,
  bestMedianM: 84,
  bestMaxM: 94,
  bestMaxWindClass: "head",
  medianWeakM: 63,
  medianAverageM: 77,
  medianGoodM: 84,
  goodBeatsAverageShare: 0.9,
  fallRateAverage: 0,
  fallRateGood: 0,
  goodFallsByClass: { head: 0, calm: 0, tail: 0, variable: 0 },
  medianGoodFlightS: 3.9,
  highestAboveTerrainP90M: 5,
  takeoffSpeedMinKmPerH: 69,
  takeoffSpeedMaxKmPerH: 72,
  windSpreadM: 5,
  stressNotEnded: [],
  stressNotFinite: [],
  stressFinalXMaxM: 190,
  stressFinalXMaxName: "tail/best aim",
  stressBelowTerrainMaxM: 0,
  stressBelowTerrainMaxName: "head/best aim",
};

const rulesOf = (spec: HillSpec, change: Partial<PlayMeasures>) =>
  playProblems(spec, { ...passing, ...change }).map((p) => p.rule);

describe("play rules", () => {
  // The evaluation in detail on the training hill; every other own hill plays the rules in the stability tier
  // (hill-play.stability.test.ts), which runs whenever the hills, the simulation or the game change.
  describe.each([[training.id, training] as const])("%s", (id, spec) => {
    const hill = OWN_HILLS.find((h) => h.id === id);
    if (hill === undefined) throw new Error(`no hill ${id}`);
    let evaluation: ReturnType<typeof playEvaluation> | undefined;
    const evaluate = () => {
      evaluation ??= playEvaluation(hill);
      return evaluation;
    };

    it(
      "plays well and fairly",
      () => {
        expect(playProblems(spec, evaluate().measures)).toEqual([]);
      },
      EVALUATION_TIMEOUT_MS,
    );

    it(
      "takes every wind class into the aim search, the players and the designed jumps in equal shares",
      () => {
        const { windSeeds, sweep, stress } = evaluate();
        for (const windClass of WIND_CLASSES) {
          expect(windSeeds[windClass]).toHaveLength(PLAY_SAMPLE.playerSeedsPerClass);
          expect(sweep.filter((s) => s.windClass === windClass)).toHaveLength(PLAY_SAMPLE.sweepSeedsPerClass);
          expect(stress.filter((j) => j.name.startsWith(`${windClass}/`))).toHaveLength(DESIGNED_SCENARIOS.length);
        }
        expect(stress.filter((j) => j.name.startsWith("random/"))).toHaveLength(PLAY_SAMPLE.randomJumps);
      },
      EVALUATION_TIMEOUT_MS,
    );

    it(
      "takes the best past the landing area from the oracle's jump on the strongest seed of each wind class",
      () => {
        const { oracle, measures, windSeeds } = evaluate();
        expect(oracle.map((o) => o.windClass)).toEqual([...WIND_CLASSES]);
        expect(oracle.map((o) => o.seed)).toEqual(WIND_CLASSES.map((c) => windSeeds[c][0]));
        const furthest = Math.max(...oracle.map((o) => o.outcome.distanceM));
        expect(measures.bestMaxM).toBe(furthest);
        expect(oracle.find((o) => o.outcome.distanceM === furthest)?.windClass).toBe(measures.bestMaxWindClass);
        expect(oracle.every((o) => !o.outcome.fell && !o.outcome.disqualified)).toBe(true);
      },
      EVALUATION_TIMEOUT_MS,
    );
  });

  it("picks the strongest winds of each class, no seed in two classes", () => {
    const seeds = windClassSeeds(1, 64, 4);
    const all = WIND_CLASSES.flatMap((c) => seeds[c]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((s) => s >= 1 && s <= 64)).toBe(true);
  });

  it("names every designed jump differently", () => {
    const names = DESIGNED_SCENARIOS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("passes the hand-made measures", () => {
    expect(rulesOf(training, {})).toEqual([]);
  });

  it("tolerates a single 1-frame window and the bot's occasional fall", () => {
    expect(rulesOf(training, { windowMinFrames: 1, windowAtLeastMinShare: 0.9375, fallRateAverage: 0.1 })).toEqual([]);
  });

  it.each<[string, Partial<PlayMeasures>]>([
    ["play.takeoff-window", { windowMedianFrames: 1.5 }],
    ["play.takeoff-window-share", { windowAtLeastMinShare: 0.7 }],
    ["play.takeoff-clean", { windowMinFrames: 0 }],
    ["play.good-median", { medianGoodM: 69, medianAverageM: 60, medianWeakM: 50 }],
    ["play.good-median", { medianGoodM: 104 }],
    ["play.levels-ordered", { medianAverageM: 85 }],
    ["play.levels-ordered", { medianWeakM: 77 }],
    ["play.skill-wins", { goodBeatsAverageShare: 0.6 }],
    ["play.fall-rate", { fallRateAverage: 0.11 }],
    ["play.fall-rate", { fallRateGood: 0.04 }],
    ["play.best-short", { bestMedianM: 79 }],
    ["play.best-past-landing-area", { bestMaxM: 127 }],
    ["play.flight-time", { medianGoodFlightS: 2.4 }],
    ["play.flight-height", { highestAboveTerrainP90M: 8.6 }],
    ["play.takeoff-speed", { takeoffSpeedMinKmPerH: 45 }],
    ["play.takeoff-speed", { takeoffSpeedMaxKmPerH: 125 }],
    ["play.wind-spread", { windSpreadM: 10 }],
    ["play.good-falls-in-class", { goodFallsByClass: { head: 0, calm: 0, tail: 1, variable: 0 } }],
    ["play.stress-ends", { stressNotEnded: ["calm/no landing"] }],
    ["play.stress-finite", { stressNotFinite: ["random/3"] }],
    ["play.stress-within-scene", { stressFinalXMaxM: 381 }],
    ["play.stress-below-terrain", { stressBelowTerrainMaxM: 0.6 }],
  ])("reports %s", (rule, change) => {
    expect(rulesOf(training, change)).toEqual([rule]);
  });

  it("names the designed or random jump that broke an invariant", () => {
    const messages = playProblems(training, {
      ...passing,
      stressNotEnded: ["calm/no landing"],
      stressBelowTerrainMaxM: 0.6,
      stressBelowTerrainMaxName: "random/3",
    }).map((p) => p.message);
    expect(messages.join(" ")).toContain("calm/no landing");
    expect(messages.join(" ")).toContain("random/3");
  });

  it("allows wind a spread in proportion to the hill's size", () => {
    const larger: HillSpec = { ...training, kPointM: 120 };
    expect(rulesOf(training, { windSpreadM: 12 })).toEqual(["play.wind-spread"]);
    expect(rulesOf(larger, { windSpreadM: 12 }).filter((r) => r === "play.wind-spread")).toEqual([]);
  });

  it("lets the bounds that are lengths grow with a hill above K120, and not below it", () => {
    const r = PLAY_RULES;
    expect(sizeGrowthM(r.sizeScaleFromKPointM, 1)).toBe(0);
    expect(sizeGrowthM(90, 1)).toBe(0);
    expect(windowToleranceOf(90)).toBe(r.windowToleranceM);
    expect(windowToleranceOf(220)).toBeCloseTo(r.windowToleranceM + 100 * r.windowToleranceGrowthMPerM);
    // A K190 hill whose measures are the training hill's moved by 100 m: 70 m of K above the scale's start.
    expect(sizeGrowthM(training.kPointM + 100, 1)).toBe(70);
    const large: HillSpec = { ...training, kPointM: training.kPointM + 100 };
    const grown = { medianGoodM: passing.medianGoodM + 100, medianAverageM: passing.medianAverageM + 100 };
    const moved = { ...grown, medianWeakM: passing.medianWeakM + 100, bestMedianM: passing.bestMedianM + 100 };
    const highest = r.highestAboveTerrainP90MaxM + sizeGrowthM(large.kPointM, r.highestAboveTerrainGrowthMPerM);
    expect(rulesOf(large, { ...moved, highestAboveTerrainP90M: highest - 0.1 })).not.toContain("play.flight-height");
    expect(rulesOf(large, { ...moved, highestAboveTerrainP90M: highest + 0.1 })).toContain("play.flight-height");
    const furthest =
      large.kPointM + r.goodMedianFromKMaxM + sizeGrowthM(large.kPointM, r.goodMedianFromKMaxGrowthMPerM);
    expect(rulesOf(large, { ...moved, medianGoodM: furthest - 0.1 })).not.toContain("play.good-median");
    expect(rulesOf(large, { ...moved, medianGoodM: furthest + 0.1 })).toContain("play.good-median");
    expect(rulesOf(training, { highestAboveTerrainP90M: r.highestAboveTerrainP90MaxM + 0.1 })).toEqual([
      "play.flight-height",
    ]);
  });
});
