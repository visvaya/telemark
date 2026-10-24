import { resultAfterJump } from "../game/competition-board";
import { PHASE } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import type { FrameBuffer } from "./frame-buffer";
import type { ControlScheme, JumpViewModel } from "./jump-view-model";
import { roundHalfEven } from "../sim/pascal-numeric";
import { color } from "./palette";
import { hudColour } from "./scene-palette";
import { rowRunLine } from "./scene-lines";
import { drawText, textWidth } from "./pixel-font";
import { formatDecimal } from "../text/decimal";
import { UI_TEXT } from "../text/ui-text";

const PHASE_LABEL = UI_TEXT.hud.phase;

/**
 * The bar at the foot of the picture, 13 rows as in the original: its top line, two rows for a mark over a capital,
 * the capitals, and three rows for an ogonek or the tail of a letter and the bottom line.
 */
export const BAR_HEIGHT_PX = 13;
/** Where the capitals of the bar start, from its top line, and the margin of its texts from the sides. */
const BAR_TEXT_TOP_PX = 3;
const BAR_TEXT_SIDE_PX = 5;
/** The bar's frame: palette indices of its fill, top line, left column and bottom line. */
const BAR = { fill: 0x05, top: 0x11, left: 0x0a, bottom: 0x08 } as const;
/** Notes under the wind box: the first box's row, the step between boxes, a box's size and its text's inset. */
const NOTES_TOP_PX = 57;
const NOTES_STEP_PX = 12;
const NOTE_BOX = { width: 27, height: 11, inset: 2 } as const;
const NOTE_CHARS = 4;
/**
 * Characters of the field the distance is written in, right-aligned as the original's `Str(x:5:1)` writes it (a
 * distance under 100 m starts one character further right).
 */
const BAR_DISTANCE_CHARS = 5;

/** How far right a number starts in a field `chars` characters wide, right-aligned in it. */
const fieldInsetPx = (text: string, chars: number) => Math.max(0, textWidth("0".repeat(chars)) - textWidth(text));
/**
 * Colours of the texts: ramps of the original's palette (its bar texts 0x79, its wind speed and counted notes 0xCC,
 * dropped notes 0xC7); the phase and warnings are this project's, in ramps of the same palette. The speed is this
 * project's too, in plain white: the grey ramp has 64 steps, so the font's shadow five steps down would hardly show.
 */
export const INK = {
  bar: 0x79,
  wind: 0xcc,
  note: 0xcc,
  noteDim: 0xc7,
  warning: 0x4c,
  phase: 0x58,
} as const;
const MS_TO_KMH = 3.6;

/** The wind box and the start light, as the original's bitmaps lie on its 320 columns (resources 11 and 13). */
const WIND_BOX = { right: 4, top: 3, width: 29, height: 26 } as const;
const START_LIGHT = { gap: 4, width: 16 } as const;
/** Columns the wind box and the start light take at the right of the picture's top, with the gap left of them. */
export const HUD_TOP_RIGHT_RESERVED_PX = WIND_BOX.right + WIND_BOX.width + 2 * START_LIGHT.gap + START_LIGHT.width;
/** Columns the wind box and the notes under it take at the right of the picture once the jumper has landed. */
export const HUD_RIGHT_COLUMN_PX = WIND_BOX.right + Math.max(WIND_BOX.width, NOTE_BOX.width);
/** Bevelled frame of both boxes: palette indices of the inside, the top, left, right and bottom edges. */
const FRAME = { inside: 0x08, top: 0x18, topCorner: 0xe6, left: 0x14, right: 0x0c, bottom: 0xe4, bottomLeft: 0xe5 };

/** A box with the original's bevelled frame. */
function hudBox(fb: FrameBuffer, x: number, y: number, w: number, h: number): void {
  fb.rect(x, y, w, h, hudColour(FRAME.inside));
  fb.rect(x, y, w, 1, hudColour(FRAME.top));
  fb.rect(x, y + 1, 1, h - 2, hudColour(FRAME.left));
  fb.rect(x + w - 1, y + 1, 1, h - 1, hudColour(FRAME.right));
  fb.rect(x, y + h - 1, w - 1, 1, hudColour(FRAME.bottom));
  fb.put(x, y, hudColour(FRAME.topCorner));
  fb.put(x + w - 1, y, hudColour(FRAME.topCorner));
  fb.put(x, y + h - 1, hudColour(FRAME.bottomLeft));
}

function windBoxLeft(fb: FrameBuffer): number {
  return fb.width - WIND_BOX.right - WIND_BOX.width;
}

