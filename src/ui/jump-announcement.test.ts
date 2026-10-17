import { describe, expect, it } from "vitest";
import {
  JUMP_STARTED_ANNOUNCEMENT,
  replayOverAnnouncement,
  resultAnnouncement,
  touchdownAnnouncement,
} from "./jump-announcement";

const judges = [16, 16.5, 16, 15.5, 16].map((note) => ({ note, counted: true, showFrame: 0 }));
const clean = { distanceM: 67.37999725341797, fallType: 0, points: 62, judges };
const mouse = { newRecord: false, controls: "mouse" } as const;

describe("jump announcements", () => {
  it("announces the start", () => {
    expect(JUMP_STARTED_ANNOUNCEMENT).toBe("Skok rozpoczęty.");
  });

  it("announces a clean landing with its distance", () => {
    expect(touchdownAnnouncement(clean)).toBe("Lądowanie: 67,38 metra.");
  });

  it("announces a new hill record together with the distance", () => {
    expect(touchdownAnnouncement(clean, true)).toBe("Lądowanie: 67,38 metra. Nowy rekord skoczni.");
    expect(touchdownAnnouncement(clean, false)).toBe("Lądowanie: 67,38 metra.");
  });

  it("announces a fall with its distance", () => {
    expect(touchdownAnnouncement({ distanceM: 67.31, fallType: 4 })).toBe("Upadek: 67,31 metra.");
  });

  it("announces a disqualification when there is no distance, fall or not", () => {
    expect(touchdownAnnouncement({ distanceM: 0, fallType: 0 })).toBe("Dyskwalifikacja.");
    expect(touchdownAnnouncement({ distanceM: 0, fallType: 2 })).toBe("Dyskwalifikacja.");
  });

  it("reads the outcome, the notes, the points and the way to jump again", () => {
    expect(resultAnnouncement(clean, mouse)).toBe(
      "Lądowanie: 67,38 metra. Noty: 16,0; 16,5; 16,0; 15,5; 16,0. Wynik: 62,0 punktu. Skok obejrzysz klawiszem P i zachowasz klawiszem S. Lewy przycisk lub R: jeszcze raz.",
    );
  });

  it("mentions a new record and names the touch zone on touch screens", () => {
    expect(resultAnnouncement(clean, { newRecord: true, controls: "touch" })).toBe(
      "Lądowanie: 67,38 metra. Noty: 16,0; 16,5; 16,0; 15,5; 16,0. Wynik: 62,0 punktu. Nowy rekord skoczni. Skok obejrzysz i zachowasz w menu. Pole L: jeszcze raz.",
    );
    // With tilt steering there are no zones to name.
    expect(resultAnnouncement(clean, { newRecord: false, controls: "tilt" })).toBe(
      "Lądowanie: 67,38 metra. Noty: 16,0; 16,5; 16,0; 15,5; 16,0. Wynik: 62,0 punktu. Skok obejrzysz i zachowasz w menu. Dotknięcie ekranu: jeszcze raz.",
    );
  });

  it("reads a fall with the lowered notes", () => {
    const fallen = { ...clean, fallType: 4, points: 23.5, judges: judges.map((judge) => ({ ...judge, note: 2.5 })) };
    expect(resultAnnouncement(fallen, mouse)).toBe(
      "Upadek: 67,38 metra. Noty: 2,5; 2,5; 2,5; 2,5; 2,5. Wynik: 23,5 punktu. Skok obejrzysz klawiszem P i zachowasz klawiszem S. Lewy przycisk lub R: jeszcze raz.",
    );
  });

  it("reads a replay that is over with the result it had and what a press of the picture does now", () => {
    expect(replayOverAnnouncement(clean, true, "own")).toBe(
      "Lądowanie: 67,38 metra. Noty: 16,0; 16,5; 16,0; 15,5; 16,0. Wynik: 62,0 punktu. Nowy rekord skoczni. Koniec powtórki. Kliknięcie lub dotknięcie obrazu: nowy skok.",
    );
    expect(replayOverAnnouncement(clean, false, "original")).toBe(
      "Lądowanie: 67,38 metra. Noty: 16,0; 16,5; 16,0; 15,5; 16,0. Wynik: 62,0 punktu. Koniec powtórki. Kliknięcie lub dotknięcie obrazu: menu.",
    );
  });

  it("tells in a competition that a press goes on to the next jumper", () => {
    expect(resultAnnouncement(clean, { ...mouse, contest: true })).toBe(
      "Lądowanie: 67,38 metra. Noty: 16,0; 16,5; 16,0; 15,5; 16,0. Wynik: 62,0 punktu. Skok obejrzysz klawiszem P i zachowasz klawiszem S. Lewy przycisk: dalej.",
    );
    expect(replayOverAnnouncement(clean, false, "contest")).toBe(
      "Lądowanie: 67,38 metra. Noty: 16,0; 16,5; 16,0; 15,5; 16,0. Wynik: 62,0 punktu. Kliknięcie lub dotknięcie obrazu: dalej.",
    );
  });

  it("leaves the notes out of a disqualification", () => {
    expect(resultAnnouncement({ ...clean, distanceM: 0, points: -120 }, mouse)).toBe(
      "Dyskwalifikacja. Wynik: -120,0 punktu. Skok obejrzysz klawiszem P i zachowasz klawiszem S. Lewy przycisk lub R: jeszcze raz.",
    );
  });
});
