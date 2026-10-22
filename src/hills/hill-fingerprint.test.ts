import { describe, expect, it } from "vitest";
import { hillFingerprint } from "./hill-fingerprint";
import { OWN_HILL_SPECS } from "./own-hills";

/**
 * The geometry of every own hill, pinned. A failing pin means the hill's geometry (its profile or its K point)
 * changed: records and replays made on the old shape would then be scored on the new one. Give the hill a new id
 * and add the old id to RETIRED_OWN_HILL_IDS, then pin the new id here.
 */
const PINNED: Readonly<Record<string, string>> = {
  "own-3": "5d8a7866",
  "own-14": "e8cc2b96",
  "own-15": "3590faa5",
  "own-16": "ca992553",
  "own-17": "64996cb5",
  "own-18": "b662fe18",
  "own-19": "1c5507bd",
  "own-20": "049cef96",
  "own-21": "01e623c9",
  "own-22": "533b57bd",
  "own-23": "65bb0178",
  "own-24": "49066b8c",
  "own-25": "fb2c9ed2",
  "own-26": "2fcd6ba0",
  "own-27": "0335caeb",
  "own-28": "0b63d20d",
  "own-29": "cb9acafa",
  "own-30": "4cd85392",
  "own-31": "ebe361e4",
  "own-32": "dc33bad0",
  "own-33": "1a14027d",
  "own-34": "43282209",
  "own-35": "b1a79266",
};

describe("hill fingerprint", () => {
  it.each(OWN_HILL_SPECS.map((spec) => [spec.id, spec] as const))("pins the geometry of %s", (id, spec) => {
    expect(hillFingerprint(spec)).toBe(PINNED[id]);
  });

  it("is eight hex digits that ignore the look and follow the K point and the profile", () => {
    const [spec] = OWN_HILL_SPECS;
    if (spec === undefined) throw new Error("no own hill");
    const print = hillFingerprint(spec);
    expect(print).toMatch(/^[0-9a-f]{8}$/);
    expect(hillFingerprint({ ...spec, name: "Inna", look: { ...spec.look, skyRgb6: [0, 0, 0] } })).toBe(print);
    expect(hillFingerprint({ ...spec, kPointM: 91 })).not.toBe(print);
    const inrun = { ...spec.profile.inrun, curveA: 0.0201 };
    expect(hillFingerprint({ ...spec, profile: { ...spec.profile, inrun } })).not.toBe(print);
  });
});
