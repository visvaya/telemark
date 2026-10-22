import { BorlandRandom } from "../sim/borland-random";
import { CPU_LEVEL_COUNT, drawCpuForm, drawCpuTalents, type CpuJumperRecord } from "../sim/cpu-pilot";
import { RIVAL_LANDINGS, type RivalLanding } from "./rival-landing";

/**
 * A single competition: two rounds on one hill, players and computer jumpers. The state changes only through
 * `competitionReducer`; everything here is a pure function of its arguments.
 */

/** Places for players and for computer jumpers, as in the original. */
const COMPETITION_SLOT_COUNT = 8;
/** The level setting that draws a level for each competition (the original's "random"). */
const CPU_LEVEL_RANDOM = CPU_LEVEL_COUNT;
/** Level settings in the order the setup offers them: weakest, weak, average, good, super, random. */
export const CPU_LEVEL_SETTINGS = [0, 1, 2, 3, 4, CPU_LEVEL_RANDOM] as const;
export type CpuLevelSetting = (typeof CPU_LEVEL_SETTINGS)[number];
const ROUND_COUNT = 2;

/**
 * What a disqualified jump costs. "original": as in DSJ2, the jump scores its penalty points (60 less the K point
 * times the points per metre), counted in the total, and the jumper stays in the competition. "fis": as in real
 * competitions, no points and out of the competition (no second round, no place).
 */
export const DISQUALIFICATION_RULES = ["original", "fis"] as const;
export type DisqualificationRule = (typeof DISQUALIFICATION_RULES)[number];

interface CpuSlotSetting {
  on: boolean;
  level: CpuLevelSetting;
}

export interface CompetitionSettings {
  /**
   * The chosen hills, by HillChoice.id: one for a single competition, more for a cup. Null means never chosen (the
   * first hill on the list); a hill no longer on the list is left out.
   */
  hillIds: readonly string[] | null;
  /** The original's "double cup": the series of chosen hills runs twice. */
  doubleCup: boolean;
  /** Whether each of the players "Gracz 1" to "Gracz 8" takes part. */
  players: readonly boolean[];
  cpus: readonly CpuSlotSetting[];
  /** Whether the computer jumpers' jumps are shown (the original's "watch the opponents' jumps"). */
  watchCpu: boolean;
  disqualification: DisqualificationRule;
  /** How the computer jumpers land: the original's pilot, or the same pilot landing later. */
  rivalLanding: RivalLanding;
}

const DEFAULT_CPU_LEVELS: readonly CpuLevelSetting[] = [2, 3, 1, 4, 2, 2, 2, 2];

export const DEFAULT_COMPETITION_SETTINGS: CompetitionSettings = {
  hillIds: null,
  doubleCup: false,
  players: Array.from({ length: COMPETITION_SLOT_COUNT }, (_v, i) => i === 0),
  cpus: DEFAULT_CPU_LEVELS.map((level, i) => ({ on: i < 4, level })),
  watchCpu: false,
  disqualification: "original",
  rivalLanding: "original",
};

const fieldOf = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null ? Reflect.get(v, key) : undefined;

/** Bounds of the stored hill choice, so a hostile save cannot make it large. */
const MAX_CHOSEN_HILL_COUNT = 64;
const MAX_HILL_ID_CHARS = 64;

const isHillId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_HILL_ID_CHARS;

/** The chosen hills: a list of ids (unique, bounded), an older single `hillId`, or null when neither is readable. */
function parseHillIds(hillIds: unknown, hillId: unknown): string[] | null {
  if (Array.isArray(hillIds)) {
    const unique = new Set<string>();
    for (const id of hillIds as unknown[]) {
      if (unique.size >= MAX_CHOSEN_HILL_COUNT) break;
      if (isHillId(id)) unique.add(id);
    }
    return [...unique];
  }
  if (hillIds === undefined && isHillId(hillId)) return [hillId];
  return null;
}

const levelOf = (v: unknown): CpuLevelSetting | undefined => CPU_LEVEL_SETTINGS.find((level) => level === v);

