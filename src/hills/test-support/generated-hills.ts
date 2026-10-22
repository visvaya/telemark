import { NEVER_ALIKE_K_GAP_M } from "../hill-likeness";
import { OWN_HILL_SPECS } from "../own-hills";
import {
  generatedHillId,
  generateHill,
  keptHill,
  type GeneratedHill,
  type GeneratorOptions,
  type HillCharacter,
} from "../hill-generator";

/**
 * The generated set: hills of many sizes and shapes made by the generator, for training the player and for tests.
 * Sizes from K45 to K260, a little past both ends of the original's range, several shapes per size: steep and
 * gentle landing hills, short and long landing areas, short, medium and long knolls, inruns from 38 to 58 degrees,
 * low and high takeoff angles, and each hill its own gate placement, flat part, table height and best jump target,
 * so no two start or play alike. Those in the game are listed in SET_HILLS_IN_GAME and taken as the game has them.
 */
export const GENERATED_HILL_CHARACTERS: readonly HillCharacter[] = [
  {
    kPointM: 45,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.25,
    knoll: "medium",
    inrunSteepnessDeg: 46,
    takeoffAngleDeg: 10,
    look: "day",
    gateXM: 7,
    flatBehindGateM: 0.8,
    bestPastKM: { minM: 4, maxM: 8 },
    tableHeightM: 1.6,
  },
  {
    kPointM: 50,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.3,
    knoll: "long",
    inrunSteepnessDeg: 44,
    takeoffAngleDeg: 11,
    look: "winter",
    gateXM: 8,
    flatBehindGateM: 2.5,
    bestPastKM: { minM: 3, maxM: 7 },
    tableHeightM: 1.6,
  },
  {
    kPointM: 60,
    landingSteepnessDeg: 38,
    landingAreaPastKShare: 0.26,
    knoll: "long",
    inrunSteepnessDeg: 50,
    takeoffAngleDeg: 11,
    look: "winter",
    gateXM: 12,
    flatBehindGateM: 2.5,
    bestPastKM: { minM: 5, maxM: 9 },
    tableHeightM: 2.4,
  },
  {
    kPointM: 60,
    landingSteepnessDeg: 36,
    landingAreaPastKShare: 0.24,
    knoll: "medium",
    inrunSteepnessDeg: 52,
    takeoffAngleDeg: 10,
    look: "day",
    gateXM: 18,
    flatBehindGateM: 0.8,
    bestPastKM: { minM: 3, maxM: 6 },
    tableHeightM: 2.4,
  },
  {
    kPointM: 70,
    landingSteepnessDeg: 38,
    landingAreaPastKShare: 0.26,
    knoll: "medium",
    inrunSteepnessDeg: 38,
    takeoffAngleDeg: 9,
    look: "dusk",
    gateXM: 11,
    flatBehindGateM: 5,
    bestPastKM: { minM: 3, maxM: 7 },
    tableHeightM: 2,
  },
  {
    kPointM: 75,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.28,
    knoll: "short",
    inrunSteepnessDeg: 55,
    takeoffAngleDeg: 9,
    look: "winter",
    gateXM: 20,
    flatBehindGateM: 1.5,
    bestPastKM: { minM: 3, maxM: 7 },
    tableHeightM: 1.3,
  },
  {
    kPointM: 85,
    landingSteepnessDeg: 41,
    landingAreaPastKShare: 0.2,
    knoll: "medium",
    inrunSteepnessDeg: 47,
    takeoffAngleDeg: 8,
    look: "day",
    gateXM: 9,
    flatBehindGateM: 6,
    bestPastKM: { minM: 3, maxM: 7 },
    tableHeightM: 2.2,
  },
  {
    kPointM: 95,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.24,
    knoll: "short",
    inrunSteepnessDeg: 53,
    takeoffAngleDeg: 10,
    look: "dusk",
    gateXM: 15,
    flatBehindGateM: 3.5,
    bestPastKM: { minM: 7, maxM: 11 },
    tableHeightM: 1.3,
  },
  {
    kPointM: 95,
    landingSteepnessDeg: 38,
    landingAreaPastKShare: 0.25,
    knoll: "short",
    inrunSteepnessDeg: 42,
    takeoffAngleDeg: 11,
    look: "dusk",
    gateXM: 14,
    flatBehindGateM: 2,
    bestPastKM: { minM: 7, maxM: 11 },
    tableHeightM: 1.8,
  },
  {
    kPointM: 100,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.26,
    knoll: "medium",
    inrunSteepnessDeg: 50,
    takeoffAngleDeg: 10,
    look: "winter",
    gateXM: 28,
    flatBehindGateM: 3.5,
    bestPastKM: { minM: 6, maxM: 9 },
    tableHeightM: 2.5,
  },
  {
    kPointM: 105,
    landingSteepnessDeg: 42,
    landingAreaPastKShare: 0.18,
    knoll: "medium",
    inrunSteepnessDeg: 45,
    takeoffAngleDeg: 9,
    look: "day",
    gateXM: 7,
    flatBehindGateM: 1,
    bestPastKM: { minM: 4, maxM: 8 },
    tableHeightM: 1.5,
  },
  {
    kPointM: 115,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.28,
    knoll: "short",
    inrunSteepnessDeg: 53,
    takeoffAngleDeg: 10,
    look: "dusk",
    gateXM: 20,
    flatBehindGateM: 4.5,
    bestPastKM: { minM: 5, maxM: 8 },
    tableHeightM: 2.1,
  },
  {
    kPointM: 120,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.26,
    knoll: "short",
    inrunSteepnessDeg: 48,
    takeoffAngleDeg: 9,
    look: "winter",
    gateXM: 12,
    flatBehindGateM: 2.8,
    bestPastKM: { minM: 4, maxM: 8 },
    tableHeightM: 2,
  },
  {
    kPointM: 135,
    landingSteepnessDeg: 38,
    landingAreaPastKShare: 0.2,
    knoll: "medium",
    inrunSteepnessDeg: 50,
    takeoffAngleDeg: 10,
    look: "winter",
    gateXM: 20,
    flatBehindGateM: 5,
    bestPastKM: { minM: 10, maxM: 14 },
    tableHeightM: 2.2,
  },
  {
    kPointM: 140,
    landingSteepnessDeg: 36,
    landingAreaPastKShare: 0.3,
    knoll: "medium",
    inrunSteepnessDeg: 43,
    takeoffAngleDeg: 8,
    look: "dusk",
    gateXM: 8,
    flatBehindGateM: 6,
    bestPastKM: { minM: 10, maxM: 13 },
    tableHeightM: 1.8,
  },
  {
    kPointM: 150,
    landingSteepnessDeg: 40,
    landingAreaPastKShare: 0.25,
    knoll: "medium",
    inrunSteepnessDeg: 45,
    takeoffAngleDeg: 9,
    look: "day",
    gateXM: 25,
    flatBehindGateM: 1,
    bestPastKM: { minM: 6, maxM: 10 },
    tableHeightM: 2.6,
  },
  {
    kPointM: 160,
    landingSteepnessDeg: 37,
    landingAreaPastKShare: 0.18,
    knoll: "medium",
    inrunSteepnessDeg: 42,
    takeoffAngleDeg: 11,
    look: "winter",
    gateXM: 14,
    flatBehindGateM: 4.5,
    bestPastKM: { minM: 9, maxM: 12 },
    tableHeightM: 1.4,
  },
  {
    kPointM: 170,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.2,
    knoll: "medium",
    inrunSteepnessDeg: 55,
    takeoffAngleDeg: 10,
    look: "dusk",
    gateXM: 30,
    flatBehindGateM: 2,
    bestPastKM: { minM: 8, maxM: 12 },
    tableHeightM: 2.1,
  },
  {
    kPointM: 185,
    landingSteepnessDeg: 39,
    landingAreaPastKShare: 0.2,
    knoll: "short",
    inrunSteepnessDeg: 45,
    takeoffAngleDeg: 10,
    look: "day",
    gateXM: 18,
    flatBehindGateM: 7,
    bestPastKM: { minM: 11, maxM: 15 },
    tableHeightM: 1.2,
  },
  {
    kPointM: 200,
    landingSteepnessDeg: 40,
    landingAreaPastKShare: 0.18,
    knoll: "medium",
    inrunSteepnessDeg: 47,
    takeoffAngleDeg: 10,
    look: "day",
    gateXM: 9,
    flatBehindGateM: 3,
    bestPastKM: { minM: 15, maxM: 18 },
    tableHeightM: 2.5,
  },
  {
    kPointM: 200,
    landingSteepnessDeg: 41,
    landingAreaPastKShare: 0.2,
    knoll: "short",
    inrunSteepnessDeg: 48,
    takeoffAngleDeg: 11,
    look: "winter",
    gateXM: 22,
    flatBehindGateM: 0.5,
    bestPastKM: { minM: 4, maxM: 9 },
    tableHeightM: 1.7,
  },
  {
    kPointM: 215,
    landingSteepnessDeg: 42,
    landingAreaPastKShare: 0.15,
    knoll: "medium",
    inrunSteepnessDeg: 48,
    takeoffAngleDeg: 11,
    look: "dusk",
    gateXM: 16,
    flatBehindGateM: 5.5,
    bestPastKM: { minM: 9, maxM: 13 },
    tableHeightM: 2.3,
  },
  {
    kPointM: 230,
    landingSteepnessDeg: 44,
    landingAreaPastKShare: 0.15,
    knoll: "medium",
    inrunSteepnessDeg: 54,
    takeoffAngleDeg: 10,
    look: "day",
    gateXM: 13,
    flatBehindGateM: 1.8,
    bestPastKM: { minM: 13, maxM: 17 },
    tableHeightM: 1.5,
  },
  {
    kPointM: 230,
    landingSteepnessDeg: 45,
    landingAreaPastKShare: 0.12,
    knoll: "medium",
    inrunSteepnessDeg: 54,
    takeoffAngleDeg: 9,
    look: "winter",
    gateXM: 11,
    flatBehindGateM: 4,
    bestPastKM: { minM: 6, maxM: 9 },
    tableHeightM: 1.9,
  },
  {
    kPointM: 245,
    landingSteepnessDeg: 45,
    landingAreaPastKShare: 0.12,
    knoll: "medium",
    inrunSteepnessDeg: 56,
    takeoffAngleDeg: 10,
    look: "dusk",
    gateXM: 7,
    flatBehindGateM: 2.8,
    bestPastKM: { minM: 6, maxM: 12 },
    tableHeightM: 2.6,
  },
  {
    kPointM: 260,
    landingSteepnessDeg: 47,
    landingAreaPastKShare: 0.12,
    knoll: "medium",
    inrunSteepnessDeg: 56,
    takeoffAngleDeg: 10,
    look: "winter",
    gateXM: 7.5,
    flatBehindGateM: 3.2,
    bestPastKM: { minM: 14, maxM: 18 },
    tableHeightM: 2.2,
  },
];

