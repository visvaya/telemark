import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPETITION_SETTINGS,
  competitionReducer,
  currentJumper,
  standings,
  startCompetition,
  type CompetitionSettings,
  type CompetitionState,
  type JumpScore,
} from "./competition";
import {
  CUP_POINTS,
  competitionCupPoints,
  cupLeaders,
  cupPhase,
  cupReducer,
  cupSchedule,
  cupStandings,
  startCup,
  type CupState,
} from "./cup";

const score = (points: number, distanceM = 100): JumpScore => ({ distanceM, points, fell: false });
const scored = (s: CupState, points: number, distanceM = 100): CupState =>
  cupReducer(s, { type: "scored", score: score(points, distanceM) });

const settings: CompetitionSettings = {
  ...DEFAULT_COMPETITION_SETTINGS,
  players: [true, true, false, false, false, false, false, false],
};

/** Every jump of the current competition scores by the jumper: entrant `c` scores `pointsOf(c)`. */
function runCompetition(s: CupState, pointsOf: (competitor: number) => number): CupState {
  let out = s;
  while (cupPhase(out) === "competition") {
    const c = currentJumper(out.competition) ?? -1;
    out = scored(out, pointsOf(c));
  }
  return out;
}

describe("the cup schedule", () => {
  const list = ["a", "b", "c", "d"];

  it("runs the chosen hills in the order of the list", () => {
    expect(cupSchedule(["c", "a"], list, false)).toEqual(["a", "c"]);
  });

  it("runs the whole series twice in a double cup", () => {
    expect(cupSchedule(["d", "b"], list, true)).toEqual(["b", "d", "b", "d"]);
  });

  it("leaves out hills no longer on the list", () => {
    expect(cupSchedule(["x", "b"], list, false)).toEqual(["b"]);
    expect(cupSchedule(["x"], list, true)).toEqual([]);
    expect(cupSchedule([], list, false)).toEqual([]);
  });

  it("chooses the first hill of the list when nothing was ever chosen", () => {
    expect(cupSchedule(null, list, false)).toEqual(["a"]);
    expect(cupSchedule(null, list, true)).toEqual(["a", "a"]);
    expect(cupSchedule(null, [], false)).toEqual([]);
  });
});

describe("cup points", () => {
  it("follow the table by place, 0 beyond place 16", () => {
    expect(CUP_POINTS).toEqual([100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15]);
  });

  it("give tied entrants the points of their shared place", () => {
    let s = startCompetition(settings, 5);
    const [a, b, c] = s.order;
    const points = [120, 130, 120, 90, 80, 70];
    for (let round = 0; round < 2; round++) {
      const order = [...s.order];
      for (const competitor of order) {
        const n = s.startOrder.indexOf(competitor);
        s = jumpState(s, points[n] ?? 0);
      }
    }
    expect(s.finished).toBe(true);
    const cup = competitionCupPoints(s);
    expect(cup[b ?? -1]).toBe(100);
    expect(cup[a ?? -1]).toBe(80);
    expect(cup[c ?? -1]).toBe(80);
    expect(cup.toSorted((x, y) => y - x)).toEqual([100, 80, 80, 50, 45, 40]);
  });

  it("give 16 places to a full field of 16 entrants", () => {
    const full: CompetitionSettings = {
      ...settings,
      players: settings.players.map(() => true),
      cpus: settings.cpus.map((c) => ({ ...c, on: true })),
    };
    let s = startCompetition(full, 2);
    expect(s.competitors).toHaveLength(16);
    while (!s.finished) {
      const c = currentJumper(s) ?? 0;
      s = jumpState(s, 200 - c);
    }
    expect(competitionCupPoints(s)).toEqual(CUP_POINTS);
  });

  it("give nothing to an entrant out under the rule of real competitions", () => {
    let s = startCompetition({ ...settings, disqualification: "fis" }, 5);
    const [a] = s.order;
    s = jumpState(s, -120, 0);
    while (!s.finished) s = jumpState(s, 100);
    const cup = competitionCupPoints(s);
    expect(cup[a ?? -1]).toBe(0);
    expect(cup.filter((p) => p === 100)).toHaveLength(5);
  });
});

/** One jump in a bare competition. */
const jumpState = (s: CompetitionState, points: number, distanceM = 100): CompetitionState =>
  competitionReducer(s, { type: "scored", score: score(points, distanceM) });

