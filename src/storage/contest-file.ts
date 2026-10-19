import { parseSavedContest, type SavedContest } from "../game/contest-save";
import { field } from "./save-data";

/**
 * A file of a competition, to take it to another device: the saved competition under a kind and a version of its
 * own, so a file of anything else is told apart.
 */
const CONTEST_FILE_KIND = "telemark-zawody";
const CONTEST_FILE_VERSION = 1;
/**
 * A cup of the most competitions with the most competitors is under 100 KB of JSON; anything larger is not a file
 * of this game and is not read at all.
 */
export const CONTEST_FILE_MAX_BYTES = 1_000_000;

export function contestFileText(contest: SavedContest, now: Date): string {
  return JSON.stringify({
    kind: CONTEST_FILE_KIND,
    schemaVersion: CONTEST_FILE_VERSION,
    savedAt: now.toISOString(),
    contest,
  });
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The name the file is offered under: the local day and time, to the minute. */
export function contestFileName(now: Date): string {
  const day = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return `telemark-zawody_${day}_${pad2(now.getHours())}-${pad2(now.getMinutes())}.json`;
}

/** Why a file was not read: not a competition file, a file of a newer game, or a damaged one. */
type ContestFileRefusal = "notContest" | "newer" | "damaged";

export type ReadContestFile = { ok: true; contest: SavedContest } | { ok: false; refusal: ContestFileRefusal };

/** Reads the text of a chosen file; never throws. */
export function readContestFile(text: string): ReadContestFile {
  if (text.length > CONTEST_FILE_MAX_BYTES) return { ok: false, refusal: "notContest" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, refusal: "notContest" };
  }
  if (field(raw, "kind") !== CONTEST_FILE_KIND) return { ok: false, refusal: "notContest" };
  const version = field(raw, "schemaVersion");
  if (typeof version === "number" && Number.isInteger(version) && version > CONTEST_FILE_VERSION) {
    return { ok: false, refusal: "newer" };
  }
  if (version !== CONTEST_FILE_VERSION) return { ok: false, refusal: "damaged" };
  const contest = parseSavedContest(field(raw, "contest"));
  return contest === null ? { ok: false, refusal: "damaged" } : { ok: true, contest };
}
