import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hillChoiceOf, originalHillChoices, type HillChoice } from "../../game/hill-choice";
import { readOriginalHills, type OriginalHill } from "../../original/original-hills";
import { hillGoldenFiles } from "../../sim/test-support/golden-files";
import { runOf } from "../../test-support/shards";
import { GEOMETRY_RULE_LEVELS, geometryProblems } from "../hill-geometry";
import { hillDistance, LIKENESS } from "../hill-likeness";
import { jumpScore, oracleJump } from "../hill-oracle";
import { FAMILY_BAND_NAMES, FAMILY_BANDS, type FamilyBand } from "../hill-family";
import { playMeasures, WIND_CLASSES, windClassSeeds } from "../hill-play";
import { exactRivalJump } from "../hill-players";
import type { HillSpec } from "../hill-spec";
import { OWN_HILL_SPECS } from "../own-hills";
import { parseHillSpec } from "../parse-hill-spec";

/**
 * Own hills compared with the hills of the original game. The original's data stays outside the repository, so
 * this runs only with the player's game files (DSJ2_GAME_DIR), never in CI; nothing read from them is stored.
 * The checks are split among several test files (`original-hills*.local.test.ts`) so that they run in parallel:
 * in one file they took over five minutes on one processor.
 */
const golden = hillGoldenFiles();
const exePath = golden.exe;

/** The test files that split the original's hills between them for the family check, by size. */
export const ENVELOPE_FILES = 2;

/** One evaluation of a hill takes about 8 s alone; several run here. */
const ENVELOPE_TIMEOUT_MS = 900_000;
/** The likeness check takes about 4 s alone (measured 2026-10-17) and twice that beside the golden tests. */
const LIKENESS_TIMEOUT_MS = 60_000;

function load(): OriginalHill[] {
  const exe = new Uint8Array(readFileSync(exePath ?? ""));
  const dat = golden.dat === undefined ? undefined : new Uint8Array(readFileSync(golden.dat));
  return readOriginalHills(exe, dat);
}

function parseOriginal(
  h: OriginalHill,
): { ok: true; spec: HillSpec } | { ok: false; problems: readonly { rule: string; path: string }[] } {
  if (h.look === null) return { ok: false, problems: [{ rule: "look", path: "look cannot be read" }] };
  return parseHillSpec({
    schemaVersion: 1,
    id: `original-${h.number}`,
    name: "Skocznia",
    kPointM: h.kPointM,
    profile: { inrun: h.definition.inrun, landing: h.definition.landing },
    look: h.look,
  });
}

/** The own hills from the smallest K point to the largest. */
const ownHillsBySize = OWN_HILL_SPECS.map(hillChoiceOf).toSorted((a, b) => a.kPointM - b.kPointM);

/** Hill sizes the good rival is compared with the oracle in: K points up to each end, in metres. */
const SIZE_BUCKET_ENDS_M = [90, 120, 160, Number.POSITIVE_INFINITY];

/**
 * How close the exact rival must come to the oracle on a size bucket to be trusted there, by the mean and the 90th
 * percentile of the distance the oracle adds (in shares of K), and no fall: within the absolute margin, or within
 * this many times those of the smallest bucket (K up to 90) of the same run. The relative margin was made for the
 * trained player, which left distance to the oracle at every size and stayed within 1.25 times only up to K120. The
 * rival comes so close on every size (2026-10-22: a mean of 0.011 to 0.017 K, a 90th percentile of 0.025 to 0.050 K)
 * that a ratio of such small gaps says little, so the absolute margin of the earlier checks counts too.
 */
const ORACLE_GAP_MAX_RATIO_TO_SMALLEST = 1.25;
const ORACLE_GAP_MAX_MEAN_SHARE_OF_K = 0.06;
const ORACLE_GAP_MAX_P90_SHARE_OF_K = 0.12;

/** One original and wind: what the exact rival and the oracle made of it. */
interface OracleGap {
  kPointM: number;
  points: number;
  distanceShareOfK: number;
  playerFell: boolean;
}

/** The exact rival against the oracle on one hill, on the strongest seed of each wind class. */
function oracleGaps(hill: HillChoice, seeds: readonly number[]): OracleGap[] {
  return seeds.map((seed) => {
    const player = exactRivalJump(hill, seed);
    const best = oracleJump(hill, seed);
    return {
      kPointM: hill.kPointM,
      points: best.score - jumpScore(player),
      distanceShareOfK: (best.outcome.distanceM - player.distanceM) / hill.kPointM,
      playerFell: player.fell || player.disqualified,
    };
  });
}

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const p90 = (v: readonly number[]): number => v.toSorted((a, b) => a - b)[Math.floor(0.9 * (v.length - 1))] ?? 0;

/** The size buckets of the gaps, each with its measures. */
function sizeBuckets(gaps: readonly OracleGap[], seedCount: number) {
  return SIZE_BUCKET_ENDS_M.map((end, i) => {
    const start = SIZE_BUCKET_ENDS_M[i - 1] ?? 0;
    const inside = gaps.filter((g) => g.kPointM > start && g.kPointM <= end);
    const shares = inside.map((g) => g.distanceShareOfK);
    return {
      start,
      end,
      hills: inside.length / seedCount,
      meanShareOfK: mean(shares),
      p90ShareOfK: p90(shares),
      meanPoints: mean(inside.map((g) => g.points)),
      playerFalls: inside.filter((g) => g.playerFell).length,
    };
  });
}

type SizeBucket = ReturnType<typeof sizeBuckets>[number];

