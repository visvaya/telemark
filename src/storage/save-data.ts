import { DEFAULT_COMPETITION_SETTINGS, parseCompetitionSettings, type CompetitionSettings } from "../game/competition";
import { DEFAULT_OUTFIT, parseOutfit, type Outfit } from "../game/outfit";
import { DEFAULT_SENSITIVITY, parseSensitivity, type Sensitivity } from "../game/sensitivity";

/** Persistent data of the game, versioned so older saves can be migrated. */
const SAVE_SCHEMA_VERSION = 2;

export interface HillRecord {
  distanceM: number;
  points: number;
  /** ISO 8601 time of the jump. */
  dateIso: string;
}

type LeanControl = "drag" | "tilt";
/** Time of day of the hills: chosen at random per visit, or a fixed one. */
export type SceneryChoice = "varied" | "day" | "dusk" | "night";
/** Weather on the hills: chosen at random per visit, or a fixed one. */
export type WeatherChoice = "varied" | "clear" | "snow" | "fog" | "snowFog";
const WEATHER_CHOICES: readonly WeatherChoice[] = ["varied", "clear", "snow", "fog", "snowFog"];

export interface Settings {
  /**
   * How a touch screen leans the jumper: dragging the left pad or tilting the phone. Tilting by default; the game
   * falls back to the finger where the phone has no motion sensor or the player says no to it.
   */
  leanControl: LeanControl;
  vibration: boolean;
  /** Added after version 2 was introduced; older saves read it as the default. */
  scenery: SceneryChoice;
  /** Snowfall and fog (added after version 2 too; varied by default). */
  weather: WeatherChoice;
  /** The player's colours (added after version 2 too). */
  outfit: Outfit;
  /** Game sounds (added after version 2 too; on by default). */
  sound: boolean;
  /** How strongly the mouse, a dragged finger and the tilt lean the jumper (added after version 2 too). */
  sensitivity: Sensitivity;
  /** Whether the picture tells what to press and when on the hill (added after version 2 too; on). */
  hillHints: boolean;
  /** What is kept of the replays and what goes on its own (added after version 2 too). */
  replays: ReplaySettings;
  /** Whether the record of the hill runs beside each training jump as a ghost (added after version 2 too; on). */
  recordGhost: boolean;
  /** The last setup of a competition: hill, participants, watching (added after version 2 too). */
  competition: CompetitionSettings;
}

/** The replays the game keeps besides the hill records, and the clean-up the player asked for. */
export interface ReplaySettings {
  /** How many of the last jumps are kept; 0 keeps none. */
  recentCount: number;
  /** Replays (not records) older than this many days go on their own; null keeps them. */
  maxAgeDays: number | null;
  /** The oldest replays (not records) go while all of them weigh more than this; null keeps them. */
  maxSizeKb: number | null;
  /** Whether a replay shows a slider under the picture, to go to a moment of it. */
  slider: boolean;
}

/** The numbers a player can choose for the replays, with their units in the names. */
export const REPLAY_SETTING_RANGES = {
  RECENT_COUNTS: [0, 5, 10, 20],
  MAX_AGE_DAYS_MIN: 1,
  MAX_AGE_DAYS_MAX: 3650,
  MAX_SIZE_KB_MIN: 100,
  MAX_SIZE_KB_MAX: 5000,
} as const;

const DEFAULT_REPLAY_SETTINGS: ReplaySettings = { recentCount: 5, maxAgeDays: null, maxSizeKb: null, slider: true };

export const DEFAULT_SETTINGS: Settings = {
  leanControl: "tilt",
  vibration: true,
  scenery: "varied",
  weather: "varied",
  outfit: DEFAULT_OUTFIT,
  sound: true,
  sensitivity: DEFAULT_SENSITIVITY,
  hillHints: true,
  replays: DEFAULT_REPLAY_SETTINGS,
  recordGhost: true,
  competition: DEFAULT_COMPETITION_SETTINGS,
};

export interface SaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  /** Best jump per hill id (see HillChoice.id). */
  records: Record<string, HillRecord>;
  settings: Settings;
}

export function emptySave(): SaveData {
  return { schemaVersion: SAVE_SCHEMA_VERSION, records: {}, settings: { ...DEFAULT_SETTINGS } };
}

/** Property of an unknown value, without assuming its type. */
export function field(v: unknown, key: string): unknown {
  return typeof v === "object" && v !== null ? Reflect.get(v, key) : undefined;
}

function asRecord(v: unknown): HillRecord | null {
  const distanceM = field(v, "distanceM");
  const points = field(v, "points");
  const dateIso = field(v, "dateIso");
  if (typeof distanceM !== "number" || !Number.isFinite(distanceM)) return null;
  if (typeof points !== "number" || !Number.isFinite(points)) return null;
  if (typeof dateIso !== "string") return null;
  return { distanceM, points, dateIso };
}

/** Reads stored JSON; anything unreadable or from an unknown version yields an empty save. */
export function parseSave(json: string | null): SaveData {
  return json === null ? emptySave() : (readableSave(json) ?? emptySave());
}

