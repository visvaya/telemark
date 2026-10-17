import { BorlandRandom } from "../sim/borland-random";
import { CPU_LEVEL_COUNT, drawCpuForm, drawCpuTalents, type CpuJumperRecord } from "../sim/cpu-pilot";

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

interface CpuSlotSetting {
  on: boolean;
  level: CpuLevelSetting;
}

export interface CompetitionSettings {
  /** The hill, by HillChoice.id; null (or a hill no longer there) means the first on the list. */
  hillId: string | null;
  /** Whether each of the players "Gracz 1" to "Gracz 8" takes part. */
  players: readonly boolean[];
  cpus: readonly CpuSlotSetting[];
  /** Whether the computer jumpers' jumps are shown (the original's "watch the opponents' jumps"). */
  watchCpu: boolean;
}

const DEFAULT_CPU_LEVELS: readonly CpuLevelSetting[] = [2, 3, 1, 4, 2, 2, 2, 2];

export const DEFAULT_COMPETITION_SETTINGS: CompetitionSettings = {
  hillId: null,
  players: Array.from({ length: COMPETITION_SLOT_COUNT }, (_v, i) => i === 0),
  cpus: DEFAULT_CPU_LEVELS.map((level, i) => ({ on: i < 4, level })),
  watchCpu: false,
};

const fieldOf = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null ? Reflect.get(v, key) : undefined;

const levelOf = (v: unknown): CpuLevelSetting | undefined => CPU_LEVEL_SETTINGS.find((level) => level === v);

/** Reads stored competition settings; whatever is missing or unreadable takes its default. */
export function parseCompetitionSettings(v: unknown): CompetitionSettings {
  const D = DEFAULT_COMPETITION_SETTINGS;
  const hillId = fieldOf(v, "hillId");
  const players = fieldOf(v, "players");
  const cpus = fieldOf(v, "cpus");
  const watchCpu = fieldOf(v, "watchCpu");
  const parsed: CompetitionSettings = {
    hillId: typeof hillId === "string" ? hillId : null,
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
  };
  return participantCount(parsed) > 0 ? parsed : { ...parsed, players: D.players };
}

export function participantCount(s: CompetitionSettings): number {
  return s.players.filter(Boolean).length + s.cpus.filter((c) => c.on).length;
}

export type Competitor = { kind: "player"; slot: number } | { kind: "cpu"; slot: number; record: CpuJumperRecord };

export interface JumpScore {
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
  finished: boolean;
}

/** Fisher-Yates over 0..count-1 with the original's generator. */
function shuffled(count: number, rng: BorlandRandom): number[] {
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
 * A new competition from the settings, drawn from `seed`: the computer jumpers' talents (as at the start of a cup
 * in the original), then their forms (as at the start of a competition), then the start list of the first round.
 */
export function startCompetition(settings: CompetitionSettings, seed: number): CompetitionState {
  const rng = new BorlandRandom(seed);
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
  const competitors = [...players, ...cpus];
  const order = shuffled(competitors.length, rng);
  const noScores = competitors.map(() => null);
  return {
    competitors,
    round: 1,
    order,
    position: 0,
    scores: Array.from({ length: ROUND_COUNT }, () => noScores),
    startOrder: order,
    finished: competitors.length === 0,
  };
}

/** The index of the competitor who jumps next; null once the competition is over. */
export function currentJumper(state: CompetitionState): number | null {
  return state.finished ? null : (state.order[state.position] ?? null);
}

/** Total points kept to a tenth, so sums of the simulation's single-precision points compare as shown. */
const tenths = (points: number): number => Math.round(points * 10);

export interface StandingRow {
  competitor: number;
  /** 1 for the leader; tied competitors share a place. */
  place: number;
  totalPoints: number;
  scores: readonly (JumpScore | null)[];
}

/**
 * The classification after the jumps made so far: by total points, the higher first; competitors on the same
 * points share a place and keep the order of the first round's start list. Only competitors with a jump appear.
 */
export function standings(state: CompetitionState): StandingRow[] {
  const startRank = new Map(state.startOrder.map((c, i) => [c, i]));
  const rows = state.competitors
    .map((_c, competitor) => {
      const scores = state.scores.map((round) => round[competitor] ?? null);
      const total = scores.reduce((sum, s) => sum + (s === null ? 0 : tenths(s.points)), 0);
      return { competitor, scores, total, jumped: scores.some((s) => s !== null) };
    })
    .filter((r) => r.jumped)
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
  const scores = state.scores.map((round, i) =>
    i === roundIndex ? round.map((s, c) => (c === jumper ? action.score : s)) : round,
  );
  const next = { ...state, scores, position: state.position + 1 };
  if (next.position < next.order.length) return next;
  if (state.round < ROUND_COUNT) {
    return { ...next, round: state.round + 1, order: secondRoundOrder(next), position: 0 };
  }
  return { ...next, finished: true };
}

/** The place of a competitor in the classification so far; null before their first jump. */
export function placeOf(state: CompetitionState, competitor: number): number | null {
  return standings(state).find((r) => r.competitor === competitor)?.place ?? null;
}
