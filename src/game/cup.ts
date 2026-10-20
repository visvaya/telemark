import { BorlandRandom } from "../sim/borland-random";
import { drawCpuForm } from "../sim/cpu-pilot";
import {
  competitionReducer,
  drawEntrants,
  openCompetition,
  openDrawnCompetition,
  standings,
  type CompetitionSettings,
  type CompetitionState,
  type Competitor,
  type JumpScore,
} from "./competition";

/**
 * A World Cup: a series of competitions on the chosen hills, with cup points per competition and cup standings.
 * The state is plain data (it can be stored as JSON) and changes only through `cupReducer`.
 */

/** Cup points by the place in a competition (place 1 first); places beyond the table score nothing. */
export const CUP_POINTS: readonly number[] = [100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15];

export interface CupState {
  /** Hill ids, one per competition, in the order they run. */
  schedule: readonly string[];
  /** The index in `schedule` of the current competition. */
  index: number;
  /**
   * Everybody in the cup, players first, then computer jumpers; the index is the same in every competition. A
   * computer jumper's talents stay for the whole cup; the form is the one of the current competition.
   */
  entrants: readonly Competitor[];
  competition: CompetitionState;
  /** Cup points of every finished competition, per entrant. */
  points: readonly (readonly number[])[];
  /**
   * The place of every entrant in every finished competition, null without one (out under the "fis" rule, or
   * not known: a cup kept before places were kept).
   */
  places: readonly (readonly (number | null)[])[];
}

export type CupPhase = "competition" | "standings" | "over";

export type CupAction = { type: "scored"; score: JumpScore } | { type: "nextCompetition"; seed: number };

export interface CupStandingRow {
  entrant: number;
  /** 1 for the leader; tied entrants share a place. */
  place: number;
  totalPoints: number;
  /** The points of the last finished competition; 0 before the first one ends. */
  lastPoints: number;
}

/**
 * The competitions of a cup: the chosen hills that are on the list, in the order of the list (the original runs
 * its hills in that order, whatever order they were ticked in); null chooses the first hill of the list, and so does
 * a choice none of whose hills is on the list any more (the original's files went). Only an empty choice (the
 * player cleared it) chooses none. A double cup runs the whole series twice.
 */
export function cupSchedule(
  chosen: readonly string[] | null,
  listIds: readonly string[],
  doubleCup: boolean,
): string[] {
  const found = chosen === null ? [] : listIds.filter((id) => chosen.includes(id));
  const series = found.length === 0 && chosen?.length !== 0 ? listIds.slice(0, 1) : found;
  return doubleCup ? [...series, ...series] : series;
}

/** A new cup drawn from `seed`: the computer jumpers' talents once, then the first competition as a single one. */
export function startCup(settings: CompetitionSettings, schedule: readonly string[], seed: number): CupState {
  const rng = new BorlandRandom(seed);
  const entrants = drawEntrants(settings, rng);
  return {
    schedule,
    index: 0,
    entrants,
    competition: openDrawnCompetition(entrants, settings.disqualification, rng),
    points: [],
    places: [],
  };
}

/** The place of each competitor in a competition; null without one. */
export function competitionPlaces(competition: CompetitionState): (number | null)[] {
  const place = new Map(standings(competition).map((r) => [r.competitor, r.place]));
  return competition.competitors.map((_c, i) => place.get(i) ?? null);
}

/** Cup points of a finished competition per competitor: by place; nothing without a place. */
export function competitionCupPoints(competition: CompetitionState): number[] {
  return competitionPlaces(competition).map((p) => (p === null ? 0 : (CUP_POINTS[p - 1] ?? 0)));
}

/**
 * Each entrant's average place over the finished competitions in which the entrant had a place; null with none.
 */
export function cupAveragePlaces(state: CupState): (number | null)[] {
  return state.entrants.map((_e, entrant) => {
    const own = state.places.flatMap((row) => {
      const p = row[entrant];
      return p === null || p === undefined ? [] : [p];
    });
    return own.length === 0 ? null : own.reduce((sum, p) => sum + p, 0) / own.length;
  });
}

/** A competition running, the cup standings due before the next one, or the cup over (one hill: after it). */
export function cupPhase(state: CupState): CupPhase {
  if (!state.competition.finished) return "competition";
  return state.index + 1 < state.schedule.length ? "standings" : "over";
}

/** Cup standings: by total points, the higher first; ties keep entrant order and share a place. */
export function cupStandings(state: CupState): CupStandingRow[] {
  const last = state.points.at(-1);
  const rows = state.entrants
    .map((_e, entrant) => ({
      entrant,
      totalPoints: state.points.reduce((sum, competition) => sum + (competition[entrant] ?? 0), 0),
      lastPoints: last?.[entrant] ?? 0,
    }))
    .toSorted((a, b) => b.totalPoints - a.totalPoints || a.entrant - b.entrant);
  return rows.map((r) => ({ ...r, place: rows.findIndex((o) => o.totalPoints === r.totalPoints) + 1 }));
}

/** The entrants on place 1 of the cup standings, once a competition has finished; every tied leader. */
export function cupLeaders(state: CupState): number[] {
  if (state.points.length === 0) return [];
  return cupStandings(state)
    .filter((r) => r.place === 1)
    .map((r) => r.entrant);
}

/** New forms for the computer jumpers, in entrant order; talents stay. */
function withNewForms(entrants: readonly Competitor[], rng: BorlandRandom): Competitor[] {
  return entrants.map((e) => (e.kind === "cpu" ? { ...e, record: { ...e.record, ...drawCpuForm(rng) } } : e));
}

/**
 * The cup after an action: a jump scored in the current competition (its cup points recorded when it finishes), or
 * the next competition, with new forms and the start list from the cup standings; the latter only between
 * competitions.
 */
export function cupReducer(state: CupState, action: CupAction): CupState {
  if (action.type === "scored") {
    if (state.competition.finished) return state;
    const competition = competitionReducer(state.competition, action);
    if (!competition.finished) return { ...state, competition };
    return {
      ...state,
      competition,
      points: [...state.points, competitionCupPoints(competition)],
      places: [...state.places, competitionPlaces(competition)],
    };
  }
  if (cupPhase(state) !== "standings") return state;
  const entrants = withNewForms(state.entrants, new BorlandRandom(action.seed));
  // The cup leader jumps last; the original's sort keeps entrant order among ties and reverses the ranking.
  const order = cupStandings(state)
    .map((r) => r.entrant)
    .toReversed();
  return {
    ...state,
    index: state.index + 1,
    entrants,
    competition: openCompetition(entrants, order, state.competition.disqualification),
  };
}
