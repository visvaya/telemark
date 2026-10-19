import { describe, expect, it } from "vitest";
import { pluralForm } from "./plural";
import { UI_TEXT } from "./ui-text";

describe("the Polish plural form", () => {
  it("follows the count", () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 24, 25, 0, 102, 112].map(pluralForm)).toEqual([
      "one",
      "few",
      "few",
      "many",
      "many",
      "many",
      "many",
      "many",
      "few",
      "few",
      "many",
      "many",
      "few",
      "many",
    ]);
  });

  it("names the competitions of the setup's summary", () => {
    expect(UI_TEXT.competition.summary(1)).toBe("1 konkurs");
    expect(UI_TEXT.competition.summary(3)).toBe("Puchar Świata: 3 konkursy");
    expect(UI_TEXT.competition.summary(13)).toBe("Puchar Świata: 13 konkursów");
    expect(UI_TEXT.competition.summary(23)).toBe("Puchar Świata: 23 konkursy");
    expect(UI_TEXT.competition.cupEndSubtitle(5)).toBe("Wyniki końcowe · 5 konkursów");
  });
});
