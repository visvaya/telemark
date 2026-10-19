import { describe, expect, it } from "vitest";
import { OWN_HILLS, type HillChoice } from "../game/hill-choice";
import { isJumpOver, presentationFrame, startTrainingJump, stepTrainingJump } from "../game/training-session";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import {
  FALLEN_MAX_HEIGHT_M,
  TROUGH_FALLEN_HALF_WIDTH_M,
  TROUGH_FALLEN_MAX_HEIGHT_M,
  TITLE_AT_PX,
  VIEW_HEIGHT_PX,
  drawJumpView,
  figureHalfWidthM,
  figurePoints,
  pictureScale,
  viewWidthFor,
  type Scenery,
} from "./jump-view";
import { inrunYM, terrainYM } from "../sim/hill-profile";
import { HUD_TOP_RIGHT_RESERVED_PX, prompt } from "./jump-view-hud";
import type { ControlScheme } from "./jump-view-model";
import { hudColour } from "./scene-palette";
import { drawText, textWidth } from "./pixel-font";
import { color } from "./palette";
import { VIEW_MIN_WIDTH_PX } from "./view-size";
import { TITLE_PAUSE_INSET_WORST_PX } from "../hills/hill-title";
import { UI_TEXT } from "../text/ui-text";
import { fnv } from "./test-support/frame-hash";

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

  it("shows a new record from the frame of the landing, whatever the clock says", () => {
    const hill = OWN_HILLS[0];
    if (!hill) throw new Error("no hill");
    const start = startTrainingJump(hill, 7).state;
    // Landed in the second half of a blink period of the clock: counted from the clock, the line would first be off.
    const landedFrame = 35 * 7 + 20;
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
    expect(draw(landedFrame, true)).not.toBe(draw(landedFrame, false));
    expect(draw(landedFrame + 34, true)).not.toBe(draw(landedFrame + 34, false));
    expect(draw(landedFrame + 35, true)).toBe(draw(landedFrame + 35, false));
    expect(draw(landedFrame + 70, true)).not.toBe(draw(landedFrame + 70, false));
  });
});

/**
 * When a scripted press takes off, as a share of the frames from the start of the inrun to the edge of the takeoff
 * on the hill at hand (259 frames on own-3, where these shares give 104, 174 and 212 frames).
 */
const TAKEOFF_SHARE = { farTooEarly: 0.4, early: 0.67, justBeforeEdge: 0.82 } as const;

/** Frames from the start of the inrun until the jumper, never pressing takeoff, passes the edge of the takeoff. */
function inrunFramesToEdge(hill: HillChoice): number {
  let jump = startTrainingJump(hill, 7);
  let start = -1;
  for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
    if (start < 0 && jump.state.logic.phase === PHASE.inrun) start = f;
    if (start >= 0 && jump.state.jumper.xM >= hill.profile.takeoffXM) return f - start;
    jump = stepTrainingJump(jump, { left: start < 0 && f === 70, right: false, dy: 0 });
  }
  throw new Error(`the jumper never reaches the edge on ${hill.id}`);
}

/** Every own hill: how a hill is drawn is checked on each, from its own data. */
const HILLS: readonly { id: string; hill: HillChoice }[] = OWN_HILLS.map((hill) => ({ id: hill.id, hill }));

/** Columns and rows (first and last) of the pixels that differ between two frames of the same size; null if none. */
function changedBox(a: FrameBuffer, b: FrameBuffer): { x: [number, number]; y: [number, number] } | null {
  let box: { x: [number, number]; y: [number, number] } | null = null;
  a.pixels.forEach((p, i) => {
    if (p === b.pixels[i]) return;
    const x = i % a.width;
    const y = (i - x) / a.width;
    box =
      box === null
        ? { x: [x, x], y: [y, y] }
        : { x: [Math.min(box.x[0], x), Math.max(box.x[1], x)], y: [Math.min(box.y[0], y), Math.max(box.y[1], y)] };
  });
  return box;
}

/** Columns and rows (first and last) of the ink of a text drawn alone at (x, y). */
function textInkBox(text: string, x: number, y: number): { x: [number, number]; y: [number, number] } | null {
  const width = x + textWidth(text) + 20;
  const blank = new FrameBuffer(width, VIEW_HEIGHT_PX);
  const inked = new FrameBuffer(width, VIEW_HEIGHT_PX);
  drawText(inked, x, y, text, color("white"));
  return changedBox(inked, blank);
}