/** 1cb6:1ee9: the arrow's half length along x and y (the cross component squashed to half), barbs' reach and angle. */
const ARROW = { halfX: 11, halfY: 5.5, barbX: 8, barbY: 4, barbRad: 1.25 } as const;
/** Arrow centre in the box, and its shadow (drawn a row lower first) and main colours. */
const ARROW_CENTRE = { x: 13, y: 8 } as const;
const ARROW_SHADOW = 0x44;
const ARROW_COLOUR = 0x47;
/** Where the speed is written in the box. */
const WIND_SPEED_AT = { x: 6, y: 17 } as const;

/** One line of the original's 1f8b:00dc with its 2x2 brush. */
function brushedLine(fb: FrameBuffer, a: readonly [number, number], b: readonly [number, number], c: number): void {
  rowRunLine(a[0], a[1], b[0], b[1], (x, y) => fb.rect(x, y, 2, 2, c));
}

/**
 * The wind box (0baf:3389): the indicator's direction as the original's arrow, the cross component of the wind
 * drawn squashed and pointing down when positive, and the wind's speed under it.
 */
export function drawWindBox(fb: FrameBuffer, s: JumpSimState): void {
  const x = windBoxLeft(fb);
  const y = WIND_BOX.top;
  hudBox(fb, x, y, WIND_BOX.width, WIND_BOX.height);
  const a = s.wind.indicatorDirectionRad;
  const cx = x + ARROW_CENTRE.x;
  const cy = y + ARROW_CENTRE.y;
  const at = (dx: number, dy: number): [number, number] => [roundHalfEven(cx + dx), roundHalfEven(cy + dy)];
  const tail = at(-ARROW.halfX * Math.cos(a), -ARROW.halfY * Math.sin(a));
  const tip = at(ARROW.halfX * Math.cos(a), ARROW.halfY * Math.sin(a));
  const barbs = [a + ARROW.barbRad, a - ARROW.barbRad].map((b) =>
    at(ARROW.barbX * Math.cos(b), ARROW.barbY * Math.sin(b)),
  );
  for (const [colour, shift] of [
    [ARROW_SHADOW, 1],
    [ARROW_COLOUR, 0],
  ] as const) {
    const down = (p: readonly [number, number]): [number, number] => [p[0], p[1] + shift];
    brushedLine(fb, down(tail), down(tip), hudColour(colour));
    for (const barb of barbs) brushedLine(fb, down(tip), down(barb), hudColour(colour));
  }
  const label = formatDecimal(s.wind.speedMPerS, 1);
  drawText(fb, x + WIND_SPEED_AT.x, y + WIND_SPEED_AT.y, label, { ramp: INK.wind });
}

/** The lamps of the start light: rows of a disc from the top, its unlit and lit (dark to light) colours. */
const LAMP_ROWS = [4, 8, 8, 10, 10, 10, 10, 8, 8, 4] as const;
const LAMP_WIDTH_PX = 10;
const LAMP_LEFT_PX = 3;
const LAMPS = {
  red: { top: 2, unlit: 0x44, lit: [0x47, 0x48, 0x49] },
  green: { top: 14, unlit: 0x53, lit: [0x55, 0x56, 0x57] },
} as const;
/** The countdown on the gate: red before it starts, green from this second on, blinking from the next. */
const GREEN_FROM_SECOND = 15;
const BLINK_FROM_SECOND = 10;
const FRAMES_PER_SECOND = 70;
const BLINK_LIT_FRAMES = 25;

/** A lamp of the start light, lit from the upper left. */
function drawLamp(fb: FrameBuffer, x: number, y: number, lamp: (typeof LAMPS)[keyof typeof LAMPS], lit: boolean) {
  LAMP_ROWS.forEach((width, row) => {
    const from = (LAMP_WIDTH_PX - width) / 2;
    for (let i = 0; i < width; i++) {
      const dx = from + i;
      const shade = Math.min(2, Math.max(0, Math.floor(2.6 - (dx + row) / 7)));
      const index = lit ? (lamp.lit[shade] ?? lamp.unlit) : lamp.unlit;
      fb.put(x + dx, y + row, hudColour(index));
    }
  });
}

/**
 * The start light left of the wind box while the jumper waits on the gate (0baf:5581): red at first, green once
 * the countdown runs, blinking in its last ten seconds, red again when the time is up.
 */
