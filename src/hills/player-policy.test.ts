import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { startTrainingJump } from "../game/training-session";
import { PHASE } from "../sim/jump-logic";
import {
  LEAN_LIMITS_RAD,
  policyLandingHeightM,
  policyLeanRad,
  policyTakesOff,
  TRAINED_PLAYER_POLICY,
  TRAINED_POLICY_SCORES,
  type PlayerPolicy,
} from "./player-policy";
import { playerView, type PlayerView } from "./player-view";
import { ownHillsScore } from "./test-support/player-training";

const [training] = OWN_HILLS;
if (training === undefined) throw new Error("no own hill");

const view: PlayerView = {
  frame: 400,
  phase: PHASE.flight,
  speedMPerS: 25,
  timeToEdgeS: -2,
  aboveTerrainM: 3,
  closingMPerS: 2,
  bodyAngleRad: -0.3,
  framesSinceTakeoff: 100,
  shownTailWindMPerS: 0,
};

const policy: PlayerPolicy = {
  takeoffAimS: 0.2,
  earlyFlightFrames: 30,
  earlyLeanRad: 0.1,
  leanRad: 0.3,
  leanPerSpeedRadPerMPerS: 0.01,
  leanPerHeightRadPerM: 0.05,
  leanPerTailWindRadPerMPerS: -0.02,
  landingHeightM: 2,
  landingPerClosingS: 0.1,
  telemark: true,
};

describe("player view", () => {
  it("sees the jump at the gate: no takeoff yet, the edge ahead, the wind as the indicator shows it", () => {
    const jump = startTrainingJump(training, 14);
    const v = playerView(jump, 1, null);
    expect(v.framesSinceTakeoff).toBeNull();
    expect(v.phase).toBe(jump.state.logic.phase);
    expect(v.aboveTerrainM).toBeGreaterThanOrEqual(0);
    expect(Math.abs(v.shownTailWindMPerS)).toBeLessThanOrEqual(jump.state.wind.speedMPerS);
    expect(playerView(jump, 50, 20).framesSinceTakeoff).toBe(30);
  });
});

describe("player policy", () => {
  it("holds the early lean in the first part of the flight and the shaped lean after it", () => {
    expect(policyLeanRad(policy, { ...view, framesSinceTakeoff: 10 })).toBe(0.1);
    // Before the takeoff the flight has not begun: the lean held is the one of its first frame.
    expect(policyLeanRad(policy, { ...view, framesSinceTakeoff: null })).toBe(0.1);
    expect(policyLeanRad(policy, view)).toBeCloseTo(0.3);
    expect(policyLeanRad(policy, { ...view, speedMPerS: 30 })).toBeCloseTo(0.35);
    expect(policyLeanRad(policy, { ...view, aboveTerrainM: 5 })).toBeCloseTo(0.4);
    expect(policyLeanRad(policy, { ...view, shownTailWindMPerS: -2 })).toBeCloseTo(0.34);
  });

  it("keeps the lean within its limits", () => {
    expect(policyLeanRad(policy, { ...view, aboveTerrainM: 100 })).toBe(LEAN_LIMITS_RAD.max);
    expect(policyLeanRad(policy, { ...view, aboveTerrainM: -100 })).toBe(LEAN_LIMITS_RAD.min);
  });

  it("presses for the landing higher when coming down faster, never lower than its height", () => {
    expect(policyLandingHeightM(policy, view)).toBeCloseTo(2.2);
    expect(policyLandingHeightM(policy, { ...view, closingMPerS: -3 })).toBe(2);
  });

  it("presses for the takeoff only while crouching, at its aim before the edge", () => {
    const crouch = { ...view, phase: PHASE.crouch, timeToEdgeS: 0.2 };
    expect(policyTakesOff(policy, crouch, 0)).toBe(true);
    expect(policyTakesOff(policy, { ...crouch, timeToEdgeS: 0.25 }, 0)).toBe(false);
    expect(policyTakesOff(policy, { ...crouch, timeToEdgeS: 0.25 }, 0.05)).toBe(true);
    expect(policyTakesOff(policy, { ...crouch, phase: PHASE.inrun }, 0)).toBe(false);
  });
});

/** About 2 s alone; 19 s under coverage on a loaded machine passed the 15 s default of the suite. */
const OWN_HILLS_SCORE_TIMEOUT_MS = 60_000;

describe("player training", { timeout: OWN_HILLS_SCORE_TIMEOUT_MS }, () => {
  it("reproduces the recorded score of the trained player on the own hills", () => {
    expect(ownHillsScore(TRAINED_PLAYER_POLICY)).toBe(TRAINED_POLICY_SCORES.ownHills);
  });
});
