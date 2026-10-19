import { useRef, useState } from "react";
import { currentJumper, type CompetitionSettings, type JumpScore } from "../game/competition";
import { contestJumpHud } from "../game/competition-board";
import { cpuCompetitionJump, type CpuJumpOutcome } from "../game/competition-jump";
import { keptOf, runOfKept, type SavedContest } from "../game/contest-save";
import { cupLeaders } from "../game/cup";
import {
  competitionOf,
  roundJustEnded,
  startRun,
  withNextCompetition,
  withNextRound,
  withScore,
  withUnwatchedJumps,
  withoutLog,
  type CompetitionRun,
} from "../game/competition-run";
import type { HillChoice } from "../game/hill-choice";
import type { Outfit } from "../game/outfit";
import { newSeed, startComputedJump } from "../game/training-session";
import { UI_TEXT } from "../text/ui-text";
import { competitorName, competitorOutfit, competitorShortName } from "./competition-names";
import { recordedInput, type ReplaySource } from "./jump-replay";
import type { ContestJump } from "./jump-screen";

type Show = (
  screen:
    | { kind: "menu" }
    | { kind: "contest"; hill: HillChoice }
    | { kind: "contest-jump"; hill: HillChoice }
    | { kind: "cup-standings" }
    | { kind: "cup-end" },
) => void;

/** A computer jumper's competition jump, played in the picture from the pilot's inputs. */
function cpuSource(outcome: CpuJumpOutcome, hudName: string): ReplaySource {
  const recording = { seed: 0, inputs: outcome.inputs, newRecord: false };
  return {
    start: (hill) => startComputedJump(hill, outcome.start),
    input: (logic) => recordedInput(recording, logic),
    newRecord: false,
    origin: "own",
    jumperName: hudName,
  };
}

/** The jump being shown: its key for the screen, and what the jump screen needs of it. */
interface ShownJump {
  key: string;
  contest: ContestJump;
}

/**
 * The competition being run, and the way through it: the board, the jumps (a computer jumper's only when
 * watched), the results. Each board, the cup standings and the end are handed to `keep`, so a competition goes on
 * after the page is closed; null when it is over or ended.
 */
export function useCompetition(show: Show, ownOutfit: Outfit, keep: (contest: SavedContest | null) => void) {
  const [run, setRun] = useState<CompetitionRun | null>(null);
  const [jump, setJump] = useState<ShownJump | null>(null);
  /** The result of the player's jump on the screen, once it is over. */
  const playerScore = useRef<JumpScore | null>(null);

  const board = (next: CompetitionRun) => {
    setRun(next);
    setJump(null);
    keep(keptOf(next, "board"));
    show({ kind: "contest", hill: next.hill });
  };

  /** To the menu; the competition stays kept. */
  const leave = () => {
    setRun(null);
    setJump(null);
    show({ kind: "menu" });
  };

  /** To the menu, with the competition no longer kept: ended by the player, or over. */
  const finish = () => {
    keep(null);
    leave();
  };

  /** Shows the jump of the next jumper: the player's, or a watched computer jumper's. */
  const jumpOf = (current: CompetitionRun) => {
    const state = competitionOf(current);
    const index = currentJumper(state);
    const competitor = state.competitors[index ?? -1];
    if (index === null || competitor === undefined) return;
    const hudName = UI_TEXT.competition.hudName(competitorName(competitor), state.round);
    const outcome = competitor.kind === "cpu" ? cpuCompetitionJump(current.hill, competitor.record, newSeed()) : null;
    playerScore.current = null;
    const afterJump = (score: JumpScore | null): boolean => {
      if (score === null) return false;
      board(withUnwatchedJumps(withScore(current, score), newSeed));
      return true;
    };
    setRun(current);
    // The state before this jump, with the computer jumps since the last board: leaving during the jump comes back
    // to it, so those jumps are not drawn again.
    keep(keptOf(current, "board"));
    setJump({
      key: `${current.cup.index}-${state.round}-${state.position}`,
      contest: {
        hudName,
        outfit: competitorOutfit(competitor, ownOutfit),
        leader: cupLeaders(current.cup).includes(index),
        cpu: outcome ? cpuSource(outcome, hudName) : null,
        onNext: () => afterJump(outcome ? outcome.score : playerScore.current),
        onLeave: leave,
        onEnd: finish,
        hud: contestJumpHud(state, index, current.hill.kPointM),
        holder: competitorShortName(competitor),
      },
    });
    show({ kind: "contest-jump", hill: current.hill });
  };

  const begin = (hills: readonly HillChoice[], settings: CompetitionSettings) => {
    const started = startRun(hills, settings, newSeed(), newSeed);
    if (started) board(started);
  };

  return {
    run,
    jump,
    /** Starts a competition on each of the hills, in this order: one hill is a single competition. */
    start: begin,
    /** The same competitions again, with the same settings and a new draw. */
    again: () => {
      if (run) begin(run.hills, run.settings);
    },
    /** After a competition of a cup: its standings, or the end screen after the last. */
    standings: () => {
      if (!run) return;
      keep(keptOf(run, "standings"));
      show({ kind: "cup-standings" });
    },
    end: () => {
      if (!run) return;
      keep(keptOf(run, "end"));
      show({ kind: "cup-end" });
    },
    /** Goes on with a kept competition where it was left, on these hills; false when one of them is missing. */
    resume: (contest: SavedContest, hills: readonly HillChoice[]): boolean => {
      const resumed = runOfKept(contest, hills);
      if (resumed === null) return false;
      setRun(resumed);
      setJump(null);
      keep(contest);
      if (contest.place === "standings") show({ kind: "cup-standings" });
      else if (contest.place === "end") show({ kind: "cup-end" });
      else show({ kind: "contest", hill: resumed.hill });
      return true;
    },
    /** From the cup standings: the board of the next competition. */
    nextCompetition: () => {
      if (run) board(withNextCompetition(run, newSeed(), newSeed));
    },
    /** The board's button: the next round, or the next jump. */
    next: () => {
      if (!run || competitionOf(run).finished) return;
      if (roundJustEnded(run)) {
        const started = withUnwatchedJumps(withNextRound(run), newSeed);
        if (started.log.length > 0 || roundJustEnded(started)) board(started);
        else jumpOf(started);
        return;
      }
      jumpOf(withoutLog(run));
    },
    onPlayerResult: (result: JumpScore) => {
      playerScore.current = result;
    },
    leave,
    finish,
  };
}