describe.each(HILLS)("jump view on $id", { timeout: WHOLE_JUMP_TIMEOUT_MS }, ({ hill }) => {
  const framesToEdge = inrunFramesToEdge(hill);

  it("draws the whole title, clear of the wind box and the start light, in the narrowest picture", () => {
    // The pause button over the title's corner pushes the title right by the most it can.
    const state = startTrainingJump(hill, 9).state;
    const draw = (titleTopPx: number) => {
      const fb = new FrameBuffer(VIEW_MIN_WIDTH_PX, VIEW_HEIGHT_PX);
      drawJumpView(fb, {
        profile: hill.profile,
        kPointM: hill.kPointM,
        look: hill.look,
        hillName: hill.name,
        playerName: "GRACZ 1",
        state,
        controls: "touch",
        frame: 1,
        over: false,
        titleInsetPx: TITLE_PAUSE_INSET_WORST_PX,
        titleTopPx,
      });
      return fb;
    };
    // The title's ink is what changes when the title is moved out of the picture.
    const title = changedBox(draw(TITLE_AT_PX.y), draw(-VIEW_HEIGHT_PX));
    const label = UI_TEXT.hillLabel(hill.name, hill.kPointM);
    const whole = textInkBox(label, TITLE_PAUSE_INSET_WORST_PX, TITLE_AT_PX.y);
    expect(whole).not.toBeNull();
    // Every column and row of the title's ink shows: nothing is cut off or covered by the boxes drawn after it.
    expect(title).toEqual(whole);
    expect(whole?.x[0]).toBeGreaterThanOrEqual(TITLE_PAUSE_INSET_WORST_PX);
    expect(whole?.y[0]).toBeGreaterThanOrEqual(0);
    expect(whole?.x[1]).toBeLessThan(VIEW_MIN_WIDTH_PX - HUD_TOP_RIGHT_RESERVED_PX);
  });

  it.each<[string, Scenery]>([
    ["day", { lighting: "day", snowfall: false, fog: false }],
    ["night with snow", { lighting: "night", snowfall: true, fog: false }],
    ["dusk with fog", { lighting: "dusk", snowfall: false, fog: true }],
  ])(
    "draws every phase of a jump (%s) without leaving unpainted pixels, the same way each time",
    (_name, scenery) => {
      const render = () => {
        let jump = startTrainingJump(hill, 7);
        const bot = makeBot(
          hill.profile,
          { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2.5, leanPattern: () => 0 },
          () => jump.state,
        );
        const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
        const hashes: string[] = [];
        let unpainted = 0;
        // Past the end of the jump too, while the judges' notes appear.
        for (let f = 0; f < 3000 && jump.framesAfterEnd < 200; f++) {
          jump = stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
          const frame = presentationFrame(jump);
          if (frame % 100 === 0) {
            fb.pixels.fill(0);
            drawJumpView(fb, {
              profile: hill.profile,
              kPointM: hill.kPointM,
              look: hill.look,
              hillName: hill.name,
              playerName: "GRACZ 1",
              state: jump.state,
              controls: "touch",
              frame,
              over: isJumpOver(jump),
              recordM: 80,
              newRecord: true,
              scenery,
            });
            unpainted += fb.pixels.filter((p) => p === 0).length;
            hashes.push(fnv(fb.bytes));
          }
        }
        return { hashes, unpainted };
      };
      const first = render();
      expect(first.hashes.length).toBeGreaterThan(5);
      expect(first.unpainted).toBe(0);
      expect(render()).toEqual(first);
      // Two whole jumps are drawn frame by frame; on a slow or busy machine that takes longer than the default.
    },
    30_000,
  );

  it("keeps the drawn figure on the snow and within the hill, even in a fall", () => {
    // No landing press at all: the jumper crashes and the pose flails.
    let jump = startTrainingJump(hill, 11);
    const bot = makeBot(
      hill.profile,
      { startFrame: 70, takeoffLeadM: 3, landingHeightM: null, leanPattern: () => 0 },
      () => jump.state,
    );
    let crashed = false;
    let highestWhileLying = -Infinity;
    for (let f = 0; f < 3000 && !isJumpOver(jump); f++) {
      jump = stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
      const s = jump.state;
      if (s.logic.fallType !== 0) crashed = true;
      const limit = figureHalfWidthM(hill.profile, s.jumper.xM);
      const lying = s.logic.fallType !== 0 && !s.jumper.airborne;
      for (const p of figurePoints(hill.profile, s)) {
        expect(Math.abs(p.z)).toBeLessThanOrEqual(limit);
        // Near the jumper the terrain is close to its tangent plane; allow for the curvature over a ski's length.
        const terrain = terrainYM(hill.profile, s.jumper.xM + p.x);
        expect(s.jumper.yM + p.y).toBeGreaterThanOrEqual(terrain - 0.2);
        if (lying) highestWhileLying = Math.max(highestWhileLying, s.jumper.yM + p.y - terrain);
      }
    }
    expect(crashed).toBe(true);
    // Lying in the snow, no ski stands up past the fences.
    expect(highestWhileLying).toBeGreaterThan(-Infinity);
    expect(highestWhileLying).toBeLessThanOrEqual(FALLEN_MAX_HEIGHT_M + 0.2);
  });

  it("keeps a jumper fallen back onto the inrun inside its trough, bounces included", () => {
    // Both buttons pressed far too early: the jumper leaves the track and comes down on it before the takeoff.
    let jump = startTrainingJump(hill, 4);
    let start = -1;
    let checked = 0;
    for (let f = 0; f < 3000 && !isJumpOver(jump); f++) {
      if (start < 0 && jump.state.logic.phase === PHASE.inrun) start = f;
      const farTooEarly = Math.round(TAKEOFF_SHARE.farTooEarly * framesToEdge);
      const early = start >= 0 && f - start >= farTooEarly && f - start < farTooEarly + 4;
      jump = stepTrainingJump(jump, { left: (start < 0 && f === 70) || early, right: early, dy: 0 });
      const s = jump.state;
      if (s.logic.fallType === 0 || s.jumper.xM >= hill.profile.takeoffXM) continue;
      for (const p of figurePoints(hill.profile, s)) {
        expect(Math.abs(p.z)).toBeLessThanOrEqual(TROUGH_FALLEN_HALF_WIDTH_M);
        const track = inrunYM(hill.profile, s.jumper.xM + p.x);
        // The track is close to its tangent plane over a ski's length.
        expect(s.jumper.yM + p.y - track).toBeLessThanOrEqual(TROUGH_FALLEN_MAX_HEIGHT_M + 0.2);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it.each([
    ["far too early", TAKEOFF_SHARE.farTooEarly],
    ["early", TAKEOFF_SHARE.early],
    ["just before the edge", TAKEOFF_SHARE.justBeforeEdge],
    ["never", null],
  ] as const)("keeps the figure on the track or the snow and within the width: takeoff %s", (_, share) => {
    const takeoffAfter = share === null ? null : Math.round(share * framesToEdge);
    let jump = startTrainingJump(hill, 7);
    let start = -1;
    let tookOffAt: number | null = null;
    for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
      if (start < 0 && jump.state.logic.phase === PHASE.inrun) start = f;
      const t = start < 0 ? -1 : f - start;
      const take = takeoffAfter !== null && t >= takeoffAfter && t < takeoffAfter + 4;
      jump = stepTrainingJump(jump, { left: (start < 0 && f === 70) || take, right: take, dy: 0 });
      const s = jump.state;
      if (tookOffAt === null && s.logic.phase === PHASE.takeoff) tookOffAt = t;
      const limit = figureHalfWidthM(hill.profile, s.jumper.xM);
      for (const p of figurePoints(hill.profile, s)) {
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(limit);
        const x = s.jumper.xM + p.x;
        const floor = x < hill.profile.takeoffXM ? inrunYM(hill.profile, x) : terrainYM(hill.profile, x);
        // The figure keeps to the plane of the ground under the jumper, which bends away from the terrain a little.
        expect(s.jumper.yM + p.y).toBeGreaterThanOrEqual(floor - 0.25);
      }
    }
    // The press is what starts the takeoff, at the frame meant, so each case jumps from its own place on the inrun.
    expect(tookOffAt).toBe(takeoffAfter);
  });
});
