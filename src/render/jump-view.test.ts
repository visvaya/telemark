import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { isJumpOver, presentationFrame, startTrainingJump, stepTrainingJump } from "../game/training-session";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import { VIEW_HEIGHT_PX, drawJumpView, pictureScale, viewWidthFor, type Scenery } from "./jump-view";
import { prompt } from "./jump-view-hud";
import type { ControlScheme } from "./jump-view-model";
import { hudColour } from "./scene-palette";
import { textWidth } from "./pixel-font";
import { fnv } from "./test-support/frame-hash";
import { JUMP_VIEW_HILL_FILES } from "./test-support/jump-view-hills.cases";

/** The narrowest pictures the game draws, in game pixels, and the room a prompt leaves at each side. */
const NARROWEST_PHONE_PX = 256;
const NARROWEST_DESKTOP_PX = 320;
const PROMPT_MARGIN_PX = 2;
/**
 * Several tests here simulate and draw whole jumps: about 1.5 s each alone, but up to 8 s on a slow laptop running
 * the whole suite, past the default limit of 5 s.
 */
const WHOLE_JUMP_TIMEOUT_MS = 30_000;

/** Mean of the colour channels over the whole frame. */
function brightness(fb: FrameBuffer): number {
  let sum = 0;
  for (const p of fb.pixels) sum += (p & 0xff) + ((p >>> 8) & 0xff) + ((p >>> 16) & 0xff);
  return sum / fb.pixels.length;
}

/** The bottom bar (interface). */
function barRows(fb: FrameBuffer): Uint32Array {
  return fb.pixels.slice(fb.width * (VIEW_HEIGHT_PX - 11));
}

