import { describe, expect, it } from "vitest";
import { DEFAULT_COMPETITION_SETTINGS, currentJumper, type CompetitionSettings } from "./competition";
import {
  competitionOf,
  cpuNext,
  isCup,
  roundJustEnded,
  startRun,
  withNextCompetition,
  withNextRound,
  withScore,
  withUnwatchedJumps,
  withoutLog,
  type CompetitionRun,
} from "./competition-run";
import { cupPhase } from "./cup";
import { OWN_HILLS, type HillChoice } from "./hill-choice";

const hill = OWN_HILLS[0];
const other = OWN_HILLS[1];
const seeds = () => {
  let n = 0;
  return () => ++n;
};

function started(hills: readonly HillChoice[], settings: CompetitionSettings, seed: number): CompetitionRun {
  const run = startRun(hills, settings, seed, seeds());
  if (run === null) throw new Error("no run");
  return run;
}

/** The run with every round started until its competition is over (computer jumpers only, not watched). */
function finished(run: CompetitionRun): CompetitionRun {
  let out = run;
  while (!competitionOf(out).finished) out = withUnwatchedJumps(withNextRound(out), seeds());
  return out;
}

describe.runIf(hill && other)("a competition run", () => {
  if (!hill || !other) return;
  const settings = DEFAULT_COMPETITION_SETTINGS;
  const cpusOnly = { ...settings, players: settings.players.map(() => false) };

  it("computes the unwatched computer jumps up to the player, and stops at the end of a round", () => {
    const run = started([hill], settings, 42);
    expect(isCup(run)).toBe(false);
    expect(cpuNext(run)).toBe(false);
    const player = currentJumper(competitionOf(run));
    expect(player === null ? null : competitionOf(run).competitors[player]?.kind).toBe("player");
    expect(run.log.length).toBe(competitionOf(run).position);
    const after = withUnwatchedJumps(withScore(withoutLog(run), { distanceM: 90, points: 100, fell: false }), seeds());
    expect(after.log[0]?.competitor).toBe(player);
    // With one player, the computer jumpers after the player finish the round, and the run stops there.
    expect(competitionOf(after).round).toBe(2);
    expect(competitionOf(after).position).toBe(0);
    expect(roundJustEnded(after)).toBe(true);
    const second = withUnwatchedJumps(withNextRound(after), seeds());
    expect(second.log.length).toBe(competitionOf(second).position);
    expect(roundJustEnded(second)).toBe(false);
  });

  it("runs a whole competition of computer jumpers to the end", () => {
    let run = started([hill], cpusOnly, 1);
    expect(competitionOf(run).round).toBe(2);
    expect(withUnwatchedJumps(run, seeds())).toBe(run);
    run = withUnwatchedJumps(withNextRound(run), seeds());
    expect(competitionOf(run).finished).toBe(true);
    expect(run.log.length).toBe(4);
    expect(cupPhase(run.cup)).toBe("over");
    expect(withNextCompetition(run, 5, seeds())).toBe(run);
  });

  it("waits at a watched computer jumper", () => {
    const watched = { ...cpusOnly, watchCpu: true };
    const run = started([hill], watched, 1);
    expect(run.log).toEqual([]);
    expect(cpuNext(run)).toBe(true);
  });

  it("is the same competition from the same seeds", () => {
    expect(started([hill], settings, 9)).toEqual(started([hill], settings, 9));
  });

  it("starts nothing without a hill", () => {
    expect(startRun([], settings, 1, seeds())).toBeNull();
  });

  it("goes from one competition of a cup to the next on its hill", () => {
    const run = started([hill, other], cpusOnly, 3);
    expect(isCup(run)).toBe(true);
    expect(run.hill).toBe(hill);
    // Not before the competition is over.
    expect(withNextCompetition(run, 5, seeds())).toBe(run);
    const first = finished(run);
    expect(cupPhase(first.cup)).toBe("standings");
    const next = withNextCompetition(first, 5, seeds());
    expect(next.hill).toBe(other);
    expect(next.cup.index).toBe(1);
    expect(roundJustEnded(next)).toBe(true);
    // The computer jumpers of the first round are computed at once.
    expect(competitionOf(next).round).toBe(2);
    expect(next.log.length).toBe(competitionOf(next).competitors.length);
    const last = finished(next);
    expect(cupPhase(last.cup)).toBe("over");
    expect(last.cup.points.length).toBe(2);
  });
});
