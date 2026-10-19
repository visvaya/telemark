import { describe, expect, it } from "vitest";
import { DEFAULT_COMPETITION_SETTINGS, type CompetitionSettings } from "../game/competition";
import { startRun } from "../game/competition-run";
import { keptOf, type SavedContest } from "../game/contest-save";
import { OWN_HILLS } from "../game/hill-choice";
import { CONTEST_FILE_MAX_BYTES, contestFileName, contestFileText, readContestFile } from "./contest-file";

const everybody: CompetitionSettings = {
  ...DEFAULT_COMPETITION_SETTINGS,
  players: DEFAULT_COMPETITION_SETTINGS.players.map(() => true),
  cpus: DEFAULT_COMPETITION_SETTINGS.cpus.map((c) => ({ ...c, on: true })),
};

function kept(count: number): SavedContest {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  let n = 0;
  const run = startRun(
    Array.from({ length: count }, () => hill),
    everybody,
    7,
    () => ++n,
  );
  if (!run) throw new Error("no run");
  return keptOf(run, "board");
}

const now = new Date(2026, 9, 19, 8, 5, 30);

describe("a competition file", () => {
  const contest = kept(2);

  it("reads back what it wrote", () => {
    expect(readContestFile(contestFileText(contest, now))).toEqual({
      ok: true,
      contest: structuredClone(contest),
    });
    const head = `{"kind":"telemark-zawody","schemaVersion":1,"savedAt":"${now.toISOString()}","contest":{`;
    expect(contestFileText(contest, now).startsWith(head)).toBe(true);
  });

  it("is named by the local day and time to the minute", () => {
    expect(contestFileName(now)).toBe("telemark-zawody_2026-10-19_08-05.json");
  });

  it("stays far under its size limit at the most competitions and competitors", () => {
    const largest = contestFileText(kept(74), now);
    expect(largest.length).toBeLessThan(CONTEST_FILE_MAX_BYTES / 10);
  });

  it.each([
    ["invalid JSON", "{", "notContest"],
    ["another kind", JSON.stringify({ kind: "telemark-replays", schemaVersion: 1, contest }), "notContest"],
    ["no kind", JSON.stringify({ schemaVersion: 1, contest }), "notContest"],
    ["a newer version", JSON.stringify({ kind: "telemark-zawody", schemaVersion: 2, contest }), "newer"],
    ["a version as a string", JSON.stringify({ kind: "telemark-zawody", schemaVersion: "1", contest }), "damaged"],
    ["no contest", JSON.stringify({ kind: "telemark-zawody", schemaVersion: 1 }), "damaged"],
    [
      "a broken contest",
      JSON.stringify({ kind: "telemark-zawody", schemaVersion: 1, contest: { ...contest, roundStarted: 1 } }),
      "damaged",
    ],
    ["a number past the range of JSON", contestFileText(contest, now).replace('"index":0', '"index":1e999'), "damaged"],
    ["a 10 MB string", `"${"x".repeat(10_000_000)}"`, "notContest"],
  ])("refuses %s", (_name, text, refusal) => {
    expect(readContestFile(text)).toEqual({ ok: false, refusal });
  });
});
