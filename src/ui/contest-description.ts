import type { SavedContest } from "../game/contest-save";
import { originalHillNumber, type HillChoice } from "../game/hill-choice";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.competition;

/** The hill ids of the kept competition that this device does not have, each once, in schedule order. */
export function missingHillIds(contest: SavedContest, hills: readonly HillChoice[]): string[] {
  const known = new Set(hills.map((h) => h.id));
  return [...new Set(contest.cup.schedule.filter((id) => !known.has(id)))];
}

/** Hills told without their names: those of the original by number, any other by its id. */
function unnamedHills(ids: readonly string[]): string {
  const numbers = ids.flatMap((id) => {
    const n = originalHillNumber(id);
    return n === null ? [] : [n];
  });
  const others = ids.filter((id) => originalHillNumber(id) === null);
  return [...(numbers.length > 0 ? [T.originalHillsByNumber(numbers)] : []), ...others].join(", ");
}

/** Why the kept competition cannot go on here: the hills it lacks; null when it can. */
export function missingHillsMessage(contest: SavedContest, hills: readonly HillChoice[]): string | null {
  const missing = missingHillIds(contest, hills);
  return missing.length === 0 ? null : T.missingHills(unnamedHills(missing));
}

/** One line that tells the kept competition: the cup and which competition, or the hill; and the round. */
export function contestDescription(contest: SavedContest, hills: readonly HillChoice[]): string {
  const { cup, place } = contest;
  const total = cup.schedule.length;
  const state = cup.competition;
  const round = state.finished ? T.keptFinal : T.round(state.round);
  if (total > 1) {
    if (place === "end") return T.keptLine([T.cupTitle, T.keptOver]);
    if (place === "standings") return T.keptLine([T.cupTitle, T.keptStandings(cup.points.length, total)]);
    return T.keptLine([T.cupTitle, T.keptCompetition(cup.index + 1, total), round]);
  }
  const id = cup.schedule[cup.index] ?? "";
  const hill = hills.find((h) => h.id === id);
  return T.keptLine([hill ? UI_TEXT.hillLabel(hill.name, hill.kPointM) : unnamedHills([id]), round]);
}
