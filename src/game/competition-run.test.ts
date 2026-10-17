import { describe, expect, it } from "vitest";
import { DEFAULT_COMPETITION_SETTINGS, currentJumper } from "./competition";
import {
  cpuNext,
  roundJustEnded,
  startRun,
  withNextRound,
  withScore,
  withUnwatchedJumps,
  withoutLog,
} from "./competition-run";
import { OWN_HILLS } from "./hill-choice";

const hill = OWN_HILLS[0];
const seeds = () => {
  let n = 0;
  return () => ++n;
};

describe.runIf(hill)("a competition run", () => {
  if (!hill) return;
  const settings = DEFAULT_COMPETITION_SETTINGS;

  it("computes the unwatched computer jumps up to the player, and stops at the end of a round", () => {
    const run = startRun(hill, settings, 42, seeds());
    expect(cpuNext(run)).toBe(false);
    const player = currentJumper(run.state);
    expect(player === null ? null : run.state.competitors[player]?.kind).toBe("player");
    expect(run.log.length).toBe(run.state.position);
    const after = withUnwatchedJumps(withScore(withoutLog(run), { distanceM: 90, points: 100, fell: false }), seeds());
    expect(after.log[0]?.competitor).toBe(player);
    // With one player, the computer jumpers after the player finish the round, and the run stops there.
    expect(after.state.round).toBe(2);
    expect(after.state.position).toBe(0);
    expect(roundJustEnded(after)).toBe(true);
    const second = withUnwatchedJumps(withNextRound(after), seeds());
    expect(second.log.length).toBe(second.state.position);
    expect(roundJustEnded(second)).toBe(false);
  });

  it("runs a whole competition of computer jumpers to the end", () => {
    const cpusOnly = { ...settings, players: settings.players.map(() => false) };
    let run = startRun(hill, cpusOnly, 1, seeds());
    expect(run.state.round).toBe(2);
    expect(withUnwatchedJumps(run, seeds())).toBe(run);
    run = withUnwatchedJumps(withNextRound(run), seeds());
    expect(run.state.finished).toBe(true);
    expect(run.log.length).toBe(4);
  });

  it("waits at a watched computer jumper", () => {
    const watched = { ...settings, players: settings.players.map(() => false), watchCpu: true };
    const run = startRun(hill, watched, 1, seeds());
    expect(run.log).toEqual([]);
    expect(cpuNext(run)).toBe(true);
  });

  it("is the same competition from the same seeds", () => {
    expect(startRun(hill, settings, 9, seeds())).toEqual(startRun(hill, settings, 9, seeds()));
  });
});