describe("jump view", { timeout: WHOLE_JUMP_TIMEOUT_MS }, () => {
  it("fits the logical width to the screen with square pixels", () => {
    expect(viewWidthFor(1920, 1080)).toBe(356);
    expect(viewWidthFor(1280, 800)).toBe(320);
    expect(viewWidthFor(1920, 875)).toBe(439);
    expect(viewWidthFor(2560, 1080)).toBe(474);
    expect(viewWidthFor(3440, 1300)).toBe(480);
    expect(viewWidthFor(390, 844)).toBe(256);
    expect(viewWidthFor(0, 0)).toBe(356);
  });

  it("scales the picture by all the room there is, and never under one device pixel per game pixel", () => {
    expect(pictureScale(5.4)).toBe(5.4);
    expect(pictureScale(3)).toBe(3);
    expect(pictureScale(0.6)).toBe(1);
  });

  it("on touch prompts to land with the right zone, and for the next jump as soon as the notes are up", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    let jump = startTrainingJump(hill, 7);
    const bot = makeBot(
      hill.profile,
      { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: () => 0 },
      () => jump.state,
    );
    const schemes: readonly ControlScheme[] = ["touch", "tilt", "mouse"];
    /** Every distinct prompt seen in flight and once the notes are up, per control scheme. */
    const inFlight = new Set<string>();
    const notesUpWhileMoving = new Set<string>();
    const withoutHints = new Set<string>();
    for (let f = 0; f < 3000 && !isJumpOver(jump); f++) {
      jump = stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
      const frame = presentationFrame(jump);
      const notesShown = notesShownBy(jump.state.logic, frame);
      const model = { profile: hill.profile, kPointM: hill.kPointM, hillName: hill.name, playerName: "GRACZ 1" };
      const flying = jump.state.logic.phase === PHASE.flight;
      for (const controls of schemes) {
        const lines = prompt({ ...model, state: jump.state, controls, frame, over: false }, notesShown);
        if (flying) inFlight.add(`${controls}: ${lines.join(" / ")}`);
        // From the gate to the last note: with the prompts switched off nothing is said at any point.
        const hidden = prompt({ ...model, state: jump.state, controls, frame, over: false, hints: false }, notesShown);
        withoutHints.add(hidden.join(" / "));
        if (notesShown) notesUpWhileMoving.add(`${controls}: ${lines.join(" / ")}`);
      }
    }
    expect([...inFlight]).toEqual([
      "touch: PRZECIĄGAJ W POLU L: POCHYLENIE / P TUŻ NAD ZIEMIĄ: TELEMARK / SZYBKO ZNOWU P: WĄSKI TELEMARK / L+P: NA DWIE NOGI",
      "tilt: PRZECHYLAJ TELEFON: POCHYLENIE / KCIUK TUŻ NAD ZIEMIĄ: TELEMARK / SZYBKO DRUGI: WĄSKI TELEMARK / DWA KCIUKI NARAZ: NA DWIE NOGI",
      "mouse: MYSZ: POCHYLENIE / PRZYCISK TUŻ NAD ZIEMIĄ: TELEMARK / SZYBKO DRUGI PRZYCISK: WĄSKI TELEMARK / OBA NARAZ: NA DWIE NOGI",
    ]);
    // A player who knows the game can switch the prompts off.
    expect([...withoutHints]).toEqual([""]);
    // Every line fits the narrowest picture its way of playing has: a phone held upright, a small window.
    for (const seen of [...inFlight, ...notesUpWhileMoving]) {
      const [controls = "", ...rest] = seen.split(": ");
      const widest = controls === "mouse" ? NARROWEST_DESKTOP_PX : NARROWEST_PHONE_PX;
      for (const line of rest.join(": ").split(" / ")) {
        expect(textWidth(line), `"${line}" on ${controls}`).toBeLessThanOrEqual(widest - 2 * PROMPT_MARGIN_PX);
      }
    }
    // The notes are up while the jumper is still sliding out: that is when the next jump can already start.
    expect([...notesUpWhileMoving]).toEqual([
      "touch: L: JESZCZE RAZ",
      "tilt: DOTKNIJ EKRANU: JESZCZE RAZ",
      "mouse: KLIKNIJ: JESZCZE RAZ   ESC: MENU",
    ]);
  });

  it("shows no judges' notes after a disqualification", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    // Nobody presses start: the countdown runs out and the jump is disqualified.
    let jump = startTrainingJump(hill, 5);
    for (let f = 0; f < 3000 && jump.framesAfterEnd < 50; f++)
      jump = stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(jump.state.logic.finished).toBe(true);
    expect(jump.state.logic.distanceM).toBe(0);
    const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
    const model = {
      profile: hill.profile,
      kPointM: hill.kPointM,
      hillName: hill.name,
      playerName: "GRACZ 1",
      state: jump.state,
    };
    drawJumpView(fb, { ...model, controls: "mouse", frame: presentationFrame(jump), over: true });
    // The column of notes under the wind box: no note box (the boxes' dark fill) in it.
    const column: number[] = [];
    for (let y = 57; y < 57 + 5 * 12; y++) {
      for (let x = fb.width - 31; x < fb.width - 4; x++) column.push(fb.pixels[y * fb.width + x] ?? 0);
    }
    expect(column.includes(hudColour(0x08))).toBe(false);
  });

  it("darkens the scenery at night but keeps the interface colours", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const jump = startTrainingJump(hill, 9);
    const base = {
      profile: hill.profile,
      kPointM: hill.kPointM,
      hillName: hill.name,
      playerName: "GRACZ 1",
      state: jump.state,
    };
    const draw = (scenery: Scenery) => {
      const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
      drawJumpView(fb, { ...base, controls: "mouse", frame: 1, over: false, scenery });
      return fb;
    };
    const day = draw({ lighting: "day", snowfall: false, fog: false });
    const night = draw({ lighting: "night", snowfall: false, fog: false });
    expect(brightness(night)).toBeLessThan(brightness(day) * 0.75);
    // The interface is the same at any time of day.
    expect(barRows(night)).toEqual(barRows(day));
  });

  it("shows a new record from the frame of the landing, blinking as the original's, for 400 frames", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const start = startTrainingJump(hill, 7).state;
    // Landed in the second half of a blink period of the clock: counted from the clock, the line would first be off.
    const landedFrame = 50 * 7 + 30;
    const state = {
      ...start,
      logic: { ...start.logic, finished: true, distanceM: 90, distanceHalfM: 90, landedFrame },
    };
    const draw = (frame: number, newRecord: boolean) => {
      const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
      const model = { profile: hill.profile, kPointM: hill.kPointM, hillName: hill.name, playerName: "GRACZ 1" };
      drawJumpView(fb, { ...model, state, controls: "mouse", frame, over: false, newRecord });
      return fnv(fb.bytes);
    };
    const shown = (since: number) => draw(landedFrame + since, true) !== draw(landedFrame + since, false);
    expect([0, 23, 24, 49, 50, 73, 74].map(shown)).toEqual([true, true, false, false, true, true, false]);
    expect([350, 373, 399, 400, 450].map(shown)).toEqual([true, true, false, false, false]);
  });

  it("writes the new distance, the one it beat and how storing it went, each on a line of its own", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const start = startTrainingJump(hill, 7).state;
    const landedFrame = 300;
    const state = {
      ...start,
      logic: { ...start.logic, finished: true, distanceM: 91.37, distanceHalfM: 91, landedFrame },
    };
    const model = { profile: hill.profile, kPointM: hill.kPointM, hillName: hill.name, playerName: "GRACZ 1" };
    const rows = (extra: object) => {
      const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
      drawJumpView(fb, {
        ...model,
        state,
        controls: "mouse",
        frame: landedFrame,
        over: false,
        newRecord: true,
        ...extra,
      });
      return fnv(fb.bytes);
    };
    const bare = rows({});
    const withOld = rows({ previousRecordM: 88.5 });
    const withSave = rows({ previousRecordM: 88.5, recordSave: "saved" });
    expect(new Set([bare, withOld, withSave]).size).toBe(3);
    expect(rows({ previousRecordM: 88.5, recordSave: "failed" })).not.toBe(withSave);
  });
});

describe("the own hills' jump view tests", () => {
  it("are split among exactly the files that take a share each, so no hill is left out", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const files = readdirSync(here).filter((name) => /^jump-view\.hills-\d+\.test\.ts$/.test(name));
    const expected = Array.from({ length: JUMP_VIEW_HILL_FILES }, (_v, i) => `jump-view.hills-${i + 1}.test.ts`);
    expect(files.toSorted()).toEqual(expected.toSorted());
  });
});