/** Reads stored JSON; null when it is not a save of a version this game knows. */
export function readableSave(json: string): SaveData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const version = field(raw, "schemaVersion");
  // Version 1 had records only; version 2 adds settings.
  if (version !== 1 && version !== SAVE_SCHEMA_VERSION) return null;
  const records: Record<string, HillRecord> = {};
  const stored = field(raw, "records");
  if (typeof stored === "object" && stored !== null) {
    for (const [id, value] of Object.entries(stored)) {
      const rec = asRecord(value);
      if (rec) records[id] = rec;
    }
  }
  return { schemaVersion: SAVE_SCHEMA_VERSION, records, settings: parseSettings(field(raw, "settings")) };
}

function parseSettings(v: unknown): Settings {
  const lean = field(v, "leanControl");
  const vibration = field(v, "vibration");
  const scenery = field(v, "scenery");
  const weather = field(v, "weather");
  const sound = field(v, "sound");
  const recordGhost = field(v, "recordGhost");
  // The name the setting had for a day, when it covered the flight only.
  const hillHints = field(v, "hillHints") ?? field(v, "flightHints");
  return {
    leanControl: lean === "tilt" || lean === "drag" ? lean : DEFAULT_SETTINGS.leanControl,
    vibration: typeof vibration === "boolean" ? vibration : DEFAULT_SETTINGS.vibration,
    scenery:
      scenery === "varied" || scenery === "day" || scenery === "dusk" || scenery === "night"
        ? scenery
        : DEFAULT_SETTINGS.scenery,
    weather: WEATHER_CHOICES.find((w) => w === weather) ?? DEFAULT_SETTINGS.weather,
    outfit: parseOutfit(field(v, "outfit")),
    sound: typeof sound === "boolean" ? sound : DEFAULT_SETTINGS.sound,
    sensitivity: parseSensitivity(field(v, "sensitivity")),
    hillHints: typeof hillHints === "boolean" ? hillHints : DEFAULT_SETTINGS.hillHints,
    replays: parseReplaySettings(field(v, "replays")),
    recordGhost: typeof recordGhost === "boolean" ? recordGhost : DEFAULT_SETTINGS.recordGhost,
    competition: parseCompetitionSettings(field(v, "competition")),
  };
}

/** A whole number within the range, or null for anything else. */
function wholeWithin(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function parseReplaySettings(v: unknown): ReplaySettings {
  const R = REPLAY_SETTING_RANGES;
  const recent = field(v, "recentCount");
  const slider = field(v, "slider");
  return {
    recentCount: R.RECENT_COUNTS.find((count) => count === recent) ?? DEFAULT_REPLAY_SETTINGS.recentCount,
    maxAgeDays: wholeWithin(field(v, "maxAgeDays"), R.MAX_AGE_DAYS_MIN, R.MAX_AGE_DAYS_MAX),
    maxSizeKb: wholeWithin(field(v, "maxSizeKb"), R.MAX_SIZE_KB_MIN, R.MAX_SIZE_KB_MAX),
    slider: typeof slider === "boolean" ? slider : DEFAULT_REPLAY_SETTINGS.slider,
  };
}

export function withSettings(save: SaveData, change: Partial<Settings>): SaveData {
  return { ...save, settings: { ...save.settings, ...change } };
}

/** True when the jump beats the hill record: a clean jump with a distance beyond the stored one (falls never count). */
export function beatsRecord(jump: { distanceM: number; fell: boolean }, best: HillRecord | undefined): boolean {
  return !jump.fell && jump.distanceM > 0 && (best === undefined || jump.distanceM > best.distanceM);
}

/** Returns a new save with the jump stored if it beats the hill record. */
export function withJump(
  save: SaveData,
  hillId: string,
  jump: { distanceM: number; points: number; fell: boolean },
  now: Date,
): SaveData {
  if (!beatsRecord(jump, save.records[hillId])) return save;
  return {
    ...save,
    records: {
      ...save.records,
      [hillId]: { distanceM: jump.distanceM, points: jump.points, dateIso: now.toISOString() },
    },
  };
}

/**
 * Which of two records of one hill stands when two windows hold different ones: the longer jump; between equal
 * ones, the newer (on the same date, the first). The merges of the save and of the replays follow this one rule.
 * Whether a new jump makes a record at all is beatsRecord's to say (strictly longer); this rule only picks between
 * records made in different windows.
 */
export function betterRecordOf(
  first: { distanceM: number; dateIso: string },
  second: { distanceM: number; dateIso: string },
): "first" | "second" {
  if (first.distanceM !== second.distanceM) return first.distanceM > second.distanceM ? "first" : "second";
  return first.dateIso >= second.dateIso ? "first" : "second";
}

/**
 * The save to store when a window writes `mine` over `stored` (another window may have stored since): per hill the
 * record that stands (betterRecordOf), and the settings of `mine`, as the last written.
 */
export function mergedSave(stored: SaveData, mine: SaveData): SaveData {
  const records: Record<string, HillRecord> = { ...stored.records };
  for (const [hillId, record] of Object.entries(mine.records)) {
    const held = records[hillId];
    if (held === undefined || betterRecordOf(record, held) === "first") records[hillId] = record;
  }
  return { ...mine, records };
}