export function drawStartLight(fb: FrameBuffer, s: JumpSimState): void {
  const L = s.logic;
  if (L.frame <= 1 || L.phase >= PHASE.inrun) return;
  const x = windBoxLeft(fb) - START_LIGHT.gap - START_LIGHT.width;
  const y = WIND_BOX.top;
  hudBox(fb, x, y, START_LIGHT.width, WIND_BOX.height);
  const left = L.startCountdown;
  const green =
    left > 0 &&
    left <= GREEN_FROM_SECOND &&
    (left > BLINK_FROM_SECOND || L.frame % FRAMES_PER_SECOND < BLINK_LIT_FRAMES);
  const red = left > GREEN_FROM_SECOND || left <= 0;
  drawLamp(fb, x + LAMP_LEFT_PX, y + LAMPS.red.top, LAMPS.red, red);
  drawLamp(fb, x + LAMP_LEFT_PX, y + LAMPS.green.top, LAMPS.green, green);
}

/** Frames after the last note during which all notes stay dim, before the counted ones light up (0baf:5988). */
const NOTES_SETTLE_FRAMES = 45;

/**
 * Judges' notes in a column under the wind box, each from its own frame; once all are shown and a moment has
 * passed, the three that count light up and the two discarded ones stay dim.
 */
export function drawNotes(fb: FrameBuffer, s: JumpSimState, frame: number): void {
  const x = fb.width - WIND_BOX.right - NOTE_BOX.width;
  let y = NOTES_TOP_PX;
  const lastShown = Math.max(...s.logic.judges.map((j) => j.showFrame));
  const settled = frame >= lastShown + NOTES_SETTLE_FRAMES;
  for (const judge of s.logic.judges) {
    if (frame < judge.showFrame) continue;
    hudBox(fb, x, y, NOTE_BOX.width, NOTE_BOX.height);
    const label = formatDecimal(judge.note, 1);
    // Right-aligned in a field of four characters, as the original writes Str(note:4:1).
    drawText(fb, x + NOTE_BOX.inset + fieldInsetPx(label, NOTE_CHARS), y + NOTE_BOX.inset, label, {
      ramp: settled && judge.counted ? INK.note : INK.noteDim,
    });
    y += NOTES_STEP_PX;
  }
}

function phaseLabel(s: JumpSimState): string {
  const phase = s.logic.phase;
  if (phase === PHASE.crash) return PHASE_LABEL.crash;
  if (phase === PHASE.gate) return PHASE_LABEL.gate;
  if (phase <= PHASE.crouch) return PHASE_LABEL.inrun;
  if (phase <= PHASE.afterTakeoff) return PHASE_LABEL.takeoff;
  if (phase <= PHASE.flight) return PHASE_LABEL.flight;
  if (phase <= PHASE.landing) return PHASE_LABEL.landing;
  return PHASE_LABEL.outrun;
}

/**
 * What the screen asks for, per way of playing. With finger steering the buttons are the zones L and P; with
 * tilt steering there are no zones: the first thumb on the screen is the left button and the second the right.
 */
interface Prompts {
  nextJump: string;
  /** Under the next jump's prompt once the jumper stands still: how to watch and keep the jump. */
  replayReady: string;
  /** What pauses a replay, and how to reach the menu. */
  replay: string;
  /** Once a replay of the original is over: what opens the menu. */
  replayMenu: string;
  start: string;
  takeoff: string;
  lean: string;
  telemark: string;
  /** The second button: it ends the preparation, so pressed quickly after the first it gives a narrow telemark. */
  width: string;
  twoFeet: string;
}

const PROMPTS: Readonly<Record<ControlScheme, Prompts>> = UI_TEXT.hud.prompts;

export function prompt(m: JumpViewModel, nextJumpAllowed: boolean): readonly string[] {
  const text = PROMPTS[m.controls];
  if (m.replay) {
    // The replay is always named, so it is not taken for a jump; once it is over a press starts a new jump.
    const { speedLabel, paused, menuAtEnd } = m.replay;
    const title = paused ? UI_TEXT.hud.replayPaused(speedLabel) : UI_TEXT.hud.replay(speedLabel);
    if (m.hints === false) return [title];
    if (!nextJumpAllowed) return [title, text.replay];
    return [title, menuAtEnd ? text.replayMenu : text.nextJump];
  }
  // A player who knows the game can switch every prompt on the hill off.
  if (m.hints === false) return [];
  const phase = m.state.logic.phase;
  // The next jump can start as soon as the notes are up; the jumper may still be sliding out. Once the jumper
  // stands still the jump can be watched again and kept (keys P and S, or the menu).
  if (nextJumpAllowed) return m.over ? [text.nextJump, text.replayReady] : [text.nextJump];
  if (phase === PHASE.gate) return [text.start];
  if (phase === PHASE.inrun || phase === PHASE.crouch) return [text.takeoff];
  // The original starts the landing (telemark) on a press of either button; about 0.4 s before touchdown scores
  // best. The other button then ends the preparation: quickly after the first it gives a narrow telemark, later a
  // wider one. Both buttons
  // at once land on two feet: safer on a very long jump, with lower notes.
  if (phase === PHASE.flightHold || phase === PHASE.flight) {
    return [text.lean, text.telemark, text.width, text.twoFeet];
  }
  return [];
}

