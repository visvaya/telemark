import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPETITION_SETTINGS,
  competitionReducer,
  currentJumper,
  parseCompetitionSettings,
  participantCount,
  placeOf,
  secondRoundOrder,
  standings,
  startCompetition,
  type CompetitionSettings,
  type CompetitionState,
  type JumpScore,
} from "./competition";

const score = (points: number, distanceM = 100): JumpScore => ({ distanceM, points, fell: false });
const scored = (s: CompetitionState, points: number) => competitionReducer(s, { type: "scored", score: score(points) });

const allOff: CompetitionSettings = {
  ...DEFAULT_COMPETITION_SETTINGS,
  players: DEFAULT_COMPETITION_SETTINGS.players.map(() => false),
  cpus: DEFAULT_COMPETITION_SETTINGS.cpus.map((c) => ({ ...c, on: false })),
};

describe("competition settings", () => {
  it("default to player 1 and computer jumpers 1-4 at average, good, weak and super", () => {
    const d = DEFAULT_COMPETITION_SETTINGS;
    expect(d.players).toEqual([true, false, false, false, false, false, false, false]);
    expect(d.cpus.map((c) => c.on)).toEqual([true, true, true, true, false, false, false, false]);
    expect(d.cpus.slice(0, 4).map((c) => c.level)).toEqual([2, 3, 1, 4]);
    expect(d.watchCpu).toBe(false);
    expect(participantCount(d)).toBe(5);
  });

  it("read what is stored and default the rest", () => {
    const stored = {
      hillId: "own-3",
      players: [false, true],
      cpus: [{ on: false, level: 5 }, { level: 9 }],
      watchCpu: true,
    };
    const s = parseCompetitionSettings(stored);
    expect(s.hillId).toBe("own-3");
    expect(s.players.slice(0, 3)).toEqual([false, true, false]);
    expect(s.cpus[0]).toEqual({ on: false, level: 5 });
    expect(s.cpus[1]).toEqual({ on: true, level: 3 });
    expect(s.watchCpu).toBe(true);
    expect(parseCompetitionSettings(undefined)).toEqual(DEFAULT_COMPETITION_SETTINGS);
  });

  it("never read as a competition without anybody", () => {
    expect(participantCount(parseCompetitionSettings(allOff))).toBeGreaterThan(0);
  });
});

describe("a competition", () => {
  const settings: CompetitionSettings = {
    ...DEFAULT_COMPETITION_SETTINGS,
    players: [true, true, false, false, false, false, false, false],
  };

  it("draws the same start from the same seed, with every participant once", () => {
    const a = startCompetition(settings, 1234);
    expect(startCompetition(settings, 1234)).toEqual(a);
    expect(a.competitors.map((c) => `${c.kind}${c.slot}`)).toEqual([
      "player0",
      "player1",
      "cpu0",
      "cpu1",
      "cpu2",
      "cpu3",
    ]);
    expect(a.order.toSorted((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => startCompetition(settings, seed).order.join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("gives computer jumpers their level, or a drawn one for the random setting", () => {
    const s = startCompetition(
      { ...allOff, cpus: allOff.cpus.map((_c, i) => ({ on: i < 2, level: i === 0 ? 4 : 5 })) },
      99,
    );
    const levels = s.competitors.map((c) => (c.kind === "cpu" ? c.record.level : -1));
    expect(levels[0]).toBe(4);
    expect(levels[1]).toBeGreaterThanOrEqual(0);
    expect(levels[1]).toBeLessThanOrEqual(4);
  });

  it("runs the second round in reverse order of the first round's classification", () => {
    let s = startCompetition(settings, 7);
    const first = [...s.order];
    // The n-th jumper of the first round scores 10 * n points: the last one leads.
    first.forEach((_c, n) => {
      s = scored(s, 10 * (n + 1));
    });
    expect(s.round).toBe(2);
    expect(s.position).toBe(0);
    expect(s.order).toEqual(first);
    expect(secondRoundOrder(s)).toEqual(first);
    expect(currentJumper(s)).toBe(first[0]);
  });

  it("ends after the second round with the total of both jumps", () => {
    let s = startCompetition(settings, 3);
    for (let i = 0; i < 12; i++) s = scored(s, 50.1);
    expect(s.finished).toBe(true);
    expect(currentJumper(s)).toBeNull();
    expect(scored(s, 10)).toBe(s);
    expect(standings(s).every((r) => r.totalPoints === 100.2)).toBe(true);
  });

  it("gives tied competitors one place and keeps them in start order", () => {
    let s = startCompetition(settings, 5);
    const [a, b, c] = s.order;
    s = scored(s, 120);
    s = scored(s, 130);
    s = scored(s, 120);
    const rows = standings(s);
    expect(rows.map((r) => [r.competitor, r.place])).toEqual([
      [b, 1],
      [a, 2],
      [c, 2],
    ]);
    expect(placeOf(s, c ?? -1)).toBe(2);
    expect(placeOf(s, s.order[5] ?? -1)).toBeNull();
  });

  it("counts single-precision points to a tenth, so equal shown totals tie", () => {
    let s = startCompetition(settings, 11);
    s = scored(s, Math.fround(120.3));
    s = scored(s, 120.3);
    expect(standings(s).map((r) => r.place)).toEqual([1, 1]);
  });

  it("does not change the state it was given", () => {
    const s = startCompetition(settings, 1);
    const copy = structuredClone(s);
    scored(s, 10);
    expect(s).toEqual(copy);
  });
});
