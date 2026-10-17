import { describe, expect, it } from "vitest";
import {
  characterProblems,
  checkGeneratedHill,
  generatedHillId,
  generateHill,
  GENERATOR_TARGETS,
  HillGenerationError,
  lookOf,
  type HillCharacter,
} from "./hill-generator";
import { geometryProblems, hillGeometry, kFromSteepestMaxM } from "./hill-geometry";
import { LIKENESS } from "./hill-likeness";
import { OWN_HILL_SPECS } from "./own-hills";
import { buildHillProfile } from "../sim/hill-setup";
import { GENERATED_HILL_CHARACTERS, generatedHillSet } from "./test-support/generated-hills";

const [own] = OWN_HILL_SPECS;
if (own === undefined) throw new Error("no own hill");

/** One generation with the play rules is a search of a few oracle runs and one evaluation: several seconds. */
const GENERATION_TIMEOUT_MS = 120_000;

const caught = (run: () => unknown): HillGenerationError => {
  try {
    run();
  } catch (error) {
    if (error instanceof HillGenerationError) return error;
    throw error;
  }
  throw new Error("expected a HillGenerationError");
};

describe("hill generator", () => {
  it(
    "makes the smallest hill of the generated set on target, with no problem by any rule",
    () => {
      const [smallest] = generatedHillSet(GENERATED_HILL_CHARACTERS.slice(0, 1));
      if (smallest === undefined) throw new Error("no hill");
      const { spec, report } = smallest;
      expect(report.bestOnTarget).toBe(true);
      const target = GENERATED_HILL_CHARACTERS[0]?.bestPastKM;
      expect(report.bestCalmFromKM).toBeGreaterThanOrEqual(target?.minM ?? GENERATOR_TARGETS.best.fromKMinM);
      expect(report.bestCalmFromKM).toBeLessThanOrEqual(target?.maxM ?? GENERATOR_TARGETS.best.fromKMaxM);
      // The gate and the flat part behind it are where the character puts them.
      expect(spec.profile.inrun.startXM).toBe(GENERATED_HILL_CHARACTERS[0]?.gateXM);
      expect(report.playJudged).toBe(true);
      expect(report.styleProblems).toEqual([]);
      expect(geometryProblems(spec)).toEqual([]);
      expect(report.closestDistance).toBeGreaterThanOrEqual(LIKENESS.tooAlike);
      // The look's positions come from the profile: supports end before the takeoff, trees start at it.
      const { inrun } = spec.profile;
      expect(Math.max(...spec.look.supports.map((s) => s.toXM))).toBeLessThan(inrun.takeoffXM);
      expect(spec.look.trees.fromXM).toBe(inrun.takeoffXM);
    },
    GENERATION_TIMEOUT_MS,
  );

  it(
    "reports a miss when the scene cannot hold an inrun long enough, and lets the landing area give way to K",
    () => {
      const huge: HillCharacter = {
        kPointM: 260,
        landingSteepnessDeg: 40,
        landingAreaPastKShare: 0.12,
        knoll: "medium",
        inrunSteepnessDeg: 42,
        takeoffAngleDeg: 10,
        look: "day",
      };
      const { spec, report } = generateHill(huge);
      expect(report.bestOnTarget).toBe(false);
      expect(report.bestCalmFromKM).toBeLessThan(GENERATOR_TARGETS.best.fromKMinM);
      expect(report.playJudged).toBe(false);
      // The share asked for would put K far past the steepest point; the construction lengthened the area instead.
      expect(report.landingAreaPastKShare).toBeGreaterThan(huge.landingAreaPastKShare);
      const g = hillGeometry(buildHillProfile(spec.profile.inrun, spec.profile.landing), spec.kPointM);
      expect(Math.abs(g.kXM - g.steepestLandingXM)).toBeLessThanOrEqual(kFromSteepestMaxM(huge.kPointM));
    },
    GENERATION_TIMEOUT_MS,
  );

  it("refuses a character outside its ranges, or one whose best jump would reach the landing area's end", () => {
    const [first] = GENERATED_HILL_CHARACTERS;
    if (first === undefined) throw new Error("no characters");
    expect(characterProblems(first)).toEqual([]);
    expect(characterProblems({ ...first, gateXM: 40 }).map((p) => p.path)).toEqual(["gateXM"]);
    expect(characterProblems({ ...first, tableHeightM: 2.8 }).map((p) => p.path)).toEqual(["tableHeightM"]);
    expect(characterProblems({ ...first, flatBehindGateM: 0.1 }).map((p) => p.path)).toEqual(["flatBehindGateM"]);
    expect(characterProblems({ ...first, bestPastKM: { minM: 3, maxM: 4 } }).map((p) => p.path)).toEqual([
      "bestPastKM",
    ]);
    // K45 with the area 0.25 K past K ends at K+11.25: a target up to K+10 is too close to it.
    expect(characterProblems({ ...first, bestPastKM: { minM: 6, maxM: 10 } }).map((p) => p.path)).toEqual([
      "bestPastKM",
    ]);
    expect(caught(() => generateHill({ ...first, gateXM: 40 })).problems[0]?.rule).toBe("generator.character");
  });

  it("rests the end of every inrun on a support and keeps the deck behind the gate to its share of K", () => {
    const [character] = GENERATED_HILL_CHARACTERS;
    if (character === undefined) throw new Error("no character");
    const inrun = {
      startXM: 7,
      flatEndXM: 6.2,
      lineEndXM: 12,
      takeoffXM: 30,
      lineSlope: -1,
      lineInterceptM: 230,
      curveA: 0.03,
    };
    // A short inrun leaves no room between the support under the platform and the one under the end.
    const short = { ...inrun, lineEndXM: 9, takeoffXM: 14 };
    for (const shape of [inrun, short]) {
      for (let seed = 1; seed <= 40; seed++) {
        const look = lookOf(character, shape, 120, seed);
        const ends = look.supports.map((s) => s.toXM);
        const gap = shape.takeoffXM - Math.max(...ends);
        expect(gap).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(gap).toBeLessThanOrEqual(0.8 + 1e-9);
        // In order along the inrun, none overlapping the next.
        for (let i = 1; i < look.supports.length; i++) {
          expect(look.supports[i]?.fromXM ?? 0).toBeGreaterThan(look.supports[i - 1]?.toXM ?? Infinity);
        }
        expect(look.supports.length).toBeLessThanOrEqual(shape === short ? 2 : 5);
        const deckM = shape.startXM - look.inrun.platformStartXM;
        expect(deckM / character.kPointM).toBeGreaterThanOrEqual(0.035 - 1e-9);
        expect(deckM / character.kPointM).toBeLessThanOrEqual(0.09 + 0.01);
      }
    }
  });

  it("gives the same character the same id, and another character another id", () => {
    const [first, second] = GENERATED_HILL_CHARACTERS;
    if (first === undefined || second === undefined) throw new Error("no characters");
    expect(generatedHillId(first, 1)).toBe(generatedHillId({ ...first }, 1));
    expect(generatedHillId(first, 1)).not.toBe(generatedHillId(second, 1));
    expect(generatedHillId(first, 1)).not.toBe(generatedHillId(first, 2));
    expect(generatedHillId(first, 1)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    // With the optional values the id is a hash, short enough for the format at any size.
    const big = { ...first, kPointM: 260, gateXM: 33.5, flatBehindGateM: 6.5, bestPastKM: { minM: 14, maxM: 18 } };
    expect(generatedHillId(big, 99).length).toBeLessThanOrEqual(40);
    expect(generatedHillId(big, 1)).not.toBe(generatedHillId({ ...big, gateXM: 33 }, 1));
  });
});

describe("checks of a generated hill", () => {
  it("refuses a hill too alike to an own hill", () => {
    expect(caught(() => checkGeneratedHill({ ...own, id: "copy" }, { checkPlay: false })).problems).toMatchObject([
      { rule: "generator.too-alike" },
    ]);
  });

  it("refuses a hill that is not valid hill data", () => {
    expect(caught(() => checkGeneratedHill({ ...own, kPointM: 1000 })).problems[0]?.rule).toMatch(/^format\./);
  });

  it("refuses a hill that fails an admission rule", () => {
    const stepped = { ...own, profile: { ...own.profile, landing: { ...own.profile.landing, centerYM: 100 } } };
    expect(caught(() => checkGeneratedHill(stepped)).problems.map((p) => p.level)).toContain("admission");
  });

  it("passes another own hill shape when nothing else in the catalog is near, without the play rules", () => {
    const moved = { ...own, kPointM: own.kPointM + 30 };
    const checks = checkGeneratedHill(moved, { checkPlay: false, catalog: [own], others: [] });
    expect(checks.playJudged).toBe(false);
    expect(checks.closestId).toBe(own.id);
  });
});
