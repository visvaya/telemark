import { describe, expect, it } from "vitest";
import { screenTitle } from "./screen-title";

describe("page title of a screen", () => {
  it("is the name of the game on the menu", () => {
    expect(screenTitle({ kind: "menu" })).toBe("Telemark");
  });

  it("names the hill list and the outfit screen before the game", () => {
    expect(screenTitle({ kind: "hills" })).toBe("Wybór skoczni · Telemark");
    expect(screenTitle({ kind: "howto" })).toBe("Jak skakać · Telemark");
    expect(screenTitle({ kind: "install" })).toBe("Gra jako aplikacja · Telemark");
    expect(screenTitle({ kind: "about" })).toBe("O grze · Telemark");
    expect(screenTitle({ kind: "settings" })).toBe("Ustawienia · Telemark");
    expect(screenTitle({ kind: "outfit" })).toBe("Strój · Telemark");
    expect(screenTitle({ kind: "replays" })).toBe("Powtórki · Telemark");
    expect(screenTitle({ kind: "contest-setup" })).toBe("Zawody · Telemark");
    expect(screenTitle({ kind: "cup-standings" })).toBe("Puchar Świata: klasyfikacja · Telemark");
    expect(screenTitle({ kind: "cup-end" })).toBe("Puchar Świata: wyniki końcowe · Telemark");
  });

  it("names the hill of a jump with its K point", () => {
    expect(screenTitle({ kind: "jump", hill: { name: "Ćwiczebna", kPointM: 90 } })).toBe(
      "Skok: Ćwiczebna K90 · Telemark",
    );
    expect(screenTitle({ kind: "contest", hill: { name: "Ćwiczebna", kPointM: 90 } })).toBe(
      "Zawody: Ćwiczebna K90 · Telemark",
    );
  });
});
