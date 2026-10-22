import { describe, expect, it } from "vitest";
import { SCENE_LENGTH_MAX_M, SCENE_PAST_OUTRUN_LOWEST_M } from "../render/hill-layer-tables";
import { buildHillProfile } from "../sim/hill-setup";
import {
  admissionProblems,
  GEOMETRY_RULE_LEVELS,
  geometryProblems,
  geometryRuleProblems,
  HILL_RULES,
  hillGeometry,
  kFromSteepestMaxM,
  type HillGeometry,
} from "./hill-geometry";
import type { HillSpec } from "./hill-spec";
import { EXTREME_HILLS, training, variant } from "./test-support/hill-variants";

const rulesOf = (spec: HillSpec) => geometryProblems(spec).map((p) => p.rule);

const trainingGeometry = (): HillGeometry => {
  const { inrun, landing } = training.profile;
  return hillGeometry(buildHillProfile(inrun, landing), training.kPointM);
};

describe("hill geometry", () => {
  it("measures the training hill", () => {
    const g = trainingGeometry();
    expect(g.takeoffAngleDeg).toBeCloseTo(9.76, 2);
    expect(g.tableHeightM).toBeCloseTo(2.03, 2);
    expect(g.inrunDropM).toBeCloseTo(26.83, 2);
    expect(g.steepestInrunDeg).toBeCloseTo(45, 3);
    expect(g.kXM).toBeCloseTo(121.87, 1);
    expect(g.landingAngleAtKDeg).toBeCloseTo(41.45, 1);
    expect(g.steepestLandingXM).toBeCloseTo(115, 5);
    expect(g.landingAreaEndXM).toBeCloseTo(146.2, 5);
    expect(g.landingAreaEndM).toBeCloseTo(120.77, 1);
    expect(g.outrunLowestXM).toBeCloseTo(186.16, 1);
    expect(g.inrunDescends).toBe(true);
    expect(g.landingDescends).toBe(true);
    // The flat part behind the gate meets the straight part at its full angle; the other joins are smooth.
    expect(g.joins.flatToLine.slopeDeg).toBeCloseTo(45, 3);
    expect(g.joins.lineToCurve.heightM).toBeLessThan(1e-3);
    expect(g.joins.landingToOutrun.slopeDeg).toBeLessThan(1e-3);
  });

  it("keeps the outrun's lowest point within the longest scene of an own hill, with room to coast", () => {
    expect(HILL_RULES.outrunLowestMaxXM).toBe(SCENE_LENGTH_MAX_M - SCENE_PAST_OUTRUN_LOWEST_M);
  });

  it.each([
    ["geometry.takeoff-angle", variant({ inrun: { lineEndXM: 26.8, lineInterceptM: 231.2 } })],
    ["geometry.table-height", variant({ inrun: { lineInterceptM: 232 } })],
    ["geometry.landing-angle-at-k", variant({ kPointM: 115, landing: { amplitudeM: 65, centerYM: 133.3 } })],
    ["geometry.k-near-steepest", variant({ kPointM: 103 })],
    ["geometry.landing-area-length", variant({ kPointM: 80 })],
    ["geometry.outrun-length", variant({ landing: { outrunCurveA: 0.03 } })],
    ["geometry.outrun-within-scene", variant({ landing: { outrunCurveA: 0.0004 } })],
  ])("reports %s alone for a hill that breaks only that rule", (rule, spec) => {
    expect(rulesOf(spec)).toEqual([rule]);
  });

  // The profile is built with smooth joins, an inrun that rises also takes off upwards, and the outrun cannot rise
  // before its lowest point: these rules are shown on measures changed by hand.
  it.each([
    ["geometry.join-height", { joins: { ...trainingGeometry().joins, flatToLine: { heightM: 0.02, slopeDeg: 45 } } }],
    ["geometry.join-slope", { joins: { ...trainingGeometry().joins, lineToCurve: { heightM: 0, slopeDeg: 0.6 } } }],
    ["geometry.inrun-descends", { inrunDescends: false }],
    ["geometry.landing-descends", { landingDescends: false }],
  ] as const)("reports %s alone for measures that break only that rule", (rule, change) => {
    const g: HillGeometry = { ...trainingGeometry(), ...change };
    expect(geometryRuleProblems(g, training.kPointM).map((p) => p.rule)).toEqual([rule]);
  });

  it.each([
    [100, 14.9, false],
    [100, 15.1, true],
    [250, -29.9, false],
    [250, 30.1, true],
  ] as const)("on a K%s hill, K %s m from the steepest point is a problem: %s", (kPointM, offsetM, expected) => {
    const g: HillGeometry = { ...trainingGeometry(), kXM: trainingGeometry().steepestLandingXM + offsetM };
    const rules = geometryRuleProblems(g, kPointM).map((p) => p.rule);
    expect(rules.includes("geometry.k-near-steepest")).toBe(expected);
  });

  it("lets K lie further from the steepest point on a bigger hill, never less than the fixed floor", () => {
    expect(kFromSteepestMaxM(50)).toBe(HILL_RULES.kFromSteepestMinM);
    expect(kFromSteepestMaxM(250)).toBeCloseTo(250 * HILL_RULES.kFromSteepestShareOfK, 9);
  });

  it.each([
    ["join-height", "admission"],
    ["join-slope", "admission"],
    ["inrun-descends", "admission"],
    ["landing-descends", "admission"],
    ["outrun-within-scene", "style"],
    ["table-height", "admission"],
    ["takeoff-angle", "style"],
    ["landing-area-length", "style"],
    ["outrun-length", "style"],
    ["k-near-steepest", "style"],
    ["landing-angle-at-k", "style"],
  ] as const)("gives the rule %s the level %s", (rule, level) => {
    expect(GEOMETRY_RULE_LEVELS[rule]).toBe(level);
  });

  it("marks every geometry problem with the level of its rule", () => {
    const g: HillGeometry = { ...trainingGeometry(), inrunDescends: false, takeoffAngleDeg: 20 };
    expect(geometryRuleProblems(g, training.kPointM).map((p) => [p.rule, p.level])).toEqual([
      ["geometry.takeoff-angle", "style"],
      ["geometry.inrun-descends", "admission"],
    ]);
  });

  it("admits a hill that breaks only a style rule, with the problem still reported", () => {
    const spec = variant({ kPointM: 80 });
    expect(rulesOf(spec)).toEqual(["geometry.landing-area-length"]);
    expect(admissionProblems(spec)).toEqual([]);
  });

  it("refuses a hill that breaks an admission rule", () => {
    const spec = variant({ inrun: { lineInterceptM: 232 } });
    expect(admissionProblems(spec).map((p) => p.rule)).toEqual(["geometry.table-height"]);
  });

  it.each(EXTREME_HILLS)("gives finite measures for the %s hill the format allows", (_name, spec) => {
    const { inrun, landing } = spec.profile;
    const g = hillGeometry(buildHillProfile(inrun, landing), spec.kPointM);
    expect(
      Object.values(g)
        .flatMap((v) => (typeof v === "number" ? [v] : []))
        .every(Number.isFinite),
    ).toBe(true);
    expect(
      Object.values(g.joins)
        .flatMap((j) => [j.heightM, j.slopeDeg])
        .every(Number.isFinite),
    ).toBe(true);
    expect(() => geometryProblems(spec)).not.toThrow();
  });
});
