import {
  CPU_LEVEL_SETTINGS,
  DISQUALIFICATION_RULES,
  secondRoundOrder,
  type CompetitionSettings,
  type CompetitionState,
  type Competitor,
  type DisqualificationRule,
  type JumpScore,
} from "./competition";
import type { CompetitionRun } from "./competition-run";
import { competitionCupPoints, cupPhase, type CupState } from "./cup";
import type { HillChoice } from "./hill-choice";

/**
 * A competition kept between visits: everything needed to go on where the player was between two jumps. A jump in
 * progress is not kept: it is jumped again. The same data goes into the game's save and into a competition file,
 * and both are read back through `parseSavedContest` alone, as neither can be trusted.
 */

/** Where the player was: the board of the current competition, the cup standings, or the end of the cup. */
const CONTEST_PLACES = ["board", "standings", "end"] as const;
export type ContestPlace = (typeof CONTEST_PLACES)[number];

export interface SavedContest {
  /** The settings the competition started with; later changes in the setup do not touch it. */
  settings: CompetitionSettings;
  /** The cup, with the hill id of every competition in order (`schedule`) and the current competition in it. */
  cup: CupState;
  roundStarted: boolean;
  place: ContestPlace;
}

/** Bounds of what a saved competition may hold; beyond them it is refused. */
const CONTEST_LIMITS = {
  SLOT_COUNT: 8,
  MAX_COMPETITORS: 16,
  MAX_COMPETITIONS: 74,
  MAX_HILL_ID_CHARS: 64,
  MAX_CHOSEN_HILLS: 64,
  /** CPU forms and talents are a few units either way; anything far beyond is not one the game drew. */
  MAX_CPU_TRAIT: 100,
  MAX_CPU_LEVEL: 4,
  MAX_DISTANCE_M: 1000,
  MAX_ABS_POINTS: 1000,
  ROUND_COUNT: 2,
} as const;
const L = CONTEST_LIMITS;

const fieldOf = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? Reflect.get(v, key) : undefined;

const isWhole = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

const isFiniteWithin = (v: unknown, limit: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

const isHillId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= L.MAX_HILL_ID_CHARS;

/** Each item read by `read`, or null when the value is not an array of `min` to `max` readable items. */
function listOf<T>(v: unknown, min: number, max: number, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length < min || v.length > max) return null;
  const out: T[] = [];
  for (const item of v as unknown[]) {
    const read1 = read(item);
    if (read1 === null) return null;
    out.push(read1);
  }
  return out;
}

const booleanOf = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function settingsOf(v: unknown): CompetitionSettings | null {
  const rawHillIds = fieldOf(v, "hillIds");
  const hillIds =
    rawHillIds === null ? null : listOf(rawHillIds, 0, L.MAX_CHOSEN_HILLS, (id) => (isHillId(id) ? id : null));
  if (rawHillIds !== null && hillIds === null) return null;
  const players = listOf(fieldOf(v, "players"), L.SLOT_COUNT, L.SLOT_COUNT, booleanOf);
  const cpus = listOf(fieldOf(v, "cpus"), L.SLOT_COUNT, L.SLOT_COUNT, (slot) => {
    const on = fieldOf(slot, "on");
    const level = CPU_LEVEL_SETTINGS.find((l) => l === fieldOf(slot, "level"));
    return typeof on === "boolean" && level !== undefined ? { on, level } : null;
  });
  const doubleCup = fieldOf(v, "doubleCup");
  const watchCpu = fieldOf(v, "watchCpu");
  const disqualification = DISQUALIFICATION_RULES.find((r) => r === fieldOf(v, "disqualification"));
  if (players === null || cpus === null || disqualification === undefined) return null;
  if (typeof doubleCup !== "boolean" || typeof watchCpu !== "boolean") return null;
  return { hillIds, doubleCup, players, cpus, watchCpu, disqualification };
}

