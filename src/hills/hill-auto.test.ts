import { describe, expect, it } from "vitest";
import { BorlandRandom } from "../sim/borland-random";
import { drawCharacter, generateHillOfSize, isTypicalFall, TYPICAL_FALL } from "./hill-auto";
import { characterProblems, landingFallOf } from "./hill-generator";
import { geometryProblems } from "./hill-geometry";
import { LIKENESS } from "./hill-likeness";

/** One hill with the play rules: a search of a few oracle runs and one evaluation, several seconds. */
const GENERATION_TIMEOUT_MS = 180_000;

describe("hills from their size alone", () => {
  it("draws characters within the generator's limits at every size, the same from the same seed", () => {
    for (const k of [45, 80, 120, 175, 250, 300]) {
      for (let seed = 1; seed <= 25; seed++) {
        const c = drawCharacter(k, new BorlandRandom(seed));
        expect(characterProblems(c)).toEqual([]);
        expect(c.kPointM).toBe(k);
        expect(drawCharacter(k, new BorlandRandom(seed))).toEqual(c);
      }
    }
  });

  it("takes a landing hill as typical inside the middle of the original's hills of its size, and not past it", () => {
    const k = 150;
    const at = (key: keyof typeof TYPICAL_FALL, side: "below" | "above" | "trend") => {
      const r = TYPICAL_FALL[key];
      const trend = r.trendAtZero + r.trendPerMetreOfK * k;
      return side === "trend" ? trend : trend + r[side];
    };
    const typical = {
      dropAtTenthOfK: at("dropAtTenthOfK", "trend"),
      dropAtQuarterOfK: at("dropAtQuarterOfK", "trend"),
      dropAtHalfOfK: at("dropAtHalfOfK", "trend"),
      dropAtThreeQuartersOfK: at("dropAtThreeQuartersOfK", "trend"),
      heightOverLength: at("heightOverLength", "trend"),
    };
    expect(isTypicalFall(typical, k)).toBe(true);
    // A landing hill that drops away right under the takeoff throws the jumper high above it.
    expect(isTypicalFall({ ...typical, dropAtTenthOfK: at("dropAtTenthOfK", "above") + 0.001 }, k)).toBe(false);
    expect(isTypicalFall({ ...typical, heightOverLength: at("heightOverLength", "below") - 0.001 }, k)).toBe(false);
  });

  it("reads how a character's landing hill falls away without a jump", () => {
    // A character whose landing area has to give way to K has no fall: the draw takes another.
    const rng = new BorlandRandom(3);
    const drawn = Array.from({ length: 20 }, () => drawCharacter(100, rng));
    const c = drawn.find((d) => landingFallOf(d) !== undefined);
    if (c === undefined) throw new Error("no character with a landing area that stays");
    expect(drawn.some((d) => landingFallOf(d) === undefined)).toBe(true);
    // Measured about 15 ms once the code has warmed up; the draw of a character tries up to 200 of them.
    const started = performance.now();
    const fall = landingFallOf(c);
    expect(performance.now() - started).toBeLessThan(200);
    expect(fall?.dropAtTenthOfK).toBeGreaterThan(0);
    expect(fall?.dropAtThreeQuartersOfK).toBeGreaterThan(fall?.dropAtHalfOfK ?? Infinity);
    expect(landingFallOf({ ...c, kPointM: 20 })).toBeUndefined();
  });

  it(
    "makes a hill of a given size that passes every rule, the same one from the same seed",
    () => {
      const hill = generateHillOfSize(60, 1, { catalog: [] });
      expect(hill.spec.kPointM).toBe(60);
      expect(hill.report.playJudged).toBe(true);
      expect(hill.report.bestOnTarget).toBe(true);
      expect(geometryProblems(hill.spec).filter((p) => p.level === "admission")).toEqual([]);
      expect(hill.report.closestDistance).toBeGreaterThanOrEqual(LIKENESS.tooAlike);
      const fall = landingFallOf(hill.character);
      expect(fall !== undefined && isTypicalFall(fall, 60)).toBe(true);
      expect(generateHillOfSize(60, 1, { catalog: [], checkPlay: false }).spec.profile).toEqual(hill.spec.profile);
    },
    GENERATION_TIMEOUT_MS,
  );
});
