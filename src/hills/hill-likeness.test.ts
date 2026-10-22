import { describe, expect, it } from "vitest";
import { buildHillProfile } from "../sim/hill-setup";
import { hillDistance, hillShape, LIKENESS, NEVER_ALIKE_K_GAP_M, shapeDistance } from "./hill-likeness";
import type { HillSpec } from "./hill-spec";
import { EXTREME_HILLS, training, variant } from "./test-support/hill-variants";

/** A hill of a similar size with another profile: a longer, flatter landing hill and a steeper inrun. */
const other = variant({
  kPointM: 95,
  inrun: { lineSlope: -1.2, lineInterceptM: 240 },
  landing: { centerXM: 125, amplitudeM: 50, widthM: 60, outrunStartXM: 185 },
});

describe("hill likeness", () => {
  it("puts a hill at distance 0 from itself", () => {
    expect(hillDistance(training, training)).toBe(0);
    expect(hillDistance(other, other)).toBe(0);
  });

  it("is symmetric", () => {
    expect(hillDistance(training, other)).toBe(hillDistance(other, training));
  });

  it("does not count the look", () => {
    const repainted: HillSpec = {
      ...training,
      id: "repainted",
      name: "Inna",
      look: { ...training.look, skyRgb6: [0, 0, 0], terrain: { ...training.look.terrain, seed: 1 } },
    };
    expect(hillDistance(training, repainted)).toBe(0);
  });

  it("gives a small distance for a small change of one profile number and a larger one for another profile", () => {
    const nudged = variant({ landing: { centerXM: training.profile.landing.centerXM * 1.01 } });
    const small = hillDistance(training, nudged);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(LIKENESS.tooAlike);
    expect(hillDistance(training, other)).toBeGreaterThan(LIKENESS.tooAlike);
  });

  it("never counts hills with K points the gap apart as too alike, whatever their profiles", () => {
    expect(NEVER_ALIKE_K_GAP_M).toBeCloseTo(9.8, 1);
    const built = {
      kPointM: training.kPointM,
      profile: buildHillProfile(training.profile.inrun, training.profile.landing),
    };
    // The K component alone reaches the limit; any other difference only adds to the distance.
    expect(hillDistance(built, { ...built, kPointM: built.kPointM + NEVER_ALIKE_K_GAP_M })).toBeGreaterThanOrEqual(
      LIKENESS.tooAlike,
    );
  });

  it("measures a built hill as its data", () => {
    expect(hillShape(training)).toEqual(
      hillShape({
        kPointM: training.kPointM,
        profile: buildHillProfile(training.profile.inrun, training.profile.landing),
      }),
    );
  });

  it("is finite for the extreme hills the format allows", () => {
    const hills = [...EXTREME_HILLS.map(([, spec]) => spec), training];
    for (const a of hills) {
      const shape = hillShape(a);
      expect([...shape.landingDropShareOfK, shape.landingSpanShareOfK, shape.inrunDropM].every(Number.isFinite)).toBe(
        true,
      );
      for (const b of hills) expect(Number.isFinite(hillDistance(a, b))).toBe(true);
    }
  });

  it("measures a hill's shape once and gives the same shape again", () => {
    expect(hillShape(training)).toBe(hillShape(training));
    // Another object with the same data is measured on its own and comes out the same.
    expect(hillShape({ ...training })).toEqual(hillShape(training));
  });

  it("never puts two hills further apart without the inrun's drop than with it", () => {
    for (const [, extreme] of EXTREME_HILLS) {
      const without = shapeDistance(hillShape(training), hillShape(extreme), { withInrun: false });
      expect(without).toBeLessThanOrEqual(hillDistance(training, extreme) + 1e-12);
      expect(shapeDistance(hillShape(training), hillShape(extreme))).toBeCloseTo(hillDistance(training, extreme), 12);
    }
  });
});
