import { BorlandRandom } from "../sim/borland-random";
import { drawCpuForm } from "../sim/cpu-pilot";
import {
  competitionReducer,
  drawEntrants,
  openCompetition,
  openDrawnCompetition,
  shuffled,
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
   * The lots drawn with the cup: every entrant index once, the first ranked highest. They order entrants equal on
   * cup points and on every place (FIS World Cup rules, art. 3.1.3: in the end the lot decides).
   */
  lots: readonly number[];
}

export type CupPhase = "competition" | "standings" | "over";

export type CupAction = { type: "scored"; score: JumpScore } | { type: "nextCompetition"; seed: number };

export interface CupStandingRow {
  entrant: number;
  /** 1 for the leader; entrants tied on points share a place until the final standings. */
  place: number;
  totalPoints: number;
  /** The points of the last finished competition; 0 before the first one ends. */
  lastPoints: number;
  /** Competitions won, a shared first place included. */
  wins: number;
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

/**
 * A new cup drawn from `seed`: the computer jumpers' talents once, then the first competition as a single one, then
 * the lots.
 */
export function startCup(settings: CompetitionSettings, schedule: readonly string[], seed: number): CupState {
  const rng = new BorlandRandom(seed);
  const entrants = drawEntrants(settings, rng);
  const competition = openDrawnCompetition(entrants, settings.disqualification, rng);
  return { schedule, index: 0, entrants, competition, points: [], lots: shuffled(entrants.length, rng) };
}

/** The place of each competitor in a competition; null without one. */
function competitionPlaces(competition: CompetitionState): (number | null)[] {
  const place = new Map(standings(competition).map((r) => [r.competitor, r.place]));
  return competition.competitors.map((_c, i) => place.get(i) ?? null);
}

/** Cup points of a finished competition per competitor: by place; nothing without a place. */
export function competitionCupPoints(competition: CompetitionState): number[] {
  return competitionPlaces(competition).map((p) => (p === null ? 0 : (CUP_POINTS[p - 1] ?? 0)));
}

/**
 * The place that scored these cup points; null for none. A cup has at most as many entrants as the table has
 * places, and the table falls with every place, so the points tell the place (shared places share their points).
 */
function placeOfCupPoints(points: number): number | null {
  const at = CUP_POINTS.indexOf(points);
  return points === 0 || at < 0 ? null : at + 1;
}

/** How many times an entrant took each place in the finished competitions: place 1 first, up to the last scoring. */
function placeCounts(state: CupState, entrant: number): number[] {
  const counts = CUP_POINTS.map(() => 0);
  for (const row of state.points) {
    const place = placeOfCupPoints(row[entrant] ?? 0);
    if (place !== null) counts[place - 1] = (counts[place - 1] ?? 0) + 1;
  }
  return counts;
}

/** More wins first, then more second places, and so on; 0 when every count is the same. */
function byPlaces(a: readonly number[], b: readonly number[]): number {
  const at = a.findIndex((count, i) => count !== b[i]);
  return at < 0 ? 0 : (b[at] ?? 0) - (a[at] ?? 0);
}

/** A competition running, the cup standings due before the next one, or the cup over (one hill: after it). */
export function cupPhase(state: CupState): CupPhase {
  if (!state.competition.finished) return "competition";
  return state.index + 1 < state.schedule.length ? "standings" : "over";
}

/**
 * Cup standings: by total points, the higher first. Entrants on the same points are ordered as in the FIS World
 * Cup rules (art. 3.1.3): more wins, then more second places and so on, and in the end the lots. During the cup
 * they share a place, as FIS standings do during a season; the final standings give each a place of their own.
 */
export function cupStandings(state: CupState): CupStandingRow[] {
  const last = state.points.at(-1);
  const lot = new Map(state.lots.map((entrant, rank) => [entrant, rank]));
  const rows = state.entrants
    .map((_e, entrant) => {
      const places = placeCounts(state, entrant);
      return {
        entrant,
        totalPoints: state.points.reduce((sum, competition) => sum + (competition[entrant] ?? 0), 0),
        lastPoints: last?.[entrant] ?? 0,
        wins: places[0] ?? 0,
        places,
      };
    })
    .toSorted(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        byPlaces(a.places, b.places) ||
        (lot.get(a.entrant) ?? a.entrant) - (lot.get(b.entrant) ?? b.entrant),
    );
  const final = cupPhase(state) === "over";
  return rows.map(({ places: _places, ...r }, at) => ({
    ...r,
    place: final ? at + 1 : rows.findIndex((o) => o.totalPoints === r.totalPoints) + 1,
  }));
}

/** Whether any entrants of the standings are on the same points, so the rules for ties ordered them. */
export const tiedOnPoints = (rows: readonly CupStandingRow[]): boolean =>
  rows.some((r, at) => rows[at - 1]?.totalPoints === r.totalPoints);

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
    return { ...state, competition, points: [...state.points, competitionCupPoints(competition)] };
  }
  if (cupPhase(state) !== "standings") return state;
  const entrants = withNewForms(state.entrants, new BorlandRandom(action.seed));
  // The cup leader jumps last, and of tied entrants the one ranked higher, as in FIS start lists.
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
