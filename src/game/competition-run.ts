import { currentJumper, placeOf, type CompetitionSettings, type CompetitionState, type JumpScore } from "./competition";
import { cpuCompetitionJump } from "./competition-jump";
import { cupReducer, startCup, type CupState } from "./cup";
import type { HillChoice } from "./hill-choice";

/** A jump as the board between jumps tells it: who, the score, and the place after it. */
interface LoggedJump {
  competitor: number;
  round: number;
  score: JumpScore;
  place: number;
}

/**
 * The competitions being run: a single one, or a world cup of several. Its hills (one per competition), settings,
 * the cup's state with the current competition in it, and the jumps since the board was last shown.
 */
export interface CompetitionRun {
  /** The hill of each competition, in the order they run. */
  hills: readonly HillChoice[];
  /** The hill of the current competition. */
  hill: HillChoice;
  settings: CompetitionSettings;
  cup: CupState;
  log: readonly LoggedJump[];
  /** False from the end of a round until the board starts the next one. */
  roundStarted: boolean;
}

/** The current competition of the run. */
export const competitionOf = (run: CompetitionRun): CompetitionState => run.cup.competition;

/** Whether the run is a world cup: more than one competition. */
export const isCup = (run: CompetitionRun): boolean => run.cup.schedule.length > 1;

/** The run after the jump of the current jumper scored `score`, with the jump in the log. */
export function withScore(run: CompetitionRun, score: JumpScore): CompetitionRun {
  const before = competitionOf(run);
  const competitor = currentJumper(before);
  if (competitor === null) return run;
  const cup = cupReducer(run.cup, { type: "scored", score });
  const state = cup.competition;
  const place = placeOf(state, competitor) ?? 0;
  const log = [...run.log, { competitor, round: before.round, score, place }];
  return { ...run, cup, log, roundStarted: state.round === before.round };
}

/** Whether the next jumper is a computer jumper. */
export function cpuNext(run: CompetitionRun): boolean {
  const state = competitionOf(run);
  const next = currentJumper(state);
  return next !== null && state.competitors[next]?.kind === "cpu";
}

/**
 * The run after the computer jumpers who are next and are not watched have jumped, each from a seed of
 * `nextSeed`; computed without drawing, as the original does. Stops at a player, a watched computer jumper,
 * the end of a round (until the board starts the next) or the end of the competition.
 */
export function withUnwatchedJumps(run: CompetitionRun, nextSeed: () => number): CompetitionRun {
  let out = run;
  while (!out.settings.watchCpu && cpuNext(out) && out.roundStarted) {
    const state = competitionOf(out);
    const competitor = state.competitors[currentJumper(state) ?? -1];
    if (competitor?.kind !== "cpu") break;
    out = withScore(out, cpuCompetitionJump(out.hill, competitor.record, nextSeed(), out.settings.rivalLanding).score);
  }
  return out;
}

/** Whether a round has just ended: the board shows its results before the next one starts. */
export function roundJustEnded(run: CompetitionRun): boolean {
  return competitionOf(run).finished || !run.roundStarted;
}

/** The run with the next round started, as the board's button starts it, and the log cleared. */
export function withNextRound(run: CompetitionRun): CompetitionRun {
  return { ...run, roundStarted: true, log: [] };
}

/**
 * New competitions on the hills, one per hill in this order, drawn from `seed`, with the computer jumpers before
 * the first player done. Null without a hill.
 */
export function startRun(
  hills: readonly HillChoice[],
  settings: CompetitionSettings,
  seed: number,
  nextSeed: () => number,
): CompetitionRun | null {
  const hill = hills[0];
  if (hill === undefined) return null;
  const cup = startCup(
    settings,
    hills.map((h) => h.id),
    seed,
  );
  return withUnwatchedJumps({ hills, hill, settings, cup, log: [], roundStarted: true }, nextSeed);
}

/**
 * The run with the next competition of the cup opened from `seed` (new forms, the start list from the cup
 * standings) and the computer jumpers before the first player done; the run as it is when no competition is due.
 */
export function withNextCompetition(run: CompetitionRun, seed: number, nextSeed: () => number): CompetitionRun {
  const cup = cupReducer(run.cup, { type: "nextCompetition", seed });
  const hill = run.hills[cup.index];
  if (cup === run.cup || hill === undefined) return run;
  return withUnwatchedJumps({ ...run, hill, cup, log: [], roundStarted: true }, nextSeed);
}

/** The run with the log cleared, as the board shows it after its button is pressed. */
export function withoutLog(run: CompetitionRun): CompetitionRun {
  return { ...run, log: [] };
}
