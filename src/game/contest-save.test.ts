import { describe, expect, it } from "vitest";
import { DEFAULT_COMPETITION_SETTINGS, currentJumper, type CompetitionSettings, type JumpScore } from "./competition";
import {
  competitionOf,
  roundJustEnded,
  startRun,
  withNextCompetition,
  withNextRound,
  withScore,
  type CompetitionRun,
} from "./competition-run";
import { keptOf, parseSavedContest, runOfKept, type SavedContest } from "./contest-save";
import { cupPhase } from "./cup";
import { OWN_HILLS, type HillChoice } from "./hill-choice";

const seeds = () => {
  let n = 0;
  return () => ++n;
};

/** A jump's score from its number: some falls, some disqualified, points of every size. */
function scoreOf(n: number): JumpScore {
  if (n % 7 === 3) return { distanceM: 0, points: -12.5, fell: false };
  return { distanceM: 80 + (n % 11) * 1.5, points: 40 + ((n * 13) % 50) + 0.5, fell: n % 5 === 0 };
}

/**
 * Every state a run goes through, as kept: the start, after each jump, between rounds, the standings, the next
 * competition, the end.
 */
function keptStates(hills: readonly HillChoice[], settings: CompetitionSettings): SavedContest[] {
  let run: CompetitionRun | null = startRun(hills, settings, 4321, seeds());
  if (run === null) throw new Error("no run");
  const out: SavedContest[] = [keptOf(run, "board")];
  let n = 0;
  for (let guard = 0; guard < 500; guard++) {
    const phase = cupPhase(run.cup);
    if (phase === "over") {
      if (hills.length > 1) out.push(keptOf(run, "end"));
      return out;
    }
    if (phase === "standings") {
      out.push(keptOf(run, "standings"));
      run = withNextCompetition(run, 99 + n, seeds());
    } else if (roundJustEnded(run)) run = withNextRound(run);
    else run = withScore(run, scoreOf(n++));
    out.push(keptOf(run, "board"));
  }
  throw new Error("the run did not end");
}

const inside = (o: unknown, key: string | number): unknown =>
  typeof o === "object" && o !== null ? Reflect.get(o, key) : undefined;

const json = <T>(v: T): T => structuredClone(v);

const [first, second] = OWN_HILLS;
const players: CompetitionSettings = {
  ...DEFAULT_COMPETITION_SETTINGS,
  players: [true, false, true, false, false, false, false, false],
};
const fis: CompetitionSettings = {
  ...players,
  disqualification: "fis",
  cpus: players.cpus.map((c) => ({ ...c, level: 5 })),
};

