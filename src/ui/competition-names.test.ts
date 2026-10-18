import { describe, expect, it } from "vitest";
import { competitorName, competitorShortName } from "./competition-names";

const record = { form1: 0, form2: 0, talent1: 0, talent2: 0, level: 2 };

describe("competitor names", () => {
  it("shorten a computer jumper to the initial and the surname, and keep a player's name", () => {
    expect(competitorName({ kind: "cpu", slot: 3, record })).toBe("Kenji Morioka");
    expect(competitorShortName({ kind: "cpu", slot: 3, record })).toBe("K. Morioka");
    expect(competitorShortName({ kind: "cpu", slot: 0, record })).toBe("A. Lehtovaara");
    expect(competitorShortName({ kind: "player", slot: 1 })).toBe("Gracz 2");
    expect(competitorShortName(undefined)).toBe("");
  });
});