/** Seed of the scenery of every generated hill of the set. */
const SET_SEED = 1;

/**
 * Hills of the set that are in the game, by the id the generator gives their character: the own hill made from it,
 * with its own scenery. The set takes those own hills as they are instead of generating them again, since a later
 * change of the construction must not change a hill the game has (`keptHill`), and checks them as its other hills.
 */
export const SET_HILLS_IN_GAME: Readonly<Record<string, string>> = {
  "gen-k50-47f69d0d-winter1": "own-14",
  "gen-k60-6f42d86f-day1": "own-15",
  "gen-k70-e2e1bffb-dusk1": "own-16",
  "gen-k75-d0989a58-winter1": "own-17",
  "gen-k85-15fc56b8-day1": "own-18",
  "gen-k95-6e069308-dusk1": "own-19",
  "gen-k100-e63187e5-winter1": "own-20",
  "gen-k105-02bb6273-day1": "own-21",
  "gen-k115-00c9ea20-dusk1": "own-22",
  "gen-k120-20cb1b3a-winter1": "own-23",
  "gen-k135-cec0a457-winter1": "own-24",
  "gen-k140-b9b5790a-dusk1": "own-25",
  "gen-k160-24cd8313-winter1": "own-26",
  "gen-k170-95a78a72-dusk1": "own-27",
  "gen-k185-b33d8b9a-day1": "own-28",
  "gen-k200-ed35516e-winter1": "own-29",
  "gen-k215-0157f36b-dusk1": "own-30",
  "gen-k230-5678d710-day1": "own-31",
  "gen-k245-39579f37-dusk1": "own-32",
  "gen-k260-c245713b-winter1": "own-33",
};

