import { useRef, useState } from "react";
import { currentJumper, type CompetitionSettings, type JumpScore } from "../game/competition";
import { cpuCompetitionJump, type CpuJumpOutcome } from "../game/competition-jump";
import {
  roundJustEnded,
  startRun,
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
import { competitorName, competitorOutfit } from "./competition-names";
import { recordedInput, type ReplaySource } from "./jump-replay";
import type { ContestJump } from "./jump-screen";

type Show = (
  screen: { kind: "menu" } | { kind: "contest"; hill: HillChoice } | { kind: "contest-jump"; hill: HillChoice },
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
 * watched), the results. Nothing of it is stored: a competition left halfway ends.
 */
export function useCompetition(show: Show, ownOutfit: Outfit) {
  const [run, setRun] = useState<CompetitionRun | null>(null);
  const [jump, setJump] = useState<ShownJump | null>(null);
  /** The result of the player's jump on the screen, once it is over. */
  const playerScore = useRef<JumpScore | null>(null);

  const board = (next: CompetitionRun) => {
    setRun(next);
    setJump(null);
    show({ kind: "contest", hill: next.hill });
  };

  const abandon = () => {
    setRun(null);
    setJump(null);
    show({ kind: "menu" });
  };

  /** Shows the jump of the next jumper: the player's, or a watched computer jumper's. */
  const jumpOf = (current: CompetitionRun) => {
    const index = currentJumper(current.state);
    const competitor = current.state.competitors[index ?? -1];
    if (index === null || competitor === undefined) return;
    const hudName = UI_TEXT.competition.hudName(competitorName(competitor), current.state.round);
    const outcome = competitor.kind === "cpu" ? cpuCompetitionJump(current.hill, competitor.record, newSeed()) : null;
    playerScore.current = null;
    const afterJump = (score: JumpScore | null): boolean => {
      if (score === null) return false;
      board(withUnwatchedJumps(withScore(current, score), newSeed));
      return true;
    };
    setRun(current);
    setJump({
      key: `${current.state.round}-${current.state.position}`,
      contest: {
        hudName,
        outfit: competitorOutfit(competitor, ownOutfit),
        cpu: outcome ? cpuSource(outcome, hudName) : null,
        onNext: () => afterJump(outcome ? outcome.score : playerScore.current),
        onAbandon: abandon,
      },
    });
    show({ kind: "contest-jump", hill: current.hill });
  };

  return {
    run,
    jump,
    start: (hill: HillChoice, settings: CompetitionSettings) => {
      board(startRun(hill, settings, newSeed(), newSeed));
    },
    again: () => {
      if (run) board(startRun(run.hill, run.settings, newSeed(), newSeed));
    },
    /** The board's button: the next round, or the next jump. */
    next: () => {
      if (!run || run.state.finished) return;
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
    abandon,
  };
}