function competitorOf(v: unknown): Competitor | null {
  const kind = fieldOf(v, "kind");
  const slot = fieldOf(v, "slot");
  if (!isWhole(slot, 0, L.SLOT_COUNT - 1)) return null;
  if (kind === "player") return { kind, slot };
  if (kind !== "cpu") return null;
  const r = fieldOf(v, "record");
  const form1 = fieldOf(r, "form1");
  const form2 = fieldOf(r, "form2");
  const talent1 = fieldOf(r, "talent1");
  const talent2 = fieldOf(r, "talent2");
  const level = fieldOf(r, "level");
  const trait = (t: unknown): t is number => isFiniteWithin(t, L.MAX_CPU_TRAIT);
  if (!trait(form1) || !trait(form2) || !trait(talent1) || !trait(talent2)) return null;
  if (!isWhole(level, 0, L.MAX_CPU_LEVEL)) return null;
  return { kind, slot, record: { form1, form2, talent1, talent2, level } };
}

/** The entrants agree with the settings: the players and the computer jumpers switched on, in slot order. */
function entrantsMatch(entrants: readonly Competitor[], settings: CompetitionSettings): boolean {
  const players = settings.players.flatMap((on, slot) => (on ? [slot] : []));
  const cpus = settings.cpus.flatMap((cpu, slot) => (cpu.on ? [{ slot, level: cpu.level }] : []));
  if (entrants.length !== players.length + cpus.length) return false;
  return entrants.every((e, i) => {
    if (i < players.length) return e.kind === "player" && e.slot === players[i];
    const cpu = cpus[i - players.length];
    if (e.kind !== "cpu" || cpu === undefined || e.slot !== cpu.slot) return false;
    // A level of the setting stays; the random setting draws one.
    return cpu.level > L.MAX_CPU_LEVEL || e.record.level === cpu.level;
  });
}

function scoreOf(v: unknown): JumpScore | null {
  const distanceM = fieldOf(v, "distanceM");
  const points = fieldOf(v, "points");
  const fell = fieldOf(v, "fell");
  if (!isFiniteWithin(distanceM, L.MAX_DISTANCE_M) || distanceM < 0 || !Number.isInteger(distanceM * 2)) return null;
  if (!isFiniteWithin(points, L.MAX_ABS_POINTS) || typeof fell !== "boolean") return null;
  return { distanceM, points, fell };
}

/** Distinct indexes of competitors, `min` to `count` of them. */
function indexesOf(v: unknown, count: number, min: number): number[] | null {
  const list = listOf(v, min, count, (i) => (isWhole(i, 0, count - 1) ? i : null));
  return list !== null && new Set(list).size === list.length ? list : null;
}

const sameList = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** The scores of a round: a jump exactly for those who jumped, by the state. */
const jumpsAre = (round: readonly (JumpScore | null)[], jumped: ReadonlySet<number>): boolean =>
  round.every((s, c) => (s !== null) === jumped.has(c));

function competitionOf(
  v: unknown,
  entrants: readonly Competitor[],
  rule: DisqualificationRule,
): CompetitionState | null {
  const n = entrants.length;
  const competitors = listOf(fieldOf(v, "competitors"), n, n, competitorOf);
  if (competitors === null || JSON.stringify(competitors) !== JSON.stringify(entrants)) return null;
  const round = fieldOf(v, "round");
  const finished = fieldOf(v, "finished");
  const disqualification = fieldOf(v, "disqualification");
  if (!isWhole(round, 1, L.ROUND_COUNT) || typeof finished !== "boolean" || disqualification !== rule) return null;
  const startOrder = indexesOf(fieldOf(v, "startOrder"), n, n);
  const order = indexesOf(fieldOf(v, "order"), n, round === 1 ? n : 1);
  const position = fieldOf(v, "position");
  if (startOrder === null || order === null || !isWhole(position, 0, order.length)) return null;
  if (finished !== (position === order.length)) return null;
  const scores = listOf(fieldOf(v, "scores"), L.ROUND_COUNT, L.ROUND_COUNT, (r) =>
    listOf(r, n, n, (s) => (s === null ? false : scoreOf(s))),
  )?.map((r) => r.map((s) => (s === false ? null : s)));
  // A jump not made yet is null; `false` only stands for it while the list is read, as null means unreadable there.
  if (scores === undefined) return null;
  const state: CompetitionState = {
    competitors,
    round,
    order,
    position,
    scores,
    startOrder,
    disqualification: rule,
    finished,
  };
  const [first, second] = scores;
  if (first === undefined || second === undefined) return null;
  const done = new Set(order.slice(0, position));
  if (round === 1) {
    if (!sameList(order, startOrder) || !jumpsAre(first, done) || !jumpsAre(second, new Set())) return null;
    // A first round ends the competition only when nobody is left for the second.
    return finished && secondRoundOrder(state).length > 0 ? null : state;
  }
  if (!jumpsAre(first, new Set(startOrder)) || !jumpsAre(second, done)) return null;
  const firstRound = { ...state, round: 1, scores: [first, second.map(() => null)] };
  return sameList(order, secondRoundOrder(firstRound)) ? state : null;
}

