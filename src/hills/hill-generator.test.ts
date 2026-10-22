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
    "refuses a hill the scene cannot hold an inrun for after the search, before any play rule",
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
      const error = caught(() => generateHill(huge));
      expect(error.problems.map((p) => p.rule)).toEqual(["generator.target-unreachable"]);
      expect(error.problems[0]?.message).toMatch(/^the longest inrun the scene leaves lands the best jump at K/);
    },
    GENERATION_TIMEOUT_MS,
  );

  it(
    "lets the landing area give way to K when the share asked for would put K far past the steepest point",
    () => {
      const largest = GENERATED_HILL_CHARACTERS.toSorted((a, b) => b.kPointM - a.kPointM)[0];
      if (largest === undefined) throw new Error("no characters");
      // The largest is in the game, so it is generated against an empty catalog.
      const { spec, report } = generateHill(largest, 1, { checkPlay: false, catalog: [] });
      expect(report.landingAreaPastKShare).toBeGreaterThan(largest.landingAreaPastKShare);
      const g = hillGeometry(buildHillProfile(spec.profile.inrun, spec.profile.landing), spec.kPointM);
      expect(Math.abs(g.kXM - g.steepestLandingXM)).toBeLessThanOrEqual(kFromSteepestMaxM(largest.kPointM));
    },
    GENERATION_TIMEOUT_MS,
  );

  it.each<[string, HillCharacter, RegExp]>([
    [
      "the shortest inrun already lands past the target",
      {
        kPointM: 50,
        landingSteepnessDeg: 36,
        landingAreaPastKShare: 0.26,
        knoll: "long",
        inrunSteepnessDeg: 56,
        takeoffAngleDeg: 11,
        look: "day",
        gateXM: 17,
        flatBehindGateM: 2.5,
        bestPastKM: { minM: 6, maxM: 9 },
        tableHeightM: 1.8,
      },
      /^the shortest inrun lands the best jump at K\+[\d.]+, past K\+6\.\.K\+9$/,
    ],
    [
      "the best jump changes abruptly with the inrun",
      {
        kPointM: 120,
        landingSteepnessDeg: 34,
        landingAreaPastKShare: 0.16,
        knoll: "long",
        inrunSteepnessDeg: 58,
        takeoffAngleDeg: 12,
        look: "day",
        gateXM: 22,
        flatBehindGateM: 3,
        bestPastKM: { minM: 7, maxM: 10 },
        tableHeightM: 1.6,
      },
      /^no inrun between the shortest and the longest lands the best jump in K\+7\.\.K\+10/,
    ],
  ])(
    "refuses a target no inrun reaches when %s, before the play rules",
    (_why, character, message) => {
      const error = caught(() => generateHill(character, 1, { catalog: [] }));
      expect(error.problems.map((p) => p.rule)).toEqual(["generator.target-unreachable"]);
      expect(error.problems[0]?.message).toMatch(message);
    },
    GENERATION_TIMEOUT_MS,
  );

  it("refuses, before a jump, a character whose deck the look rules do not admit", () => {
    const [first] = GENERATED_HILL_CHARACTERS;
    if (first === undefined) throw new Error("no characters");
    // A 7 m flat part behind the gate of a K50: with the platform behind it the deck is 0.15 of K.
    const pier: HillCharacter = {
      ...first,
      kPointM: 50,
      gateXM: 9,
      flatBehindGateM: 7,
      bestPastKM: { minM: 3, maxM: 6 },
    };
    const error = caught(() => generateHill(pier));
    expect(error.message).toMatch(/^the character makes no valid hill/);
    expect(error.problems.map((p) => p.rule)).toContain("look.deck-share");
  });

  it("refuses at once, before a jump, a character that makes no valid hill at any inrun", () => {
    const [first] = GENERATED_HILL_CHARACTERS;
    if (first === undefined) throw new Error("no characters");
    // A gentle K300 with the longest landing area and the gate far on: the landing hill and the outrun fill even
    // the longest scene of an own hill.
    const crowded: HillCharacter = {
      ...first,
      kPointM: 300,
      landingSteepnessDeg: 34,
      landingAreaPastKShare: 0.39,
      gateXM: 34,
      bestPastKM: { minM: 10, maxM: 14 },
    };
    const started = performance.now();
    const error = caught(() => generateHill(crowded));
    expect(error.message).toMatch(/^the character makes no valid hill/);
    // No oracle run: a jump search would take seconds.
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it(
    "keeps the lowest point of the outrun far enough before the end of the scene for a jumper to stop there",
    () => {
      const largest = GENERATED_HILL_CHARACTERS.toSorted((a, b) => b.kPointM - a.kPointM)[0];
      if (largest === undefined) throw new Error("no characters");
      // The largest is in the game, so it is generated against an empty catalog.
      const { spec } = generateHill(largest, 1, { checkPlay: false, catalog: [] });
      const g = hillGeometry(buildHillProfile(spec.profile.inrun, spec.profile.landing), spec.kPointM);
      // The scene ends at 380 m; a jumper coasts up to 23 m up the outrun past its lowest point.
      expect(g.outrunLowestXM).toBeLessThanOrEqual(380 - 25);
      expect(g.outrunFlatM).toBeGreaterThanOrEqual(30);
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
    expect(characterProblems({ ...first, gateXM: 6, flatBehindGateM: 6.5 }).map((p) => p.path)).toEqual([
      "flatBehindGateM",
    ]);
    expect(characterProblems({ ...first, kPointM: 320 }).map((p) => p.path)).toEqual(["kPointM"]);
    expect(characterProblems({ ...first, landingSteepnessDeg: 60 }).map((p) => p.path)).toEqual([
      "landingSteepnessDeg",
    ]);
    expect(characterProblems({ ...first, takeoffAngleDeg: 20 }).map((p) => p.path)).toEqual(["takeoffAngleDeg"]);
    expect(characterProblems({ ...first, bestPastKM: { minM: 3, maxM: 4 } }).map((p) => p.path)).toEqual([
      "bestPastKM",
    ]);
    // K45 with the area 0.25 K past K ends at K+11.25: a target up to K+10 is too close to it.
    expect(characterProblems({ ...first, bestPastKM: { minM: 6, maxM: 10 } }).map((p) => p.path)).toEqual([
      "bestPastKM",
    ]);
    expect(caught(() => generateHill({ ...first, gateXM: 40 })).problems[0]?.rule).toBe("generator.character");
  });

  it("rests the end of every inrun on a support, keeps every support under the inrun and the deck to its share", () => {
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
        // Every support stands under the inrun: none reaches behind the start platform.
        expect(look.supports[0]?.fromXM).toBeGreaterThanOrEqual(look.inrun.platformStartXM);
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
