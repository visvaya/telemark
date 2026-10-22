import { describe, expect, it } from "vitest";
import { geometryProblems } from "./hill-geometry";
import { lookProblems } from "./hill-look-rules";
import type { HillSpec } from "./hill-spec";
import { OWN_HILL_SPECS } from "./own-hills";
import { parseHillSpec } from "./parse-hill-spec";

// Every own hill is covered by adding its data: these tests loop over all of them.
describe.each(OWN_HILL_SPECS.map((spec) => [spec.id, spec] as const))("own hill %s", (_id, spec) => {
  it("passes the format checks after a JSON round trip", () => {
    expect(parseHillSpec(JSON.parse(JSON.stringify(spec)))).toEqual({ ok: true, spec });
  });

  it("passes the geometry rules", () => {
    expect(geometryProblems(spec)).toEqual([]);
  });

  it("passes the look rules", () => {
    expect(lookProblems(spec)).toEqual([]);
  });
});

/** The own hills whose value appears earlier in the list too. */
const repeated = (values: readonly (string | number)[]): string[] =>
  OWN_HILL_SPECS.filter((_s, i) => values.indexOf(values[i] ?? "") !== i).map((s) => s.id);

/**
 * Pairs of own hills that stand next to each other on the hill list: one after the other (one column on a phone,
 * across a row of two on a computer) and two apart (one under the other in a row of two).
 */
const listNeighbours = (): (readonly [HillSpec, HillSpec])[] =>
  OWN_HILL_SPECS.flatMap((spec, i) =>
    [OWN_HILL_SPECS[i + 1], OWN_HILL_SPECS[i + 2]].flatMap((next) =>
      next === undefined ? [] : [[spec, next] as const],
    ),
  );

describe("own hills together", () => {
  // The likeness check compares profiles only, since the look does not change how a hill plays; two hills of one
  // look would still read as one hill painted twice.
  it("gives every own hill its own scenery: its colours, terrain and trees", () => {
    const colours = OWN_HILL_SPECS.map(
      (s) => `${s.look.inrun.wallColour}/${s.look.inrun.gateColour}/${s.look.marks.fenceColour}`,
    );
    const terrain = OWN_HILL_SPECS.map((s) => s.look.terrain.seed);
    const trees = OWN_HILL_SPECS.map((s) => s.look.trees.seed);
    expect({ colours: repeated(colours), terrain: repeated(terrain), trees: repeated(trees) }).toEqual({
      colours: [],
      terrain: [],
      trees: [],
    });
  });

  // The one rule of the list's look that admits no exception: the inrun's walls, the largest patch of colour in
  // the view, differ between neighbours. The sky and the other colours may repeat.
  it("gives hills that stand next to each other on the list inruns of different colours", () => {
    const alike = listNeighbours()
      .filter(([a, b]) => a.look.inrun.wallColour === b.look.inrun.wallColour)
      .map(([a, b]) => `${a.id} and ${b.id}: inrun walls ${a.look.inrun.wallColour}`);
    expect(alike).toEqual([]);
  });
});
