import {
  competitionReducer,
  currentJumper,
  placeOf,
  startCompetition,
  type CompetitionSettings,
  type CompetitionState,
  type JumpScore,
} from "./competition";
import { cpuCompetitionJump } from "./competition-jump";
import type { HillChoice } from "./hill-choice";

/** A jump as the board between jumps tells it: who, the score, and the place after it. */
interface LoggedJump {
  competitor: number;
  round: number;
  score: JumpScore;
  place: number;
}

/** A competition being run: its hill and settings, its state, and the jumps since the board was last shown. */
export interface CompetitionRun {
  hill: HillChoice;
  settings: CompetitionSettings;
  state: CompetitionState;
  log: readonly LoggedJump[];
  /** False from the end of a round until the board starts the next one. */
  roundStarted: boolean;
}

/** The run after the jump of the current jumper scored `score`, with the jump in the log. */
export function withScore(run: CompetitionRun, score: JumpScore): CompetitionRun {
  const competitor = currentJumper(run.state);
  if (competitor === null) return run;
  const state = competitionReducer(run.state, { type: "scored", score });
  const place = placeOf(state, competitor) ?? 0;
  const log = [...run.log, { competitor, round: run.state.round, score, place }];
  return { ...run, state, log, roundStarted: state.round === run.state.round };
}

/** Whether the next jumper is a computer jumper. */
export function cpuNext(run: CompetitionRun): boolean {
  const next = currentJumper(run.state);
  return next !== null && run.state.competitors[next]?.kind === "cpu";
}

/**
 * The run after the computer jumpers who are next and are not watched have jumped, each from a seed of
 * `nextSeed`; computed without drawing, as the original does. Stops at a player, a watched computer jumper,
 * the end of a round (until the board starts the next) or the end of the competition.
 */
export function withUnwatchedJumps(run: CompetitionRun, nextSeed: () => number): CompetitionRun {
  let out = run;
  while (!out.settings.watchCpu && cpuNext(out) && out.roundStarted) {
    const competitor = out.state.competitors[currentJumper(out.state) ?? -1];
    if (competitor?.kind !== "cpu") break;
    out = withScore(out, cpuCompetitionJump(out.hill, competitor.record, nextSeed()).score);
  }
  return out;
}

/** Whether a round has just ended: the board shows its results before the next one starts. */
export function roundJustEnded(run: CompetitionRun): boolean {
  return run.state.finished || !run.roundStarted;
}

/** The run with the next round started, as the board's button starts it, and the log cleared. */
export function withNextRound(run: CompetitionRun): CompetitionRun {
  return { ...run, roundStarted: true, log: [] };
}

/** A new competition on the hill, drawn from `seed`, with the computer jumpers before the first player done. */
export function startRun(
  hill: HillChoice,
  settings: CompetitionSettings,
  seed: number,
  nextSeed: () => number,
): CompetitionRun {
  return withUnwatchedJumps(
    { hill, settings, state: startCompetition(settings, seed), log: [], roundStarted: true },
    nextSeed,
  );
}

/** The run with the log cleared, as the board shows it after its button is pressed. */
export function withoutLog(run: CompetitionRun): CompetitionRun {
  return { ...run, log: [] };
}
