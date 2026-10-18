import { describe, expect, it } from "vitest";
import type { ContestJumpHud } from "../game/competition-board";
import { OWN_HILLS } from "../game/hill-choice";
import { startTrainingJump } from "../game/training-session";
import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { UI_TEXT } from "../text/ui-text";
import { FrameBuffer } from "./frame-buffer";
import { NEEDED_TOP_PX, VIEW_MIN_WIDTH_PX, drawJumpView, type JumpViewModel } from "./jump-view";
import { BAR_HEIGHT_PX, drawBar } from "./jump-view-hud";
import { textWidth } from "./pixel-font";
import { LINE_COLOUR, distanceLines } from "./scene-hill";

const hill = OWN_HILLS[0];
const WIDTH_PX = 356;
const HEIGHT_PX = 200;
const SIDE_PX = 5;

const HUD: ContestJumpHud = {
  neededPoints: 156.4,
  neededDistanceM: 127,
  totalBeforePoints: 20.1,
  firstDistanceM: 27.5,
  otherTotalsPoints: [100, 50.4, 30],
};

function modelOf(state: JumpSimState, contest?: ContestJumpHud): JumpViewModel {
  if (!hill) throw new Error("no hill");
  return {
    profile: hill.profile,
    kPointM: hill.kPointM,
    look: hill.look,
    hillName: hill.name,
    playerName: "GRACZ 1",
    state,
    controls: "mouse",
    frame: state.logic.frame,
    over: false,
    hints: false,
    ...(contest === undefined ? {} : { contest }),
  };
}

const gateState = (): JumpSimState => {
  if (!hill) throw new Error("no hill");
  return startTrainingJump(hill, 1).state;
};

const draw = (m: JumpViewModel, width = WIDTH_PX): FrameBuffer => {
  const fb = new FrameBuffer(width, HEIGHT_PX);
  drawJumpView(fb, m);
  return fb;
};

/** Whether rows `from`..`to` (inclusive) of two pictures differ in columns `x0`..`x1` (exclusive). */
function differs(a: FrameBuffer, b: FrameBuffer, from: number, to: number, x0 = 0, x1 = a.width): boolean {
  for (let y = from; y <= to; y++) {
    for (let x = x0; x < x1; x++) if (a.pixels[y * a.width + x] !== b.pixels[y * b.width + x]) return true;
  }
  return false;
}

describe("the line of the distance that would lead", () => {
  const marks = { kPointM: 85, firstMarkM: 70, markCount: 1, fenceColour: 0xc0, fenceStartM: 0 };

  it("comes last, in a colour of its own, measured as the K point is", () => {
    const lines = distanceLines(marks, 91.5, 127);
    expect(lines.at(-1)).toEqual({ distanceM: 127.15, colour: LINE_COLOUR.target });
    expect(lines.slice(0, -1)).toEqual(distanceLines(marks, 91.5));
    const others: number[] = [LINE_COLOUR.mark, LINE_COLOUR.kPoint, LINE_COLOUR.record];
    expect(others).not.toContain(LINE_COLOUR.target);
  });

  it("is not there without a competition", () => {
    expect(distanceLines(marks, 91.5)).toHaveLength(3);
  });
});

describe("the points needed to lead, on the gate", () => {
  it("are written under the wind box while the countdown runs, and fit the narrowest picture", () => {
    const state = gateState();
    expect(state.logic.phase).toBe(PHASE.gate);
    expect(state.logic.startCountdown).toBeGreaterThan(0);
    const text = UI_TEXT.hud.neededToLead("156,4", "127");
    expect(SIDE_PX + textWidth(text)).toBeLessThanOrEqual(VIEW_MIN_WIDTH_PX - SIDE_PX);
    const plain = draw(modelOf(state));
    const shown = draw(modelOf(state, HUD));
    expect(differs(plain, shown, NEEDED_TOP_PX - 2, NEEDED_TOP_PX + 9)).toBe(true);
    // Nothing of it above its rows: the hill's name, the wind box and the start light stay as they were.
    expect(differs(plain, shown, 0, NEEDED_TOP_PX - 3)).toBe(false);
    const narrow = draw(modelOf(state, HUD), VIEW_MIN_WIDTH_PX);
    expect(differs(draw(modelOf(state), VIEW_MIN_WIDTH_PX), narrow, 0, NEEDED_TOP_PX - 3)).toBe(false);
  });

  it("are not written without a value, once the gate opens, or after the countdown", () => {
    const state = gateState();
    const plain = draw(modelOf(state));
    const none = draw(modelOf(state, { ...HUD, neededPoints: null, neededDistanceM: null }));
    expect(differs(plain, none, 0, HEIGHT_PX - 1)).toBe(false);
    const late = { ...state, logic: { ...state.logic, startCountdown: 0 } };
    const lateNoLine = { ...HUD, neededDistanceM: null };
    // The line still needs a distance; without it only the text could differ, and it is not written.
    expect(differs(draw(modelOf(late)), draw(modelOf(late, { ...lateNoLine, neededPoints: 156.4 })), 0, 199)).toBe(
      false,
    );
    const open = { ...state, logic: { ...state.logic, phase: PHASE.inrun } };
    expect(differs(draw(modelOf(open)), draw(modelOf(open, { ...lateNoLine, neededPoints: 156.4 })), 0, 199)).toBe(
      false,
    );
  });
});

/** A jump that is over: 95,5 m for 30,3 points. */
function finished(): JumpSimState {
  const s = gateState();
  return { ...s, logic: { ...s.logic, finished: true, distanceM: 95.6, distanceHalfM: 95.5, points: 30.3 } };
}

describe("the bar after a competition jump", () => {
  const bar = (contest?: ContestJumpHud): FrameBuffer => {
    const fb = new FrameBuffer(WIDTH_PX, HEIGHT_PX);
    drawBar(fb, modelOf(finished(), contest), HEIGHT_PX - BAR_HEIGHT_PX, true);
    return fb;
  };
  const top = HEIGHT_PX - BAR_HEIGHT_PX + 1;
  const bottom = HEIGHT_PX - 2;

  it("holds the total and the place after the jump in the right field", () => {
    const right = UI_TEXT.hud.contestTotal("50,4", 2);
    const points = UI_TEXT.hud.points("30,3");
    const contest = bar({ ...HUD, firstDistanceM: null });
    const training = bar();
    const fieldAt = WIDTH_PX - SIDE_PX - Math.max(textWidth(right), textWidth(points));
    expect(differs(contest, training, top, bottom, fieldAt, WIDTH_PX)).toBe(true);
    // The distance and the name stay where training has them.
    expect(differs(contest, training, top, bottom, 0, fieldAt)).toBe(false);
  });

  it("holds both distances in the second round, the first left of this one", () => {
    const first = bar(HUD);
    const one = bar({ ...HUD, firstDistanceM: null });
    const middle = Math.round(WIDTH_PX * 0.47);
    expect(differs(first, one, top, bottom, middle - textWidth(UI_TEXT.hud.distance("27,5")) - 12, middle)).toBe(true);
    expect(differs(first, one, top, bottom, middle, WIDTH_PX)).toBe(false);
  });
});
