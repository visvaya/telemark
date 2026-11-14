import { describe, expect, it } from "vitest";
import { JUMP_TIMING } from "../../e2e/support/jump-timing";
import { PHASE } from "../sim/jump-logic";
import { OWN_HILLS, type HillChoice } from "./hill-choice";
import { isJumpOver, startTrainingJump, stepTrainingJump } from "./training-session";

/**
 * The browser tests press by the state of the jump on the built-in hill (e2e/support/jump-timing.ts). A change of
 * the hill or of the simulation that moves the windows of those presses must move them too, and this test says so
 * before the slow browser run does.
 */

const FRAME_MS = 1000 / 70;
const HOLD_FRAMES = Math.ceil(JUMP_TIMING.PRESS_HOLD_MS / FRAME_MS);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
/**
 * How many frames a test may be late with a press and the jump still ends clean: on a loaded machine the test sees
 * the state late and its press arrives later still. Half a second.
 */
const LATE_FRAMES = 35;
const FRAME_LIMIT = 6000;
/** Frames between the two taps of the takeoff on a touch screen, which a test sends one after the other. */
const TAP_GAP_FRAMES = 3;

/** How late each press comes after the moment the script aims at, in frames. */
interface Lateness {
  takeoff: number;
  landing: number;
  telemark: number;
}

/**
 * WebKit on a developer's machine held the buttons of a scripted mouse chord about 48 frames, and a press reached
 * the page about 22 frames after the test saw its moment, measured from the page's events (2026-11-03).
 */
const SLOW_MOUSE_HOLD_FRAMES = 48;
const SLOW_MOUSE_LATE_FRAMES = 22;

/**
 * How the test presses, and how late it may be: the mouse holds both buttons for a moment and lands with a chord;
 * a tap counts for one frame, and the telemark is a tap of its own.
 */
const HANDS = {
  mouse: { holdFrames: HOLD_FRAMES, rightAfterLeftFrames: 0, telemarkApart: false, lateFrames: LATE_FRAMES },
  "slow mouse": {
    holdFrames: SLOW_MOUSE_HOLD_FRAMES,
    rightAfterLeftFrames: 0,
    telemarkApart: false,
    lateFrames: SLOW_MOUSE_LATE_FRAMES,
  },
  touch: { holdFrames: 1, rightAfterLeftFrames: TAP_GAP_FRAMES, telemarkApart: true, lateFrames: LATE_FRAMES },
  /** How the mouse landed before: the left button pressed on its own after the right one. */
  "mouse pressing apart": {
    holdFrames: HOLD_FRAMES,
    rightAfterLeftFrames: 0,
    telemarkApart: true,
    lateFrames: LATE_FRAMES,
  },
} as const;

/**
 * One jump as the browser test plays it: the left button held until the jumper leaves the gate, both buttons once
 * the edge is near (with touch, the right zone tapped a little after the left one), then the landing: with the
 * mouse both buttons again, with touch the right zone and then the left one.
 */
function landsClean(hill: HillChoice, seed: number, late: Lateness, hand: keyof typeof HANDS): boolean {
  const { holdFrames, rightAfterLeftFrames, telemarkApart } = HANDS[hand];
  let jump = startTrainingJump(hill, seed);
  // The frame in which the test sees the moment of the takeoff; the press reaches the page `late.takeoff` later.
  let takeoffSeen = -1;
  for (let f = 0; f < FRAME_LIMIT && !isJumpOver(jump); f++) {
    const { logic, jumper } = jump.state;
    if (takeoffSeen < 0 && hill.profile.takeoffXM - jumper.xM <= JUMP_TIMING.TAKEOFF_LEAD_M) {
      takeoffSeen = logic.frame;
    }
    const takeoffAt = takeoffSeen + late.takeoff;
    // As e2e/support/jump.ts does: the landing is aimed from the frame the takeoff was seen in, but never sooner than
    // a few frames after the takeoff press has ended, and the telemark from the frame the landing was aimed at.
    const released = takeoffAt + rightAfterLeftFrames + holdFrames;
    const landingSeen = Math.max(
      takeoffSeen + JUMP_TIMING.LANDING_AFTER_TAKEOFF_FRAMES,
      released + JUMP_TIMING.FRAMES_AFTER_RELEASE,
    );
    const landingAt = landingSeen + late.landing;
    const telemarkAt = telemarkApart
      ? landingSeen + JUMP_TIMING.TELEMARK_AFTER_LANDING_FRAMES + late.telemark
      : landingAt;
    const held = (from: number) => takeoffSeen >= 0 && logic.frame >= from && logic.frame < from + holdFrames;
    jump = stepTrainingJump(jump, {
      left: logic.phase === PHASE.gate || held(takeoffAt) || held(telemarkAt),
      right: held(takeoffAt + rightAfterLeftFrames) || held(landingAt),
      dy: 0,
    });
  }
  const logic = jump.state.logic;
  return isJumpOver(jump) && logic.fallType === 0 && logic.distanceM > 0;
}