/** The own hill a character of the set is taken as (`SET_HILLS_IN_GAME`); undefined for one the generator makes. */
export const setHillInGameOf = (character: HillCharacter): string | undefined =>
  SET_HILLS_IN_GAME[generatedHillId(character, SET_SEED)];

/**
 * The characters of the set in `count` parts that can be generated and checked apart, each in the order of the
 * set. Only hills whose K points are less than `NEVER_ALIKE_K_GAP_M` apart can be too alike, so such hills stay in
 * one group, and the groups go to the parts in turn: every pair the whole set compares is compared in some part.
 */
export function generatedSetParts(count: number): HillCharacter[][] {
  const byK = GENERATED_HILL_CHARACTERS.toSorted((a, b) => a.kPointM - b.kPointM);
  // Groups of hills, each closer than the gap to the previous one in K order; built here and not shared.
  const groups: HillCharacter[][] = [];
  for (const character of byK) {
    const last = groups.at(-1);
    const previous = last?.at(-1);
    if (last !== undefined && previous !== undefined && character.kPointM - previous.kPointM < NEVER_ALIKE_K_GAP_M) {
      last.push(character);
    } else {
      groups.push([character]);
    }
  }
  const order = (c: HillCharacter) => GENERATED_HILL_CHARACTERS.indexOf(c);
  return Array.from({ length: count }, (_v, part) =>
    groups
      .filter((_g, i) => i % count === part)
      .flat()
      .toSorted((a, b) => order(a) - order(b)),
  );
}

/**
 * Generates the characters in order (or takes the own hill made from one, `SET_HILLS_IN_GAME`), each checked against
 * the own hills not taken from the set and the hills of the set before it, so no two hills of the set are the same
 * hill. `checkPlay` as in `generateHill`.
 */
export function generatedHillSet(
  characters: readonly HillCharacter[] = GENERATED_HILL_CHARACTERS,
  checkPlay: GeneratorOptions["checkPlay"] = true,
): GeneratedHill[] {
  const inGame = new Set(Object.values(SET_HILLS_IN_GAME));
  const catalog = OWN_HILL_SPECS.filter((spec) => !inGame.has(spec.id));
  const done: GeneratedHill[] = [];
  for (const character of characters) {
    const options = { others: done.map((d) => d.spec), catalog, checkPlay };
    const ownId = setHillInGameOf(character);
    const own = OWN_HILL_SPECS.find((spec) => spec.id === ownId);
    if (ownId !== undefined && own === undefined) throw new Error(`no own hill ${ownId}`);
    done.push(own === undefined ? generateHill(character, SET_SEED, options) : keptHill(character, own, options));
  }
  return done;
}