/** The buckets outside the margin of the smallest one. */
function bucketsOutside(buckets: readonly SizeBucket[]): SizeBucket[] {
  const [smallest] = buckets;
  if (smallest === undefined) throw new Error("no size bucket");
  const r = ORACLE_GAP_MAX_RATIO_TO_SMALLEST;
  const relative = (b: SizeBucket) =>
    b.meanShareOfK <= r * smallest.meanShareOfK && b.p90ShareOfK <= r * smallest.p90ShareOfK;
  const absolute = (b: SizeBucket) =>
    b.meanShareOfK <= ORACLE_GAP_MAX_MEAN_SHARE_OF_K && b.p90ShareOfK <= ORACLE_GAP_MAX_P90_SHARE_OF_K;
  return buckets.filter((b) => !(relative(b) || absolute(b)) || b.playerFalls > 0);
}

const tableOf = (buckets: readonly SizeBucket[]): string =>
  buckets
    .map(
      (b) =>
        `K ${b.start}..${b.end}: ${b.hills} hills, gap ${b.meanShareOfK.toFixed(3)} K mean, ` +
        `${b.p90ShareOfK.toFixed(3)} K p90, ${b.meanPoints.toFixed(1)} points, ${b.playerFalls} falls`,
    )
    .join("; ");

/** The original hills on 37 hills, four winds each, about 60 jumps of the oracle per wind. */
const ORACLE_TIMEOUT_MS = 900_000;

/** The checks that take the originals as a whole: likeness, the trained player, the format and the admission. */
export function describeOriginalHillChecks(): void {
  describe.skipIf(!golden.requested)("own hills against the hills of the original", () => {
    it("has the files it was asked to compare", () => {
      expect(golden.problems).toEqual([]);
    });

    it.skipIf(exePath === undefined)(
      "has no own hill too alike to an original one",
      () => {
        const originals = originalHillChoices(load());
        const tooAlike = ownHillsBySize.flatMap((own) =>
          originals.flatMap((o) => {
            const d = hillDistance(own, o);
            return d < LIKENESS.tooAlike ? [`${own.id} is ${d.toFixed(3)} from ${o.id}`] : [];
          }),
        );
        expect(tooAlike).toEqual([]);
      },
      LIKENESS_TIMEOUT_MS,
    );

    it.skipIf(exePath === undefined)(
      "keeps the exact rival within the margin of the oracle on every size of the original's hills",
      () => {
        const seedsByClass = windClassSeeds(1, 256, 1);
        const seeds = WIND_CLASSES.flatMap((c) => seedsByClass[c]);
        const gaps = originalHillChoices(load()).flatMap((h) => oracleGaps(h, seeds));
        const buckets = sizeBuckets(gaps, seeds.length);
        const table = tableOf(buckets);
        expect({ outside: bucketsOutside(buckets).map((b) => `K ${b.start}..${b.end}`), table }).toEqual({
          outside: [],
          table,
        });
      },
      ORACLE_TIMEOUT_MS,
    );

    it.skipIf(exePath === undefined)("reads every original hill through the hill format", () => {
      const rejected = load().flatMap((h) => {
        const result = parseOriginal(h);
        return result.ok ? [] : result.problems.map((p) => `original-${h.number}: ${p.rule} at ${p.path}`);
      });
      expect(rejected).toEqual([]);
    });

    // Every hill of the game plays, so none may fail a rule a hill needs to be admitted.
    it.skipIf(exePath === undefined)("passes every admission rule of the geometry on every original hill", () => {
      const specs = load().flatMap((h) => {
        const result = parseOriginal(h);
        return result.ok ? [result.spec] : [];
      });
      const problems = specs.map((spec) => ({ spec, problems: geometryProblems(spec) }));
      const refused = problems.flatMap(({ spec, problems: found }) =>
        found.filter((p) => p.level === "admission").map((p) => `${spec.id}: ${p.rule} (${p.message})`),
      );
      // Shown only when an admission rule fails: how many originals pass each rule, to place the levels again.
      const passing = Object.entries(GEOMETRY_RULE_LEVELS)
        .map(([rule, level]) => {
          const count = problems.filter(({ problems: found }) => !found.some((p) => p.rule === `geometry.${rule}`));
          return `${rule} (${level}): ${count.length}/${specs.length}`;
        })
        .join("; ");
      expect(refused, `originals passing each rule: ${passing}`).toEqual([]);
    });
  });
}

/**
 * Every original hill of the `part`-th run of sizes plays inside the family bands (`hill-family.ts`), without their
 * margins: the bands are the originals' trend and their furthest from it, so a change of the bots or the
 * simulation that moves an original out of them shows here, and the bands are measured again.
 */
export function describeEnvelopePart(part: number): void {
  describe.skipIf(!golden.requested || exePath === undefined)("the family bands of the original's hills", () => {
    it(
      `holds the original's hills of part ${part + 1} of ${ENVELOPE_FILES} by size`,
      () => {
        const originals = runOf(
          originalHillChoices(load()).toSorted((a, b) => a.kPointM - b.kPointM),
          part,
          ENVELOPE_FILES,
        );
        const outside = originals.flatMap((hill) => {
          const m = playMeasures(hill);
          return FAMILY_BAND_NAMES.flatMap((name) => {
            const band: FamilyBand = FAMILY_BANDS[name];
            const trend = band.trendAtZero + band.trendPerMetreOfK * hill.kPointM;
            const fromTrend = band.of(m, hill.kPointM) - trend;
            return fromTrend >= band.belowTrend && fromTrend <= band.aboveTrend
              ? []
              : [`${hill.id}: ${name} ${fromTrend.toFixed(4)} from the trend`];
          });
        });
        expect(outside).toEqual([]);
      },
      ENVELOPE_TIMEOUT_MS,
    );
  });
}