describe.runIf(first && second)("a kept competition", () => {
  if (!first || !second) return;
  const single = keptStates([first], players);
  const cup = keptStates([first, second], players);
  const cupFis = keptStates([second, first, second], fis);
  const all = [...single, ...cup, ...cupFis];
  // Halfway through the first round of the first competition.
  const sample = cup.find((c) => c.cup.competition.round === 1 && c.cup.competition.position > 1);
  if (sample === undefined) throw new Error("no states");

  it("reads back every state of real runs, through JSON, as it was", () => {
    expect(single.length).toBeGreaterThan(10);
    expect(cup.some((c) => c.place === "standings")).toBe(true);
    expect(cup.at(-1)?.place).toBe("end");
    expect(cupFis.some((c) => !c.roundStarted)).toBe(true);
    for (const state of all) expect(parseSavedContest(json(state))).toEqual(json(state));
  });

  it("goes on as a run on the hills of its schedule, and not without one of them", () => {
    const run = runOfKept(sample, [second, first]);
    expect(run?.hill.id).toBe(sample.cup.schedule[sample.cup.index]);
    expect(run?.hills.map((h) => h.id)).toEqual(sample.cup.schedule);
    expect(run !== null && currentJumper(competitionOf(run))).toBe(currentJumper(sample.cup.competition));
    expect(runOfKept(sample, [first])).toBeNull();
  });

  /** The sample as JSON with one change at a path. */
  function changed(path: readonly (string | number)[], value: unknown): unknown {
    const copy: unknown = json(sample);
    const at = path.slice(0, -1).reduce(inside, copy);
    const last = path.at(-1);
    if (typeof at === "object" && at !== null && last !== undefined) Reflect.set(at, last, value);
    return copy;
  }

  it("ignores fields it does not know", () => {
    const extra = { ...sample, note: "x", cup: { ...sample.cup, more: [1] } };
    expect(parseSavedContest(extra)).toEqual(json(sample));
  });

  it.each([
    ["not an object", null],
    ["an array", []],
    ["a string", "contest"],
    ["no settings", changed(["settings"], undefined)],
    ["settings with seven players", changed(["settings", "players"], [true, false, false, false, false, false, false])],
    ["a level out of range", changed(["settings", "cpus", 0, "level"], 6)],
    ["an unknown rule", changed(["settings", "disqualification"], "none")],
    ["an unknown place", changed(["place"], "jump")],
    ["roundStarted as a string", changed(["roundStarted"], "true")],
    ["an empty schedule", changed(["cup", "schedule"], [])],
    [
      "75 competitions",
      changed(
        ["cup", "schedule"],
        Array.from({ length: 75 }, () => "x"),
      ),
    ],
    ["a hill id too long", changed(["cup", "schedule", 0], "x".repeat(65))],
    ["an index past the schedule", changed(["cup", "index"], 2)],
    ["a fractional index", changed(["cup", "index"], 0.5)],
    ["a slot of 8", changed(["cup", "entrants", 0, "slot"], 8)],
    ["a form of NaN as a string", changed(["cup", "entrants", 2, "record", "form1"], "NaN")],
    ["a form beyond any drawn", changed(["cup", "entrants", 2, "record", "form1"], 1e308)],
    ["a talent far beyond the widest drawn", changed(["cup", "entrants", 2, "record", "talent2"], 5)],
    ["a level of 5 in a record", changed(["cup", "entrants", 2, "record", "level"], 5)],
    [
      "17 entrants",
      changed(
        ["cup", "entrants"],
        Array.from({ length: 17 }, () => sample.cup.entrants[0]),
      ),
    ],
    ["competitors other than the entrants", changed(["cup", "competition", "competitors", 0, "slot"], 1)],
    ["a round of 3", changed(["cup", "competition", "round"], 3)],
    ["a position past the order", changed(["cup", "competition", "position"], 99)],
    ["a negative position", changed(["cup", "competition", "position"], -1)],
    ["a duplicated order entry", changed(["cup", "competition", "order", 1], sample.cup.competition.order[0])],
    ["an order index out of range", changed(["cup", "competition", "order", 0], 6)],
    ["a short start order", changed(["cup", "competition", "startOrder"], [0])],
    ["three rounds of scores", changed(["cup", "competition", "scores", 2], [])],
    ["a short round of scores", changed(["cup", "competition", "scores", 0], [null])],
    ["finished with jumps to come", changed(["cup", "competition", "finished"], true)],
    ["a rule other than the settings'", changed(["cup", "competition", "disqualification"], "fis")],
    ["points of the wrong count", changed(["cup", "points"], [[], [], [], [], []])],
  ])("refuses %s", (_name, value) => {
    expect(parseSavedContest(value)).toBeNull();
  });

  it("refuses scores where the state has no jump, and missing ones where it has", () => {
    const state = sample.cup.competition;
    const jumped = state.order[0] ?? 0;
    const notYet = state.order.at(-1) ?? 0;
    const roundIndex = state.round - 1;
    expect(state.position).toBeGreaterThan(0);
    expect(parseSavedContest(changed(["cup", "competition", "scores", roundIndex, notYet], scoreOf(1)))).toBeNull();
    expect(state.round).toBe(1);
    expect(parseSavedContest(changed(["cup", "competition", "scores", 0, jumped], null))).toBeNull();
    expect(
      parseSavedContest(
        changed(["cup", "competition", "scores", roundIndex, jumped], { distanceM: 0.3, points: 1, fell: false }),
      ),
    ).toBeNull();
    expect(
      parseSavedContest(
        changed(["cup", "competition", "scores", roundIndex, jumped], { distanceM: 90, points: Infinity, fell: false }),
      ),
    ).toBeNull();
  });

  it("refuses a place the cup is not at", () => {
    const running = cup.find((c) => c.place === "board" && !c.cup.competition.finished);
    expect(parseSavedContest({ ...running, place: "standings" })).toBeNull();
    expect(parseSavedContest({ ...running, place: "end" })).toBeNull();
    const last = single.at(-1);
    expect(parseSavedContest({ ...last, place: "end" })).toBeNull();
  });

  it("refuses cup points that do not follow from the finished competition", () => {
    const standings = cup.find((c) => c.place === "standings");
    if (standings === undefined) throw new Error("no standings");
    const points = standings.cup.points.map((row) => row.map((p) => (p === 100 ? 80 : p)));
    expect(parseSavedContest({ ...standings, cup: { ...standings.cup, points } })).toBeNull();
  });

  it("never throws, whatever it is given", () => {
    const hostile: unknown[] = [
      undefined,
      0,
      Number.NaN,
      "x".repeat(10_000_000),
      { settings: { players: { length: 8 } } },
      Object.create(null),
      {
        cup: new Proxy(
          {},
          {
            get: () => {
              throw new Error("trap");
            },
          },
        ),
        settings: json(sample.settings),
      },
    ];
    for (const v of hostile) expect(parseSavedContest(v)).toBeNull();
  });
});
