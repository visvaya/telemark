import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import {
  exactRivalJump,
  EXACT_PLAYER_LEVEL,
  PLAYER_LEVELS,
  playJump,
  randomJump,
  RIVAL_PLAYER_LEVELS,
  rivalJump,
  takeoffAimSearch,
  withAimFrames,
} from "./hill-players";
import { PLAY_RULES } from "./hill-play";
import { TRAINED_PLAYER_POLICY } from "./player-policy";
import { fullAimSweep } from "./test-support/full-aim-sweep";

const [training] = OWN_HILLS;
if (training === undefined) throw new Error("no own hill");

/** Trying all 41 aims for 8 seeds takes about 3 s alone, longer under coverage. */
const SWEEP_TIMEOUT_MS = 60_000;

const meanDistance = (v: readonly { distanceM: number }[]): number => v.reduce((a, o) => a + o.distanceM, 0) / v.length;

describe("hill players", () => {
  it.each(OWN_HILLS.map((h) => [h.id, h] as const))("plays %s the same way twice", (_, hill) => {
    const once = playJump(hill, 5, PLAYER_LEVELS.average, 9);
    expect(playJump(hill, 5, PLAYER_LEVELS.average, 9).finalHash).toBe(once.finalHash);
    expect(playJump(hill, 6, PLAYER_LEVELS.average, 9).finalHash).not.toBe(once.finalHash);
    expect(randomJump(hill, 5, 9).finalHash).toBe(randomJump(hill, 5, 9).finalHash);
  });

  it("plays a rival the same way twice, and another rival from another noise seed", () => {
    const once = rivalJump(training, 5, RIVAL_PLAYER_LEVELS.average, 9);
    expect(rivalJump(training, 5, RIVAL_PLAYER_LEVELS.average, 9).finalHash).toBe(once.finalHash);
    expect(rivalJump(training, 5, RIVAL_PLAYER_LEVELS.average, 10).finalHash).not.toBe(once.finalHash);
    expect(exactRivalJump(training, 5).finalHash).toBe(exactRivalJump(training, 5).finalHash);
    expect(exactRivalJump(training, 5, 4).finalHash).not.toBe(exactRivalJump(training, 5, 30).finalHash);
  });

  it("makes the good rival jump further than the weak one, and neither fall, on most winds", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const good = seeds.map((s) => rivalJump(training, s, RIVAL_PLAYER_LEVELS.good, s + 100));
    const weak = seeds.map((s) => rivalJump(training, s, RIVAL_PLAYER_LEVELS.weak, s + 100));
    expect(meanDistance(good)).toBeGreaterThan(meanDistance(weak));
    expect(good.filter((o) => o.fell || o.disqualified)).toEqual([]);
  });

  it(
    "finds the same best aim, best distance and window for the exact rival as trying every aim",
    () => {
      const seeds = [1, 2, 3, 4];
      const rival = (seed: number, aim: number) => exactRivalJump(training, seed, aim);
      const searched = takeoffAimSearch(training, seeds, PLAY_RULES.windowToleranceM, undefined, undefined, rival);
      expect(
        searched.map(({ bestDistanceM, bestAimFrames, windowFrames }) => ({
          bestDistanceM,
          bestAimFrames,
          windowFrames,
        })),
      ).toEqual(fullAimSweep(training, seeds, PLAY_RULES.windowToleranceM, rival));
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    "finds the same best aim, best distance and window as trying every aim",
    () => {
      const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
      const searched = takeoffAimSearch(training, seeds, PLAY_RULES.windowToleranceM);
      expect(
        searched.map(({ bestDistanceM, bestAimFrames, windowFrames }) => ({
          bestDistanceM,
          bestAimFrames,
          windowFrames,
        })),
      ).toEqual(fullAimSweep(training, seeds, PLAY_RULES.windowToleranceM));
      expect(Math.max(...searched.map((s) => s.jumps))).toBeLessThan(20);
    },
    SWEEP_TIMEOUT_MS,
  );

  it("widens the search from a start far from the peak", () => {
    const [far] = takeoffAimSearch(training, [3], PLAY_RULES.windowToleranceM, 30);
    const [near] = takeoffAimSearch(training, [3], PLAY_RULES.windowToleranceM);
    expect(far?.bestAimFrames).toBe(near?.bestAimFrames);
    expect(far?.bestDistanceM).toBe(near?.bestDistanceM);
  });

  it("lands an exact good player at the search's best aim within 1 m of the best", () => {
    const [sweep] = takeoffAimSearch(training, [3], PLAY_RULES.windowToleranceM);
    if (sweep === undefined) throw new Error("no sweep");
    const jump = playJump(
      training,
      3,
      EXACT_PLAYER_LEVEL,
      3,
      withAimFrames(TRAINED_PLAYER_POLICY, sweep.bestAimFrames),
    );
    expect(Math.abs(jump.distanceM - sweep.bestDistanceM)).toBeLessThanOrEqual(1);
    expect(jump.fell).toBe(false);
    expect(sweep.windowFrames).toBeGreaterThanOrEqual(PLAY_RULES.windowMinFrames);
  });

  it("lets the weak player fall sometimes, so the levels differ", () => {
    const jumps = Array.from({ length: 16 }, (_, i) => playJump(training, i + 1, PLAYER_LEVELS.weak, i + 100));
    const falls = jumps.filter((o) => o.fell || o.disqualified).length;
    expect(falls).toBeGreaterThan(0);
    expect(falls).toBeLessThan(jumps.length);
  });

  it("measures a whole jump with finite numbers", () => {
    const o = playJump(training, 1, PLAYER_LEVELS.good, 1);
    expect(o.ended).toBe(true);
    expect(o.finite).toBe(true);
    expect(o.takeoffSpeedKmPerH).toBeGreaterThan(0);
    expect(o.flightTimeS).toBeGreaterThan(0);
    expect(o.highestAboveTerrainM).toBeGreaterThan(0);
    expect(o.landingImpactMPerS).toBeGreaterThan(0);
    expect(o.fallType).toBe(0);
  });
});