/** Spaces between the two distances of the second round in the bar. */
const BAR_DISTANCE_GAP = "  ";

/** The bar's right field after the notes: the jump's points, or in a competition the total and the place. */
function barRightText(m: JumpViewModel, points: number): string {
  if (m.contest === undefined) return UI_TEXT.hud.points(formatDecimal(points, 1));
  const after = resultAfterJump(m.contest, points);
  return UI_TEXT.hud.contestTotal(formatDecimal(after.totalPoints, 1), after.place);
}

/** Bottom bar: player, then the phase and speed; after the jump the distance (half metres) and points, as in the original. */
export function drawBar(fb: FrameBuffer, m: JumpViewModel, top: number, notesShown: boolean): void {
  const s = m.state;
  const L = s.logic;
  fb.rect(0, top, fb.width, BAR_HEIGHT_PX, hudColour(BAR.fill));
  fb.rect(0, top, fb.width, 1, hudColour(BAR.top));
  fb.rect(0, top + 1, 1, BAR_HEIGHT_PX - 2, hudColour(BAR.left));
  fb.rect(0, top + BAR_HEIGHT_PX - 1, fb.width, 1, hudColour(BAR.bottom));
  const nameEnd = drawText(fb, BAR_TEXT_SIDE_PX, top + BAR_TEXT_TOP_PX, m.playerName, { ramp: INK.bar });
  const middle = Math.round(fb.width * 0.47);
  if (L.finished && L.distanceM === 0) {
    drawText(fb, middle, top + BAR_TEXT_TOP_PX, UI_TEXT.hud.disqualified, { ramp: INK.warning });
    return;
  }
  if (L.finished) {
    // In a competition the right field holds the total and the place after this jump, as the original's does.
    const right = notesShown ? barRightText(m, L.points) : "";
    // The original writes it from column 248 of its 320; here it ends at the right edge where the speed did,
    // so on a wider picture it does not hang in the middle of the bar.
    const rightAt = fb.width - BAR_TEXT_SIDE_PX - textWidth(right);
    const distance = formatDecimal(L.distanceHalfM, 1);
    const distanceAt = middle + fieldInsetPx(distance, BAR_DISTANCE_CHARS);
    const first = m.contest?.firstDistanceM ?? null;
    // In the second round both distances, the first one before the field of this one, where there is room.
    const firstText = first === null ? "" : `${UI_TEXT.hud.distance(formatDecimal(first, 1))}${BAR_DISTANCE_GAP}`;
    const firstAt = distanceAt - textWidth(firstText);
    if (firstText !== "" && firstAt > nameEnd + BAR_TEXT_SIDE_PX) {
      drawText(fb, firstAt, top + BAR_TEXT_TOP_PX, firstText, { ramp: INK.bar });
    }
    drawText(fb, distanceAt, top + BAR_TEXT_TOP_PX, UI_TEXT.hud.distance(distance), { ramp: INK.bar });
    if (right !== "") drawText(fb, rightAt, top + BAR_TEXT_TOP_PX, right, { ramp: INK.bar });
    return;
  }
  drawText(fb, nameEnd + 10, top + BAR_TEXT_TOP_PX, phaseLabel(s), {
    ramp: L.phase === PHASE.crash ? INK.warning : INK.phase,
  });
  // The simulation keeps `speedMPerS` for the ground; in the air the velocity vector is shown.
  const v = s.jumper.airborne ? Math.hypot(s.jumper.vxMPerS, s.jumper.vyMPerS) : s.jumper.speedMPerS;
  const speed = UI_TEXT.hud.speed(formatDecimal(v * MS_TO_KMH, 1));
  drawText(fb, fb.width - BAR_TEXT_SIDE_PX - textWidth(speed), top + BAR_TEXT_TOP_PX, speed, color("white"));
}
