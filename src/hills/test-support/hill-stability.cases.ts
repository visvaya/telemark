import { describe, expect, it } from "vitest";
import { hillChoiceOf, OWN_HILLS } from "../../game/hill-choice";
import type { HillCharacter } from "../hill-generator";
import { PLAY_RULES, PLAY_SAMPLE, playMeasures, playProblems } from "../hill-play";
import type { HillSpec } from "../hill-spec";
import { generatedHillSet, setHillInGameOf } from "./generated-hills";

/**
 * The slow tier of the hill checks, run by `pnpm test:hills-stability` (and in CI when the hills, the simulation
 * or the game change). It is split among several test files (`hill-play.stability-*.test.ts`), each taking a share
 * of the own hills or a part of the generated set, so the files run in parallel; in one file it took over five
 * minutes on one processor while the others stood idle.
 */

/** The test files that split the own hills between them, and those that split the generated set. */
export const OWN_HILL_STABILITY_FILES = 3;
export const GENERATED_SET_FILES = 2;

/** Three evaluations of about 5 s each, several times longer under a loaded machine. */
const STABILITY_TIMEOUT_MS = 360_000;

/** A verdict taken from a sample must not depend on the sample: each of `specs` on three disjoint seed sets. */
export function describeOwnHillStability(specs: readonly HillSpec[]): void {
  describe("play rules on other seeds", () => {
    it.each(specs.map((s) => [s.id, s] as const))(
      "%s gets the same verdict on three disjoint seed sets",
      (id, spec) => {
        const hill = OWN_HILLS.find((h) => h.id === id);
        if (hill === undefined) throw new Error(`no hill ${id}`);
        const verdict = (set: number) => {
          const sample = {
            ...PLAY_SAMPLE,
            firstScanSeed: PLAY_SAMPLE.firstScanSeed + set * PLAY_SAMPLE.scanSeeds,
            firstRandomSeed: PLAY_SAMPLE.firstRandomSeed + set * PLAY_SAMPLE.randomJumps,
          };
          return playProblems(spec, playMeasures(hill, sample)).map((p) => p.rule);
        };
        const first = verdict(0);
        // Every own hill within the bots' limit passes; larger ones wait for a bot that plays them reliably.
        expect(spec.kPointM > PLAY_RULES.botReliableMaxKPointM ? [] : first).toEqual([]);
        expect(verdict(1)).toEqual(first);
        expect(verdict(2)).toEqual(first);
      },
      STABILITY_TIMEOUT_MS,
    );
  });
}

/** One part of the generated set with the play rules on every hill up to the bots' limit: about a minute alone. */
const GENERATED_PART_TIMEOUT_MS = 1_200_000;

/**
 * A part of the generated set (`generatedSetParts`): every hill on target, with no problem by any rule and none
 * too alike to another. The play rules are applied here to the hills the generator makes; the hills taken from the
 * game (`SET_HILLS_IN_GAME`) are own hills, whose verdict on the same sample `describeOwnHillStability` takes in the
 * same run, so they are not played a second time.
 */
export function describeGeneratedSetPart(characters: readonly HillCharacter[]): void {
  describe("generated set", () => {
    it(
      "generates every hill of the part on target, with no problem by any rule and none too alike to another",
      () => {
        const part = generatedHillSet(characters, false);
        const missed = part.flatMap(({ spec, report }, i) => {
          const character = characters[i];
          const notPlayedHere =
            character === undefined ||
            setHillInGameOf(character) !== undefined ||
            spec.kPointM > PLAY_RULES.botReliableMaxKPointM;
          const play = notPlayedHere ? [] : playProblems(spec, playMeasures(hillChoiceOf(spec)));
          return [
            ...(report.bestOnTarget ? [] : [`${spec.id}: best calm jump ${report.bestCalmFromKM} m from K`]),
            ...report.styleProblems.map((p) => `${spec.id}: ${p.rule} (${p.message})`),
            ...play.map((p) => `${spec.id}: ${p.rule} (${p.message})`),
          ];
        });
        expect(missed).toEqual([]);
        // The hills of the part in the game are taken as the game has them.
        const expected = characters.flatMap((c) => setHillInGameOf(c) ?? []);
        expect(part.map(({ spec }) => spec.id).filter((id) => expected.includes(id))).toEqual(expected);
      },
      GENERATED_PART_TIMEOUT_MS,
    );
  });
}