const ON_TIME: Lateness = { takeoff: 0, landing: 0, telemark: 0 };

const casesFor = (late: number): [string, Lateness][] => [
  ["on time", ON_TIME],
  ["takeoff late", { ...ON_TIME, takeoff: late }],
  ["landing late", { ...ON_TIME, landing: late }],
  ["telemark late", { ...ON_TIME, telemark: late / 2 }],
  ["every press late", { takeoff: late / 2, landing: late / 2, telemark: late / 2 }],
];

describe("presses of the browser tests", () => {
  const [hill] = OWN_HILLS;
  if (hill === undefined) throw new Error("no built-in hill");

  it.each(
    (["mouse", "slow mouse", "touch"] as const).flatMap((hand) =>
      casesFor(HANDS[hand].lateFrames).map(([name, late]) => [hand, name, late] as const),
    ),
  )("give a clean landing on the built-in hill with the %s: %s", (hand, _, late) => {
    expect(SEEDS.filter((seed) => !landsClean(hill, seed, late, hand))).toEqual([]);
  });

  it("let a mouse that presses the telemark apart fall when it comes as late as in WebKit on the runner", () => {
    // 2026-11-14, traces of the failed runs: the left button came 27 to 38 frames after the right one, which is 20
    // to 31 frames later than the script aims at.
    const late = { ...ON_TIME, telemark: 31 };
    expect(SEEDS.filter((seed) => !landsClean(hill, seed, late, "mouse pressing apart")).length).toBeGreaterThan(0);
  });
});

const CHORD_HOLD_FRAMES = Math.ceil(JUMP_TIMING.CHORD_HOLD_MS / FRAME_MS);

/**
 * One jump played with chords: both buttons near the edge, both again at the start of the flight. `secondCounts`
 * false loses the left button of the landing chord, as a page that drops the second button of a chord would.
 */
function chordJump(hill: HillChoice, seed: number, late: number, secondCounts: boolean) {
  let jump = startTrainingJump(hill, seed);
  let takeoffAt = -1;
  for (let f = 0; f < FRAME_LIMIT && !isJumpOver(jump); f++) {
    const { logic, jumper } = jump.state;
    if (takeoffAt < 0 && hill.profile.takeoffXM - jumper.xM <= JUMP_TIMING.TAKEOFF_LEAD_M)
      takeoffAt = logic.frame + late;
    const landingAt = takeoffAt + JUMP_TIMING.LANDING_CHORD_AFTER_TAKEOFF_FRAMES + late;
    const held = (from: number) => takeoffAt >= 0 && logic.frame >= from && logic.frame < from + CHORD_HOLD_FRAMES;
    jump = stepTrainingJump(jump, {
      left: logic.phase === PHASE.gate || held(takeoffAt) || (secondCounts && held(landingAt)),
      right: held(takeoffAt) || held(landingAt),
      dy: 0,
    });
  }
  return { over: isJumpOver(jump), fell: jump.state.logic.fallType !== 0, distanceM: jump.state.logic.distanceM };
}

describe("chords of the browser tests", () => {
  const [hill] = OWN_HILLS;
  if (hill === undefined) throw new Error("no built-in hill");

  it.each([0, LATE_FRAMES / 2])("land clean when both buttons count, %s frames late", (late) => {
    const unclean = SEEDS.filter((seed) => {
      const end = chordJump(hill, seed, late, true);
      return !end.over || end.fell || end.distanceM <= 0;
    });
    expect(unclean).toEqual([]);
  });

  it("fall when the second button of the landing chord is lost", () => {
    expect(SEEDS.filter((seed) => !chordJump(hill, seed, 0, false).fell)).toEqual([]);
  });
});
