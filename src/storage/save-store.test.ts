import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  beatsRecord,
  emptySave,
  parseSave,
  withJump,
  withSettings,
  type Settings,
} from "./save-data";
import { SAVE_KEY, detectBackend, loadSave, memoryBackend, saveSave } from "./save-store";

const NOW = new Date("2026-10-11T10:00:00Z");

describe("save data", () => {
  it("keeps the best clean jump per hill", () => {
    let save = emptySave();
    save = withJump(save, "own-1", { distanceM: 80, points: 100, fell: false }, NOW);
    save = withJump(save, "own-1", { distanceM: 75, points: 90, fell: false }, NOW);
    save = withJump(save, "own-1", { distanceM: 95, points: 120, fell: true }, NOW);
    expect(save.records["own-1"]).toEqual({ distanceM: 80, points: 100, dateIso: NOW.toISOString() });
  });

  it("counts as a record only a clean jump with a distance beyond the stored one", () => {
    const best = { distanceM: 80, points: 100, dateIso: NOW.toISOString() };
    expect(beatsRecord({ distanceM: 50, fell: false }, undefined)).toBe(true);
    expect(beatsRecord({ distanceM: 80.5, fell: false }, best)).toBe(true);
    expect(beatsRecord({ distanceM: 80, fell: false }, best)).toBe(false);
    expect(beatsRecord({ distanceM: 95, fell: true }, best)).toBe(false);
    expect(beatsRecord({ distanceM: 95, fell: true }, undefined)).toBe(false);
    expect(beatsRecord({ distanceM: 0, fell: false }, undefined)).toBe(false);
  });

  it("reads back what it writes and ignores broken or foreign data", () => {
    const save = withJump(emptySave(), "original-35", { distanceM: 89.92, points: 128.5, fell: false }, NOW);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    expect(parseSave("not json")).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ schemaVersion: 99, records: {} }))).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ schemaVersion: 1, records: { a: { distanceM: "x" } } }))).toEqual(emptySave());
  });

  it("migrates version 1 saves and keeps their records", () => {
    const v1 = { schemaVersion: 1, records: { "own-1": { distanceM: 80, points: 100, dateIso: NOW.toISOString() } } };
    const save = parseSave(JSON.stringify(v1));
    expect(save.schemaVersion).toBe(2);
    expect(save.records).toEqual(v1.records);
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("stores settings and repairs unknown values", () => {
    const outfit = { pants: 1, sleeves: 2, gloves: 3, helmet: 4, skis: 11 };
    const chosen: Settings = {
      leanControl: "tilt",
      vibration: false,
      scenery: "night",
      weather: "snowFog",
      outfit,
      sound: false,
      sensitivity: { mouse: 3, drag: 7, tilt: 9 },
      hillHints: false,
      replays: { recentCount: 10, maxAgeDays: 30, maxSizeKb: 2000, slider: false },
      recordGhost: false,
      competition: {
        hillId: "own-3",
        players: [true, true, false, false, false, false, false, true],
        cpus: DEFAULT_SETTINGS.competition.cpus.map((_c, i) => ({ on: i % 2 === 0, level: 5 })),
        watchCpu: true,
      },
    };
    const save = withSettings(emptySave(), chosen);
    expect(parseSave(JSON.stringify(save)).settings).toEqual(chosen);
    // A save from before the sensitivity was added reads it as the default.
    const older = { ...save, settings: { leanControl: "tilt", vibration: false } };
    expect(parseSave(JSON.stringify(older)).settings.sensitivity).toEqual({ mouse: 5, drag: 5, tilt: 5 });
    expect(parseSave(JSON.stringify(older)).settings.hillHints).toBe(true);
    expect(parseSave(JSON.stringify(older)).settings.weather).toBe("varied");
    expect(parseSave(JSON.stringify(older)).settings.competition).toEqual(DEFAULT_SETTINGS.competition);
    // The choice stored under the setting's first name is kept.
    const renamed = { ...save, settings: { flightHints: false } };
    expect(parseSave(JSON.stringify(renamed)).settings.hillHints).toBe(false);
    const broken = {
      ...save,
      settings: {
        leanControl: "joystick",
        vibration: "yes",
        scenery: "dawn",
        weather: "hail",
        outfit: { pants: 12, skis: 1.5, helmet: "red" },
        sound: "loud",
        replays: { recentCount: 7, maxAgeDays: 0, maxSizeKb: 1e9, slider: "yes" },
        recordGhost: 1,
        competition: { hillId: 3, players: "all", cpus: [{ on: "yes", level: 7 }], watchCpu: 0 },
      },
    };
    expect(parseSave(JSON.stringify(broken)).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("reads a version 2 save written before the scenery setting existed", () => {
    const older = { schemaVersion: 2, records: {}, settings: { leanControl: "tilt", vibration: false } };
    expect(parseSave(JSON.stringify(older)).settings).toEqual({
      ...DEFAULT_SETTINGS,
      leanControl: "tilt",
      vibration: false,
    });
  });
});

describe("save store", () => {
  it("round-trips through a backend", async () => {
    const backend = memoryBackend();
    const save = withJump(emptySave(), "own-1", { distanceM: 70, points: 60, fell: false }, NOW);
    await saveSave(backend, save);
    expect(await loadSave(backend)).toEqual(save);
  });

  it("keeps the records another window stored, the better one per hill; the settings are the last written", async () => {
    const backend = memoryBackend();
    const elsewhere = withJump(
      withJump(emptySave(), "own-1", { distanceM: 90, points: 80, fell: false }, NOW),
      "own-2",
      { distanceM: 50, points: 40, fell: false },
      NOW,
    );
    await saveSave(backend, elsewhere);
    // This window never saw those records: it jumped a shorter own-1 and a longer own-2, and changed a setting.
    const here = withSettings(
      withJump(
        withJump(emptySave(), "own-1", { distanceM: 70, points: 60, fell: false }, NOW),
        "own-2",
        { distanceM: 60, points: 50, fell: false },
        NOW,
      ),
      { sound: false },
    );
    const merged = await saveSave(backend, here);
    expect(merged.records["own-1"]?.distanceM).toBe(90);
    expect(merged.records["own-2"]?.distanceM).toBe(60);
    expect(merged.settings.sound).toBe(false);
    expect(await loadSave(backend)).toEqual(merged);
  });

  it("prefers host storage, then localStorage, then memory", async () => {
    const host = new Map<string, string>();
    const hostStore = {
      get: (k: string) => Promise.resolve(host.has(k) ? { key: k, value: host.get(k) } : null),
      set: (k: string, v: string) => {
        host.set(k, v);
        return Promise.resolve();
      },
    };
    const viaHost = detectBackend({ storage: hostStore });
    expect(viaHost.name).toBe("window.storage");
    await viaHost.set(SAVE_KEY, "{}");
    expect(await viaHost.get(SAVE_KEY)).toBe("{}");

    const items = new Map<string, string>();
    const local = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    };
    expect(detectBackend({ localStorage: local }).name).toBe("localStorage");

    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(detectBackend({ localStorage: broken }).name).toBe("memory");
  });
});
