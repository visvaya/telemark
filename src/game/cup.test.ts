import { describe, expect, it } from "vitest";
import { BorlandRandom } from "../sim/borland-random";
import { drawCpuForm } from "../sim/cpu-pilot";
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
  tiedOnPoints,
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
    expect(cupSchedule([], list, false)).toEqual([]);
  });

  it("falls back to the first hill when none of the chosen hills is on the list any more", () => {
    // The original's files went, and with them every hill chosen: as if nothing had been chosen.
    expect(cupSchedule(["x"], list, false)).toEqual(["a"]);
    expect(cupSchedule(["x", "y"], list, true)).toEqual(["a", "a"]);
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
    // The forms are drawn from the competition's seed, one computer jumper after another in entrant order.
    const rng = new BorlandRandom(77);
    const drawn = old.map(() => drawCpuForm(rng));
    expect(now.map((r) => ({ form1: r.form1, form2: r.form2 }))).toEqual(drawn);
    expect(drawn).not.toEqual(old.map((r) => ({ form1: r.form1, form2: r.form2 })));
    expect(s.entrants).toEqual(s.competition.competitors);
  });

  it("starts the next competition in the reverse order of the cup standings", () => {
    // Entrants 0 and 1 tie on top with a win each, so the lots order them; 5 is last.
    const run = runCompetition(startCup(settings, ["a", "b"], 4), (c) => (c <= 1 ? 200 : 150 - c));
    let s: CupState = { ...run, lots: [3, 1, 5, 0, 2, 4] };
    expect(cupPhase(s)).toBe("standings");
    const rows = cupStandings(s);
    expect(rows.map((r) => [r.entrant, r.place, r.totalPoints, r.lastPoints, r.wins])).toEqual([
      [1, 1, 100, 100, 1],
      [0, 1, 100, 100, 1],
      [2, 3, 60, 60, 0],
      [3, 4, 50, 50, 0],
      [4, 5, 45, 45, 0],
      [5, 6, 40, 40, 0],
    ]);
    expect(cupLeaders(s)).toEqual([1, 0]);
    s = cupReducer(s, { type: "nextCompetition", seed: 5 });
    expect(s.competition.order).toEqual([5, 4, 3, 2, 0, 1]);
    expect(s.competition.startOrder).toEqual([5, 4, 3, 2, 0, 1]);
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
    // First competition: 5 wins (100), 4 second (80) ... 0 last (40). Second: 0 wins, the rest tie on 80. 0 and 3
    // tie on 140; 0 has a win, so the final standings give 0 the third place and 3 the fourth.
    expect(rows.map((r) => [r.entrant, r.place, r.totalPoints, r.lastPoints, r.wins])).toEqual([
      [5, 1, 180, 80, 1],
      [4, 2, 160, 80, 0],
      [0, 3, 140, 100, 1],
      [3, 4, 140, 80, 0],
      [2, 5, 130, 80, 0],
      [1, 6, 125, 80, 0],
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

/**
 * A cup of players whose finished competitions gave these places (null: no place), kept as the cup points they
 * scored; with the lots in entrant order unless given, and over (the final standings) when asked.
 */
function withPlaces(
  places: readonly (readonly (number | null)[])[],
  { lots, over = false }: { lots?: readonly number[]; over?: boolean } = {},
): CupState {
  const base = startCup(settings, ["a", "b", "c"], 7);
  const count = places[0]?.length ?? 0;
  const entrants = Array.from({ length: count }, (_v, slot) => ({ kind: "player" as const, slot }));
  return {
    ...base,
    index: over ? base.schedule.length - 1 : base.index,
    competition: { ...base.competition, finished: over },
    entrants,
    points: places.map((row) => row.map((p) => (p === null ? 0 : (CUP_POINTS[p - 1] ?? 0)))),
    lots: lots ?? entrants.map((_e, i) => i),
  };
}

/** The entrants of the standings in order, with their places. */
const ranked = (s: CupState): number[][] => cupStandings(s).map((r) => [r.entrant, r.place]);

describe("ties in the cup standings", () => {
  // Cup points: 1st 100, 2nd 80, 3rd 60, 4th 50, 6th 40.
  it("put the entrant with more wins higher and share the place during the cup", () => {
    const s = withPlaces([
      [2, 1],
      [3, 6],
    ]);
    expect(ranked(s)).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(cupStandings(s).map((r) => r.wins)).toEqual([1, 0]);
  });

  it("go on to second places when the wins are equal", () => {
    const s = withPlaces([
      [3, 2],
      [3, 6],
    ]);
    expect(ranked(s)).toEqual([
      [1, 1],
      [0, 1],
    ]);
  });

  it("go on to the following places", () => {
    const s = withPlaces([
      [4, 3],
      [4, 6],
    ]);
    expect(ranked(s)).toEqual([
      [1, 1],
      [0, 1],
    ]);
  });

  it("are settled by the lots drawn with the cup when everything else is equal", () => {
    const places = [
      [1, 1],
      [3, 2],
      [2, 3],
    ];
    expect(ranked(withPlaces(places, { lots: [1, 0] }))).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(ranked(withPlaces(places, { lots: [0, 1] }))).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("leave out a competition without a place", () => {
    // Both on 100 points: 0 won once, 1 has no place in the first competition and won the second.
    const s = withPlaces(
      [
        [1, null],
        [null, 1],
      ],
      { lots: [1, 0] },
    );
    expect(cupStandings(s).map((r) => [r.entrant, r.totalPoints, r.wins])).toEqual([
      [1, 100, 1],
      [0, 100, 1],
    ]);
  });

  it("give every entrant a place of their own in the final standings", () => {
    const s = withPlaces(
      [
        [2, 1, 1, 5],
        [3, 6, 6, 5],
      ],
      { over: true, lots: [3, 2, 1, 0] },
    );
    // 0, 1 and 2 on 140 points: 1 and 2 have a win and the same places, so the lots put 2 first; 3 has 90.
    expect(cupPhase(s)).toBe("over");
    expect(ranked(s)).toEqual([
      [2, 1],
      [1, 2],
      [0, 3],
      [3, 4],
    ]);
    expect(cupLeaders(s)).toEqual([2]);
  });

  it("are told apart from standings without tied points", () => {
    expect(tiedOnPoints(cupStandings(withPlaces([[1, 2, 3]])))).toBe(false);
    expect(
      tiedOnPoints(
        cupStandings(
          withPlaces([
            [1, 2, 3],
            [3, 2, 1],
          ]),
        ),
      ),
    ).toBe(true);
    const tiedAtTheEnd = withPlaces(
      [
        [1, 2, 3],
        [3, 2, 1],
      ],
      { over: true },
    );
    expect(tiedOnPoints(cupStandings(tiedAtTheEnd))).toBe(true);
  });
});

describe("wins", () => {
  it("are 0 before the first competition ends", () => {
    const s = startCup(settings, ["a", "b"], 7);
    expect(cupStandings(s).every((r) => r.wins === 0)).toBe(true);
  });

  it("count a shared first place for each tied entrant", () => {
    const s = runCompetition(startCup(settings, ["a", "b"], 7), () => 100);
    expect(cupStandings(s).every((r) => r.wins === 1)).toBe(true);
  });

  it("are not counted for an entrant out under the rule of real competitions", () => {
    let s = startCup({ ...settings, disqualification: "fis" }, ["a", "b"], 5);
    const [a] = s.competition.order;
    s = scored(s, -120, 0);
    s = runCompetition(s, () => 100);
    expect(s.points[0]?.[a ?? -1]).toBe(0);
    expect(cupStandings(s).find((r) => r.entrant === a)?.wins).toBe(0);
  });
});

describe("the lots of a cup", () => {
  it("are every entrant once, drawn from the seed after the first competition", () => {
    const a = startCup(settings, ["a", "b"], 41);
    expect(a.lots.toSorted((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(startCup(settings, ["a", "b"], 41).lots).toEqual(a.lots);
    const seeds = Array.from({ length: 8 }, (_v, i) => startCup(settings, ["a"], i).lots.join());
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("stay the same through the cup", () => {
    let s = runCompetition(startCup(settings, ["a", "b"], 9), (c) => 100 + c);
    const lots = s.lots;
    s = cupReducer(s, { type: "nextCompetition", seed: 3 });
    expect(s.lots).toBe(lots);
  });
});
