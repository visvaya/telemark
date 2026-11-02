import { describe, expect, it } from "vitest";
import { JUMP_TIMING } from "../../e2e/support/jump-timing";
import { PHASE } from "../sim/jump-logic";
import { OWN_HILLS, type HillChoice } from "./hill-choice";
import { isJumpOver, startTrainingJump, stepTrainingJump } from "./training-session";

/**
 * The browser tests jump by time on the built-in hill (e2e/support/jump-timing.ts). Their press times were measured
 * on its inrun; a change of the hill that moves the edge of the takeoff must move them too, and this test says so
 * before the slow browser run does.
 */

const FRAME_MS = 1000 / 70;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Each press time may be this much off and the jump still ends clean: a loaded machine shifts a press. */
const MARGIN_MS = 100;
const FRAME_LIMIT = 6000;

interface Presses {
  takeoffMs: number;
  landingMs: number;
  telemarkMs: number;
}

const SCRIPTED: Presses = {
  takeoffMs: JUMP_TIMING.TAKEOFF_AFTER_START_MS,
  landingMs: JUMP_TIMING.LANDING_AFTER_TAKEOFF_MS,
  telemarkMs: JUMP_TIMING.TELEMARK_AFTER_LANDING_MS,
};

/** Whether a press made at `fromMs` still holds its button down at `atMs`. */
const held = (fromMs: number, atMs: number): boolean => atMs >= fromMs && atMs < fromMs + JUMP_TIMING.PRESS_HOLD_MS;

/**
 * One jump as the browser test plays it with the mouse: the left button held until the jumper leaves the gate,
 * then both buttons, then the right one, then the left one, each held for the same short time.
 */
function landsClean(hill: HillChoice, seed: number, p: Presses): boolean {
  const landingAt = p.takeoffMs + p.landingMs;
  let jump = startTrainingJump(hill, seed);
  let startFrame = -1;
  for (let f = 0; f < FRAME_LIMIT && !isJumpOver(jump); f++) {
    if (startFrame < 0 && jump.state.logic.phase !== PHASE.gate) startFrame = f;
    const atMs = startFrame < 0 ? Number.NEGATIVE_INFINITY : (f - startFrame) * FRAME_MS;
    const both = held(p.takeoffMs, atMs);
    jump = stepTrainingJump(jump, {
      left: startFrame < 0 || both || held(landingAt + p.telemarkMs, atMs),
      right: both || held(landingAt, atMs),
      dy: 0,
    });
  }
  const logic = jump.state.logic;
  return isJumpOver(jump) && logic.fallType === 0 && logic.distanceM > 0;
}

const shifted = (change: Partial<Presses>): Presses => ({ ...SCRIPTED, ...change });

describe("press times of the browser tests", () => {
  const [hill] = OWN_HILLS;
  if (hill === undefined) throw new Error("no built-in hill");

  it.each<[string, Presses]>([
    ["as scripted", SCRIPTED],
    ["takeoff early", shifted({ takeoffMs: SCRIPTED.takeoffMs - MARGIN_MS })],
    ["takeoff late", shifted({ takeoffMs: SCRIPTED.takeoffMs + MARGIN_MS })],
    ["landing early", shifted({ landingMs: SCRIPTED.landingMs - MARGIN_MS })],
    ["landing late", shifted({ landingMs: SCRIPTED.landingMs + MARGIN_MS })],
    ["telemark early", shifted({ telemarkMs: SCRIPTED.telemarkMs - MARGIN_MS })],
    ["telemark late", shifted({ telemarkMs: SCRIPTED.telemarkMs + MARGIN_MS })],
  ])("give a clean landing on the built-in hill: %s", (_, presses) => {
    expect(SEEDS.filter((seed) => !landsClean(hill, seed, presses))).toEqual([]);
  });
});
