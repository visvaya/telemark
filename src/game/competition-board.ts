import { isOut, standings, tenths, type CompetitionState, type JumpScore } from "./competition";

/** One row of the board: a place once the competitor has jumped, null before and once out of the competition. */
export interface BoardRow {
  competitor: number;
  place: number | null;
  totalPoints: number | null;
  scores: readonly (JumpScore | null)[];
  /** Disqualified under the rule of real competitions: out, with no place and no total. */
  out: boolean;
}

/**
 * Every competitor, as the board lists them: those who have jumped by the classification, the others below in
 * the order of the first round's start list, without a place (as the original's table does), and those out of
 * the competition last, in the same order.
 */
export function boardRows(state: CompetitionState): BoardRow[] {
  const ranked: BoardRow[] = standings(state).map((r) => ({ ...r, out: false }));
  const shown = new Set(ranked.map((r) => r.competitor));
  const unranked = (out: boolean): BoardRow[] =>
    state.startOrder
      .filter((c) => !shown.has(c) && isOut(state, c) === out)
      .map((competitor) => ({
        competitor,
        place: null,
        totalPoints: null,
        scores: state.scores.map((round) => round[competitor] ?? null),
        out,
      }));
  return [...ranked, ...unranked(false), ...unranked(true)];
}

/** A competitor's total so far, in tenths of a point. */
function totalTenthsOf(state: CompetitionState, competitor: number): number {
  return state.scores.reduce((sum, round) => {
    const s = round[competitor] ?? null;
    return sum + (s === null ? 0 : tenths(s.points));
  }, 0);
}

/**
 * The points a competitor needs to equal the leader before a jump: the leader's total less the competitor's own.
 * Nothing when nobody has jumped, when the leader has no points above zero, or when the competitor leads.
 */
export function neededToLead(state: CompetitionState, competitor: number): number | null {
  const leader = standings(state)[0];
  if (leader === undefined) return null;
  const leaderTenths = tenths(leader.totalPoints);
  const needed = leaderTenths - totalTenthsOf(state, competitor);
  return leaderTenths > 0 && needed > 0 ? needed / 10 : null;
}

/**
 * The scoring of a jump turned round, as the original estimates the distance needed: the points of a jump are
 * 60 (120 from K 145) plus the metres past K times a factor per metre, and 57 style points (three notes of 19)
 * are assumed. The hill sizes and factors are the ones of `distancePoints` in the simulation's jump logic.
 */
const NEEDED = {
  stylePoints: 57,
  smallMaxKM: 90,
  bigMinKM: 145,
  basePoints: 60,
  bigBasePoints: 120,
  smallPointsPerM: 2.0,
  mediumPointsPerM: 1.8,
  bigPointsPerM: 1.2,
} as const;

/** The distance a jump needs to score `neededPoints` on a hill with its K point at `kPointM`, in whole metres. */
export function neededDistanceM(neededPoints: number, kPointM: number): number {
  const p = neededPoints - NEEDED.stylePoints;
  const d =
    kPointM <= NEEDED.smallMaxKM
      ? kPointM + (p - NEEDED.basePoints) / NEEDED.smallPointsPerM
      : kPointM < NEEDED.bigMinKM
        ? kPointM + (p - NEEDED.basePoints) / NEEDED.mediumPointsPerM
        : kPointM + (p - NEEDED.bigBasePoints) / NEEDED.bigPointsPerM;
  return Math.floor(Math.max(0, d) + 0.5);
}

/** What the jump view shows of a competition: what leads, the total so far, and what the bar needs after it. */
export interface ContestJumpHud {
  neededPoints: number | null;
  neededDistanceM: number | null;
  /** The competitor's total before this jump. */
  totalBeforePoints: number;
  /** The distance of the competitor's first jump, in the second round; null in the first. */
  firstDistanceM: number | null;
  /** The totals of the others who have jumped, for the place after this jump. */
  otherTotalsPoints: readonly number[];
}

/** The competition values for the jump of `competitor`, on a hill with its K point at `kPointM`. */
export function contestJumpHud(state: CompetitionState, competitor: number, kPointM: number): ContestJumpHud {
  const neededPoints = neededToLead(state, competitor);
  const first = state.round > 1 ? (state.scores[0]?.[competitor] ?? null) : null;
  return {
    neededPoints,
    neededDistanceM: neededPoints === null ? null : neededDistanceM(neededPoints, kPointM),
    totalBeforePoints: totalTenthsOf(state, competitor) / 10,
    firstDistanceM: first === null ? null : first.distanceM,
    otherTotalsPoints: standings(state)
      .filter((r) => r.competitor !== competitor)
      .map((r) => r.totalPoints),
  };
}

/** The competitor's total and place once this jump's points count; equal totals share a place. */
export function resultAfterJump(
  hud: Pick<ContestJumpHud, "totalBeforePoints" | "otherTotalsPoints">,
  points: number,
): { totalPoints: number; place: number } {
  const total = tenths(hud.totalBeforePoints) + tenths(points);
  const ahead = hud.otherTotalsPoints.filter((p) => tenths(p) > total).length;
  return { totalPoints: total / 10, place: ahead + 1 };
}
