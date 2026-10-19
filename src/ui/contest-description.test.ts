import { describe, expect, it } from "vitest";
import { DEFAULT_COMPETITION_SETTINGS, type JumpScore } from "../game/competition";
import { startRun, withNextRound, withScore, type CompetitionRun } from "../game/competition-run";
import { keptOf, type SavedContest } from "../game/contest-save";
import { OWN_HILLS } from "../game/hill-choice";
import { contestDescription, missingHillIds, missingHillsMessage } from "./contest-description";

const score: JumpScore = { distanceM: 90, points: 60, fell: false };

function contest(schedule: readonly string[], step: (run: CompetitionRun) => CompetitionRun = (r) => r): SavedContest {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  const run = startRun([hill], DEFAULT_COMPETITION_SETTINGS, 5, () => 1);
  if (!run) throw new Error("no run");
  const moved = step(run);
  return keptOf({ ...moved, cup: { ...moved.cup, schedule } }, "board");
}

/** The run with jumps scored until the first round is over and the second started. */
function inSecondRound(run: CompetitionRun): CompetitionRun {
  let out = run;
  while (out.roundStarted) out = withScore(out, score);
  return withNextRound(out);
}

describe("the line of a kept competition", () => {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  const label = `${hill.name} K${hill.kPointM}`;

  it("tells a single competition by its hill and round", () => {
    expect(contestDescription(contest([hill.id]), OWN_HILLS)).toBe(`${label} · 1. seria`);
    expect(contestDescription(contest([hill.id], inSecondRound), OWN_HILLS)).toBe(`${label} · 2. seria`);
  });

  it("tells a cup by its competition, its standings or its end", () => {
    const cup = contest([hill.id, hill.id, hill.id, hill.id]);
    expect(contestDescription(cup, OWN_HILLS)).toBe("Puchar Świata · konkurs 1 z 4 · 1. seria");
    expect(contestDescription({ ...cup, place: "standings", cup: { ...cup.cup, points: [[]] } }, OWN_HILLS)).toBe(
      "Puchar Świata · klasyfikacja po 1 z 4",
    );
    expect(contestDescription({ ...cup, place: "end" }, OWN_HILLS)).toBe("Puchar Świata · wyniki końcowe");
  });

  it("tells a hill this device lacks by its number, or its id", () => {
    expect(contestDescription(contest(["original-5"]), OWN_HILLS)).toBe("skocznia z DSJ2 nr 5 · 1. seria");
    const cup = contest(["original-3", hill.id, "original-12", "original-3", "custom-x"]);
    expect(missingHillIds(cup, OWN_HILLS)).toEqual(["original-3", "original-12", "custom-x"]);
    expect(missingHillsMessage(cup, OWN_HILLS)).toBe(
      "Brakuje skoczni tych zawodów: skocznie z DSJ2 nr 3, 12, custom-x. Najpierw wczytaj pliki gry w menu głównym; zapisane zawody czekają.",
    );
    expect(missingHillsMessage(contest([hill.id]), OWN_HILLS)).toBeNull();
  });
});
