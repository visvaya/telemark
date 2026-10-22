import { describe, expect, it } from "vitest";
import { geometryProblems } from "./hill-geometry";
import { lookProblems } from "./hill-look-rules";
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

describe("own hills together", () => {
  // The likeness check compares profiles only, since the look does not change how a hill plays; two hills of one
  // look would still read as one hill painted twice.
  it("gives every own hill its own scenery: its colours, terrain and trees", () => {
    const colours = OWN_HILL_SPECS.map(
      (s) => `${s.look.inrun.wallColour}/${s.look.inrun.gateColour}/${s.look.marks.fenceColour}`,
    );
    const terrain = OWN_HILL_SPECS.map((s) => s.look.terrain.seed);
    const trees = OWN_HILL_SPECS.map((s) => s.look.trees.seed);
    const repeated = (values: readonly (string | number)[]) =>
      OWN_HILL_SPECS.filter((_s, i) => values.indexOf(values[i] ?? "") !== i).map((s) => s.id);
    expect({ colours: repeated(colours), terrain: repeated(terrain), trees: repeated(trees) }).toEqual({
      colours: [],
      terrain: [],
      trees: [],
    });
  });
});
