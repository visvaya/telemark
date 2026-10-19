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