/** Reads stored competition settings; whatever is missing or unreadable takes its default. */
export function parseCompetitionSettings(v: unknown): CompetitionSettings {
  const D = DEFAULT_COMPETITION_SETTINGS;
  const doubleCup = fieldOf(v, "doubleCup");
  const players = fieldOf(v, "players");
  const cpus = fieldOf(v, "cpus");
  const watchCpu = fieldOf(v, "watchCpu");
  const disqualification = DISQUALIFICATION_RULES.find((rule) => rule === fieldOf(v, "disqualification"));
  const rivalLanding = RIVAL_LANDINGS.find((landing) => landing === fieldOf(v, "rivalLanding"));
  const parsed: CompetitionSettings = {
    hillIds: parseHillIds(fieldOf(v, "hillIds"), fieldOf(v, "hillId")),
    doubleCup: typeof doubleCup === "boolean" ? doubleCup : D.doubleCup,
    players: D.players.map((dflt, i) => {
      const on = Array.isArray(players) ? (players[i] as unknown) : undefined;
      return typeof on === "boolean" ? on : dflt;
    }),
    cpus: D.cpus.map((dflt, i) => {
      const slot: unknown = Array.isArray(cpus) ? cpus[i] : undefined;
      const on = fieldOf(slot, "on");
      return { on: typeof on === "boolean" ? on : dflt.on, level: levelOf(fieldOf(slot, "level")) ?? dflt.level };
    }),
    watchCpu: typeof watchCpu === "boolean" ? watchCpu : D.watchCpu,
    disqualification: disqualification ?? D.disqualification,
    rivalLanding: rivalLanding ?? D.rivalLanding,
  };
  return participantCount(parsed) > 0 ? parsed : { ...parsed, players: D.players };
}

export function participantCount(s: CompetitionSettings): number {
  return s.players.filter(Boolean).length + s.cpus.filter((c) => c.on).length;
}

export type Competitor = { kind: "player"; slot: number } | { kind: "cpu"; slot: number; record: CpuJumperRecord };

export interface JumpScore {
  /** In the half metres the jump is scored in, as the simulation's `distanceHalfM` and the original's tables. */
  distanceM: number;
  points: number;
  fell: boolean;
}

export interface CompetitionState {
  competitors: readonly Competitor[];
  /** 1 or 2. */
  round: number;
  /** Who jumps in this round, in order, as indexes into `competitors`. */
  order: readonly number[];
  /** The place in `order` of the next jumper; `order.length` once the round is over. */
  position: number;
  /** The scores per round, per competitor; null for a jump not made yet. */
  scores: readonly (readonly (JumpScore | null)[])[];
  /** The order of the first round, which also settles the order of tied competitors. */
  startOrder: readonly number[];
  disqualification: DisqualificationRule;
  finished: boolean;
}

/** A jump with no distance: the jumper did not leave the gate in time or landed before the takeoff. */
export const isDisqualified = (s: JumpScore): boolean => s.distanceM === 0;

/** Whether a competitor is out of the competition: disqualified under the rule of real competitions. */
export function isOut(state: CompetitionState, competitor: number): boolean {
  if (state.disqualification !== "fis") return false;
  return state.scores.some((round) => {
    const s = round[competitor] ?? null;
    return s !== null && isDisqualified(s);
  });
}

