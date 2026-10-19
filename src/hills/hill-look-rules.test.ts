import { describe, expect, it } from "vitest";
import { lookProblems, supportsUnderInrun } from "./hill-look-rules";
import { OWN_HILL_SPECS } from "./own-hills";

const base = OWN_HILL_SPECS.find((s) => s.id === "own-15");
if (base === undefined) throw new Error("own-15 is missing");
const { platformStartXM } = base.look.inrun;
const { takeoffXM } = base.profile.inrun;
const withSupports = (supports: { fromXM: number; toXM: number }[]) => ({
  ...base,
  look: { ...base.look, supports: supports.map((s) => ({ ...s, colour: 12, frontColour: 25 })) },
});

/** The rules broken by own-15 with a deck of `share` of K behind its gate. */
const deckOf = (share: number) => {
  const platformStart = base.profile.inrun.startXM - share * base.kPointM;
  const spec = { ...base, look: { ...base.look, inrun: { ...base.look.inrun, platformStartXM: platformStart } } };
  const supports = spec.look.supports.map((s, i) => (i === 0 ? { ...s, fromXM: platformStart } : s));
  return lookProblems({ ...spec, look: { ...spec.look, supports } }).map((p) => p.rule);
};

/** The rules, with their levels, that own-15 breaks with these supports. */
const rules = (supports: { fromXM: number; toXM: number }[]) =>
  lookProblems(withSupports(supports)).map((p) => [p.rule, p.level]);

describe("the look rules", () => {
  it("pass supports that stand under the inrun, from the platform to the takeoff", () => {
    expect(lookProblems(withSupports([{ fromXM: platformStartXM, toXM: takeoffXM - 0.5 }]))).toEqual([]);
  });

  it("refuse a support that reaches behind the platform or past the takeoff", () => {
    const end = { fromXM: takeoffXM - 2, toXM: takeoffXM - 0.5 };
    const behind = lookProblems(withSupports([{ fromXM: platformStartXM - 1, toXM: platformStartXM + 2 }, end]));
    expect(behind.map((p) => [p.rule, p.path, p.level])).toEqual([
      ["look.supports-under-inrun", "look.supports.0", "admission"],
    ]);
    const past = lookProblems(withSupports([{ fromXM: takeoffXM - 2, toXM: takeoffXM + 0.5 }]));
    expect(past.map((p) => p.path)).toEqual(["look.supports.0"]);
  });

  it("refuse supports out of order, and an inrun whose end hangs in the air", () => {
    const end = { fromXM: takeoffXM - 2, toXM: takeoffXM - 0.5 };
    expect(rules([{ fromXM: platformStartXM + 3, toXM: platformStartXM + 1 }, end])).toEqual([
      ["look.supports-in-order", "admission"],
    ]);
    expect(
      rules([
        { fromXM: platformStartXM, toXM: takeoffXM - 1.5 },
        { fromXM: takeoffXM - 3, toXM: takeoffXM - 0.5 },
      ]),
    ).toEqual([["look.supports-in-order", "admission"]]);
    expect(rules([{ fromXM: platformStartXM, toXM: takeoffXM - 2 }])).toEqual([["look.inrun-end-close", "style"]]);
    expect(rules([{ fromXM: platformStartXM, toXM: takeoffXM - 4 }])).toEqual([
      ["look.inrun-end-supported", "admission"],
      ["look.inrun-end-close", "style"],
    ]);
  });

  it("keep the deck behind the gate in proportion to K", () => {
    expect(deckOf(0.05)).toEqual([]);
    expect(deckOf(0.12)).toEqual(["look.deck-share-short"]);
    expect(deckOf(0.15)).toEqual(["look.deck-share", "look.deck-share-short"]);
    expect(deckOf(0.01)).toEqual(["look.deck-share"]);
  });

  it("cut a support back to the platform, and leave the others as they are", () => {
    const cut = supportsUnderInrun(
      [
        { fromXM: 2.5, toXM: 5.8, colour: 12, frontColour: 25 },
        { fromXM: 9, toXM: 10, colour: 12, frontColour: 17 },
      ],
      3.72,
    );
    expect(cut.map((s) => [s.fromXM, s.toXM])).toEqual([
      [3.72, 5.8],
      [9, 10],
    ]);
  });
});
