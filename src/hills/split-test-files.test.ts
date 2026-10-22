import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NEVER_ALIKE_K_GAP_M } from "./hill-likeness";
import {
  GENERATED_HILL_CHARACTERS,
  generatedSetParts,
  SET_HILLS_IN_GAME,
  setHillInGameOf,
} from "./test-support/generated-hills";
import { GENERATED_SET_FILES, OWN_HILL_STABILITY_FILES } from "./test-support/hill-stability.cases";
import { ENVELOPE_FILES } from "./test-support/original-hills.cases";

describe("the parts of the generated set", () => {
  const parts = generatedSetParts(GENERATED_SET_FILES);

  it("hold every character of the set once, each part in the order of the set", () => {
    expect(
      parts.flat().toSorted((a, b) => GENERATED_HILL_CHARACTERS.indexOf(a) - GENERATED_HILL_CHARACTERS.indexOf(b)),
    ).toEqual(GENERATED_HILL_CHARACTERS);
    for (const part of parts) {
      const order = part.map((c) => GENERATED_HILL_CHARACTERS.indexOf(c));
      expect(order).toEqual(order.toSorted((a, b) => a - b));
    }
  });

  it("keep in one part every two hills that could be too alike, so each such pair is compared", () => {
    for (const [i, part] of parts.entries()) {
      for (const other of parts.slice(i + 1)) {
        for (const a of part) {
          for (const b of other) expect(Math.abs(a.kPointM - b.kPointM)).toBeGreaterThanOrEqual(NEVER_ALIKE_K_GAP_M);
        }
      }
    }
  });

  it("take each hill the game has from the set once", () => {
    const inGame = GENERATED_HILL_CHARACTERS.flatMap((c) => setHillInGameOf(c) ?? []);
    expect(inGame.toSorted()).toEqual(Object.values(SET_HILLS_IN_GAME).toSorted());
  });
});

/** The names of `count` stability test files of one kind. */
const stabilityFiles = (kind: string, count: number): string[] =>
  Array.from({ length: count }, (_v, i) => `hill-play.stability-${kind}-${i + 1}.test.ts`);

describe("the stability test files", () => {
  it("are exactly the files that take a share each, so no hill is left out", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const files = readdirSync(here).filter((name) => /^hill-play\.stability-(own|set)-\d+\.test\.ts$/.test(name));
    expect(files.toSorted()).toEqual(
      [...stabilityFiles("own", OWN_HILL_STABILITY_FILES), ...stabilityFiles("set", GENERATED_SET_FILES)].toSorted(),
    );
  });
});

describe("the files of the comparison with the original's hills", () => {
  it("split the own hills' range check among exactly the files counted for it", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const files = readdirSync(here).filter((name) => /^original-hills\.envelope-\d+\.local\.test\.ts$/.test(name));
    const expected = Array.from(
      { length: ENVELOPE_FILES },
      (_v, i) => `original-hills.envelope-${i + 1}.local.test.ts`,
    );
    expect(files.toSorted()).toEqual(expected.toSorted());
  });
});
