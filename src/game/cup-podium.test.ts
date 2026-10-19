import { describe, expect, it } from "vitest";
import type { CupStandingRow } from "./cup";
import { cupPodium, cupRest } from "./cup-podium";

const row = (entrant: number, place: number, totalPoints: number): CupStandingRow => ({
  entrant,
  place,
  totalPoints,
  lastPoints: 0,
});

describe("the podium of a cup", () => {
  it("puts one entrant on each step and the rest below", () => {
    const rows = [row(2, 1, 180), row(0, 2, 160), row(1, 3, 140), row(3, 4, 90), row(4, 5, 10)];
    expect(cupPodium(rows)).toEqual([
      { place: 1, rows: [rows[0]] },
      { place: 2, rows: [rows[1]] },
      { place: 3, rows: [rows[2]] },
    ]);
    expect(cupRest(rows)).toEqual([rows[3], rows[4]]);
  });

  it("puts tied entrants on one step and leaves the places they take empty", () => {
    const rows = [row(0, 1, 180), row(1, 1, 180), row(2, 3, 100), row(3, 3, 100), row(4, 5, 50)];
    expect(cupPodium(rows)).toEqual([
      { place: 1, rows: [rows[0], rows[1]] },
      { place: 2, rows: [] },
      { place: 3, rows: [rows[2], rows[3]] },
    ]);
    expect(cupRest(rows)).toEqual([rows[4]]);
  });

  it("leaves steps empty with fewer than three entrants", () => {
    const rows = [row(0, 1, 100), row(1, 2, 80)];
    expect(cupPodium(rows).map((s) => s.rows.length)).toEqual([1, 1, 0]);
    expect(cupRest(rows)).toEqual([]);
  });
});