describe("a cup", () => {
  it("starts with the competition a single competition from the same seed would be", () => {
    const cup = startCup(settings, ["a", "b"], 1234);
    expect(cup.competition).toEqual(startCompetition(settings, 1234));
    expect(cup.entrants).toEqual(cup.competition.competitors);
    expect(cup.schedule).toEqual(["a", "b"]);
    expect(cup.index).toBe(0);
    expect(cup.points).toEqual([]);
    expect(cupPhase(cup)).toBe("competition");
    expect(cupLeaders(cup)).toEqual([]);
  });

  it("ignores the next competition while one runs and after the last", () => {
    const cup = startCup(settings, ["a", "b"], 1);
    expect(cupReducer(cup, { type: "nextCompetition", seed: 2 })).toBe(cup);
    let s = runCompetition(cup, (c) => 100 + c);
    s = cupReducer(s, { type: "nextCompetition", seed: 2 });
    s = runCompetition(s, (c) => 100 + c);
    expect(cupPhase(s)).toBe("over");
    expect(cupReducer(s, { type: "nextCompetition", seed: 3 })).toBe(s);
  });

  it("keeps the talents and draws new forms for the next competition", () => {
    let s = runCompetition(startCup(settings, ["a", "b"], 9), (c) => 100 + c);
    const before = s.entrants;
    s = cupReducer(s, { type: "nextCompetition", seed: 77 });
    expect(s.index).toBe(1);
    expect(s.competition.round).toBe(1);
    expect(s.competition.finished).toBe(false);
    const cpus = (list: typeof before) => list.flatMap((c) => (c.kind === "cpu" ? [c.record] : []));
    const old = cpus(before);
    const now = cpus(s.competition.competitors);
    expect(now.map((r) => [r.talent1, r.talent2, r.level])).toEqual(old.map((r) => [r.talent1, r.talent2, r.level]));
    expect(now.map((r) => [r.form1, r.form2])).not.toEqual(old.map((r) => [r.form1, r.form2]));
    expect(s.entrants).toEqual(s.competition.competitors);
  });

  it("starts the next competition in the reverse order of the cup standings, ties by higher entrant first", () => {
    // Entrants 0 and 1 tie on top, 5 is last: the rest in between by their index.
    let s = runCompetition(startCup(settings, ["a", "b"], 4), (c) => (c <= 1 ? 200 : 150 - c));
    expect(cupPhase(s)).toBe("standings");
    const rows = cupStandings(s);
    expect(rows.map((r) => [r.entrant, r.place, r.totalPoints, r.lastPoints])).toEqual([
      [0, 1, 100, 100],
      [1, 1, 100, 100],
      [2, 3, 60, 60],
      [3, 4, 50, 50],
      [4, 5, 45, 45],
      [5, 6, 40, 40],
    ]);
    expect(cupLeaders(s)).toEqual([0, 1]);
    s = cupReducer(s, { type: "nextCompetition", seed: 5 });
    expect(s.competition.order).toEqual([5, 4, 3, 2, 1, 0]);
    expect(s.competition.startOrder).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it("runs a cup of two hills to the end with the phases in order", () => {
    const phases: string[] = [];
    let s = startCup(settings, cupSchedule(["b", "a"], ["a", "b"], false), 11);
    phases.push(cupPhase(s));
    s = runCompetition(s, (c) => 100 + c);
    phases.push(cupPhase(s));
    s = cupReducer(s, { type: "nextCompetition", seed: 12 });
    phases.push(cupPhase(s));
    s = runCompetition(s, (c) => (c === 0 ? 300 : 100));
    phases.push(cupPhase(s));
    expect(phases).toEqual(["competition", "standings", "competition", "over"]);
    expect(s.points).toHaveLength(2);
    const rows = cupStandings(s);
    // First competition: 5 wins (100), 4 second (80) ... 0 last (40). Second: 0 wins, the rest tie on 80.
    expect(rows.map((r) => [r.entrant, r.place, r.totalPoints, r.lastPoints])).toEqual([
      [5, 1, 180, 80],
      [4, 2, 160, 80],
      [0, 3, 140, 100],
      [3, 3, 140, 80],
      [2, 5, 130, 80],
      [1, 6, 125, 80],
    ]);
    expect(cupLeaders(s)).toEqual([5]);
    expect(standings(s.competition)).toHaveLength(6);
  });

  it("runs a double cup of two hills through four competitions", () => {
    let s = startCup(settings, cupSchedule(["a", "b"], ["a", "b"], true), 21);
    const hills: string[] = [];
    for (let k = 0; k < 4; k++) {
      hills.push(s.schedule[s.index] ?? "");
      s = runCompetition(s, (c) => 100 + c);
      expect(cupPhase(s)).toBe(k === 3 ? "over" : "standings");
      s = cupReducer(s, { type: "nextCompetition", seed: 30 + k });
    }
    expect(hills).toEqual(["a", "b", "a", "b"]);
    expect(cupStandings(s)[0]).toMatchObject({ entrant: 5, totalPoints: 400 });
  });

  it("is over after a single competition when the schedule has one hill", () => {
    const s = runCompetition(startCup(settings, ["a"], 3), (c) => 100 + c);
    expect(cupPhase(s)).toBe("over");
    expect(cupLeaders(s)).toEqual([5]);
  });

  it("does not change the state it was given", () => {
    const s = runCompetition(startCup(settings, ["a", "b"], 1), (c) => 100 + c);
    const copy = structuredClone(s);
    cupReducer(s, { type: "nextCompetition", seed: 2 });
    expect(s).toEqual(copy);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