function cupOf(v: unknown, settings: CompetitionSettings): CupState | null {
  const schedule = listOf(fieldOf(v, "schedule"), 1, L.MAX_COMPETITIONS, (id) => (isHillId(id) ? id : null));
  if (schedule === null) return null;
  const index = fieldOf(v, "index");
  if (!isWhole(index, 0, schedule.length - 1)) return null;
  const entrants = listOf(fieldOf(v, "entrants"), 1, L.MAX_COMPETITORS, competitorOf);
  if (entrants === null || !entrantsMatch(entrants, settings)) return null;
  const competition = competitionOf(fieldOf(v, "competition"), entrants, settings.disqualification);
  if (competition === null) return null;
  const finishedCount = index + (competition.finished ? 1 : 0);
  const n = entrants.length;
  const points = listOf(fieldOf(v, "points"), finishedCount, finishedCount, (row) =>
    listOf(row, n, n, (p) => (isWhole(p, 0, L.MAX_ABS_POINTS) ? p : null)),
  );
  if (points === null) return null;
  const last = points.at(-1);
  if (competition.finished && (last === undefined || !sameList(last, competitionCupPoints(competition)))) return null;
  return { schedule, index, entrants, competition, points };
}

/** A saved competition, or null for anything that is not a consistent one. Never throws; extra fields are ignored. */
export function parseSavedContest(v: unknown): SavedContest | null {
  try {
    const settings = settingsOf(fieldOf(v, "settings"));
    if (settings === null) return null;
    const cup = cupOf(fieldOf(v, "cup"), settings);
    const roundStarted = fieldOf(v, "roundStarted");
    const place = CONTEST_PLACES.find((p) => p === fieldOf(v, "place"));
    if (cup === null || typeof roundStarted !== "boolean" || place === undefined) return null;
    const state = cup.competition;
    // Between rounds: the second round is due and nobody has jumped in it.
    if (!roundStarted && (state.round !== 2 || state.position !== 0 || state.finished)) return null;
    const phase = cupPhase(cup);
    if (place === "standings" && phase !== "standings") return null;
    if (place === "end" && (phase !== "over" || cup.schedule.length < 2)) return null;
    return { settings, cup, roundStarted, place };
  } catch {
    return null;
  }
}

/** What is kept of a run, with where the player is: never the jump in progress, nor the board's log. */
export const keptOf = (run: CompetitionRun, place: ContestPlace): SavedContest => ({
  settings: run.settings,
  cup: run.cup,
  roundStarted: run.roundStarted,
  place,
});

/** A kept competition as a run, on these hills (one per competition, as its schedule); null without one of them. */
export function runOfKept(contest: SavedContest, hills: readonly HillChoice[]): CompetitionRun | null {
  const scheduled = contest.cup.schedule.map((id) => hills.find((h) => h.id === id));
  const known = scheduled.filter((h): h is HillChoice => h !== undefined);
  const hill = known[contest.cup.index];
  if (known.length !== scheduled.length || hill === undefined) return null;
  return {
    hills: known,
    hill,
    settings: contest.settings,
    cup: contest.cup,
    log: [],
    roundStarted: contest.roundStarted,
  };
}