/** Fisher-Yates over 0..count-1 with the original's generator. */
export function shuffled(count: number, rng: BorlandRandom): number[] {
  const out = Array.from({ length: count }, (_v, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = rng.below(i + 1);
    const a = out[i] ?? 0;
    out[i] = out[j] ?? 0;
    out[j] = a;
  }
  return out;
}

/**
 * The entrants of a competition or a cup, drawn from `rng`: players first, then the computer jumpers with their
 * talents (as at the start of a cup in the original), then their forms (as at the start of a competition).
 */
export function drawEntrants(settings: CompetitionSettings, rng: BorlandRandom): Competitor[] {
  const players: Competitor[] = [];
  settings.players.forEach((on, slot) => {
    if (on) players.push({ kind: "player", slot });
  });
  const talents = settings.cpus.flatMap((cpu, slot) =>
    cpu.on ? [{ slot, talents: drawCpuTalents(cpu.level, rng) }] : [],
  );
  const cpus: Competitor[] = talents.map(({ slot, talents: t }) => ({
    kind: "cpu",
    slot,
    record: { ...drawCpuForm(rng), ...t },
  }));
  return [...players, ...cpus];
}

/** A competition of these competitors, whose first round runs in `order` (indexes into `competitors`). */
export function openCompetition(
  competitors: readonly Competitor[],
  order: readonly number[],
  disqualification: DisqualificationRule,
): CompetitionState {
  const noScores = competitors.map(() => null);
  return {
    competitors,
    round: 1,
    order,
    position: 0,
    scores: Array.from({ length: ROUND_COUNT }, () => noScores),
    startOrder: order,
    disqualification,
    finished: competitors.length === 0,
  };
}

/** A competition of these competitors with a start list drawn from `rng`. */
export function openDrawnCompetition(
  competitors: readonly Competitor[],
  disqualification: DisqualificationRule,
  rng: BorlandRandom,
): CompetitionState {
  return openCompetition(competitors, shuffled(competitors.length, rng), disqualification);
}

/** A new competition from the settings, drawn from `seed`: the entrants, then the start list of the first round. */
export function startCompetition(settings: CompetitionSettings, seed: number): CompetitionState {
  const rng = new BorlandRandom(seed);
  return openDrawnCompetition(drawEntrants(settings, rng), settings.disqualification, rng);
}

/** The index of the competitor who jumps next; null once the competition is over. */
export function currentJumper(state: CompetitionState): number | null {
  return state.finished ? null : (state.order[state.position] ?? null);
}

/** Total points kept to a tenth, so sums of the simulation's single-precision points compare as shown. */
export const tenths = (points: number): number => Math.round(points * 10);

/** A distance cut to the half metres it is scored in, the way the simulation turns `distanceM` into `distanceHalfM`. */
const halfMetres = (distanceM: number): number => Math.trunc(distanceM * 2) / 2;

export interface StandingRow {
  competitor: number;
  /** 1 for the leader; tied competitors share a place. */
  place: number;
  totalPoints: number;
  scores: readonly (JumpScore | null)[];
}

/**
 * The classification after the jumps made so far: by total points, the higher first; competitors on the same
 * points share a place and keep the order of the first round's start list. Only competitors with a jump appear,
 * and none who is out of the competition.
 */
export function standings(state: CompetitionState): StandingRow[] {
  const startRank = new Map(state.startOrder.map((c, i) => [c, i]));
  const rows = state.competitors
    .map((_c, competitor) => {
      const scores = state.scores.map((round) => round[competitor] ?? null);
      const total = scores.reduce((sum, s) => sum + (s === null ? 0 : tenths(s.points)), 0);
      return { competitor, scores, total, jumped: scores.some((s) => s !== null) };
    })
    .filter((r) => r.jumped && !isOut(state, r.competitor))
    .toSorted((a, b) => b.total - a.total || (startRank.get(a.competitor) ?? 0) - (startRank.get(b.competitor) ?? 0));
  return rows.map((r) => ({
    competitor: r.competitor,
    place: rows.findIndex((o) => o.total === r.total) + 1,
    totalPoints: r.total / 10,
    scores: r.scores,
  }));
}

/** The start list of the second round: the classification after the first, from the last to the leader. */
export function secondRoundOrder(state: CompetitionState): number[] {
  return standings(state)
    .map((r) => r.competitor)
    .toReversed();
}

export type CompetitionAction = { type: "scored"; score: JumpScore };

/** The competition after an action: a jump scored moves on to the next jumper, the next round, or the end. */
export function competitionReducer(state: CompetitionState, action: CompetitionAction): CompetitionState {
  const jumper = currentJumper(state);
  if (jumper === null) return state;
  const roundIndex = state.round - 1;
  const score = { ...action.score, distanceM: halfMetres(action.score.distanceM) };
  const scores = state.scores.map((round, i) =>
    i === roundIndex ? round.map((s, c) => (c === jumper ? score : s)) : round,
  );
  const next = { ...state, scores, position: state.position + 1 };
  if (next.position < next.order.length) return next;
  if (state.round < ROUND_COUNT) {
    const order = secondRoundOrder(next);
    // Everybody out of the competition: nobody is left for the second round.
    if (order.length === 0) return { ...next, finished: true };
    return { ...next, round: state.round + 1, order, position: 0 };
  }
  return { ...next, finished: true };
}

/** The place of a competitor in the classification so far; null before their first jump. */
export function placeOf(state: CompetitionState, competitor: number): number | null {
  return standings(state).find((r) => r.competitor === competitor)?.place ?? null;
}
