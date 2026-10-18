import { describe, expect, it } from "vitest";
import {
  boardRows,
  contestJumpHud,
  freshCompetitors,
  neededDistanceM,
  neededToLead,
  resultAfterJump,
} from "./competition-board";
import {
  DEFAULT_COMPETITION_SETTINGS,
  competitionReducer,
  currentJumper,
  startCompetition,
  type CompetitionSettings,
  type CompetitionState,
} from "./competition";

const settings: CompetitionSettings = {
  ...DEFAULT_COMPETITION_SETTINGS,
  players: [true, true, false, false, false, false, false, false],
};
const scored = (s: CompetitionState, points: number, distanceM = 100) =>
  competitionReducer(s, { type: "scored", score: { distanceM, points, fell: false } });
const fresh = () => startCompetition(settings, 7);

describe("the board's rows", () => {
  it("list everybody in start order with no place before the first jump", () => {
    const s = fresh();
    const rows = boardRows(s);
    expect(rows.map((r) => r.competitor)).toEqual(s.startOrder);
    expect(rows.every((r) => r.place === null && r.totalPoints === null)).toBe(true);
  });

  it("put those who jumped first, by total with shared places, the rest below in start order", () => {
    let s = fresh();
    s = scored(s, 50);
    s = scored(s, 80);
    s = scored(s, 50);
    const rows = boardRows(s);
    expect(rows.map((r) => r.place)).toEqual([1, 2, 2, null, null, null]);
    expect(rows[0]?.competitor).toBe(s.startOrder[1]);
    expect(rows.slice(1, 3).map((r) => r.competitor)).toEqual([s.startOrder[0], s.startOrder[2]]);
    expect(rows.slice(3).map((r) => r.competitor)).toEqual(s.startOrder.slice(3));
    expect(rows[0]?.totalPoints).toBe(80);
    expect(rows[3]?.scores).toEqual([null, null]);
  });

  it("mark new jumps only beside older results", () => {
    let s = fresh();
    s = scored(s, 50);
    s = scored(s, 80);
    const [first, second] = s.startOrder;
    const rows = boardRows(s);
    expect([...freshCompetitors(rows, new Set([second ?? -1]))]).toEqual([second]);
    expect([...freshCompetitors(rows, new Set([first ?? -1, second ?? -1]))]).toEqual([]);
    expect([...freshCompetitors(boardRows(fresh()), new Set())]).toEqual([]);
  });
});

describe("points needed to lead", () => {
  it("are nothing before anybody jumped", () => {
    const s = fresh();
    expect(neededToLead(s, currentJumper(s) ?? -1)).toBeNull();
  });

  it("are the leader's total in the first round", () => {
    let s = scored(fresh(), 114.9);
    s = scored(s, 60);
    expect(neededToLead(s, currentJumper(s) ?? -1)).toBe(114.9);
  });

  it("are the leader's total less the jumper's own in the second round, nothing for the leader", () => {
    let s = fresh();
    [100, 70.3, 50, 40, 30, 20].forEach((p) => {
      s = scored(s, p);
    });
    expect(s.round).toBe(2);
    const first = currentJumper(s) ?? -1;
    expect(neededToLead(s, first)).toBe(80);
    expect(neededToLead(s, s.startOrder[1] ?? -1)).toBe(29.7);
    expect(neededToLead(s, s.startOrder[0] ?? -1)).toBeNull();
  });

  it("are nothing when the leader has no points above zero", () => {
    let s = scored(fresh(), -41.5);
    expect(neededToLead(s, currentJumper(s) ?? -1)).toBeNull();
    s = scored(s, 0);
    expect(neededToLead(s, currentJumper(s) ?? -1)).toBeNull();
  });
});

describe("the distance needed", () => {
  it("inverts the points of a jump with 57 style points, in whole metres", () => {
    expect(neededDistanceM(114.9, 105)).toBe(104);
    expect(neededDistanceM(156.4, 105)).toBe(127);
    expect(neededDistanceM(122.0, 70)).toBe(73);
    expect(neededDistanceM(29.5, 70)).toBe(26);
    expect(neededDistanceM(97.0, 70)).toBe(60);
  });

  it("uses the factor of the big hills from K 145 and never goes below zero", () => {
    expect(neededDistanceM(177, 145)).toBe(145);
    expect(neededDistanceM(178.2, 145)).toBe(146);
    expect(neededDistanceM(57, 90)).toBe(60);
    expect(neededDistanceM(1, 20)).toBe(0);
  });
});

describe("the jump view's competition values", () => {
  it("give the needed points and distance, the total so far and the others' totals", () => {
    let s = fresh();
    [100, 70.3, 50, 40, 30, 20].forEach((p, i) => {
      s = scored(s, p, 90 + i);
    });
    const jumper = s.startOrder[1] ?? -1;
    const hud = contestJumpHud(s, jumper, 105);
    expect(hud.neededPoints).toBe(29.7);
    expect(hud.neededDistanceM).toBe(neededDistanceM(29.7, 105));
    expect(hud.totalBeforePoints).toBe(70.3);
    expect(hud.firstDistanceM).toBe(91);
    expect(hud.otherTotalsPoints.toSorted((a, b) => b - a)).toEqual([100, 50, 40, 30, 20]);
  });

  it("give no needed values or first distance for the first jump", () => {
    const s = fresh();
    const hud = contestJumpHud(s, currentJumper(s) ?? -1, 105);
    expect(hud.neededPoints).toBeNull();
    expect(hud.neededDistanceM).toBeNull();
    expect(hud.firstDistanceM).toBeNull();
    expect(hud.otherTotalsPoints).toEqual([]);
  });

  it("tell the total and the place after the jump, ties sharing a place", () => {
    const hud = { totalBeforePoints: 20.1, otherTotalsPoints: [100, 50.4, 30] };
    expect(resultAfterJump(hud, 30.3)).toEqual({ totalPoints: 50.4, place: 2 });
    expect(resultAfterJump(hud, 90)).toEqual({ totalPoints: 110.1, place: 1 });
    expect(resultAfterJump({ totalBeforePoints: 0, otherTotalsPoints: [] }, -41.5)).toEqual({
      totalPoints: -41.5,
      place: 1,
    });
  });
});
