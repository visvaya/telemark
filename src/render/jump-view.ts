import { DEFAULT_OUTFIT, type Outfit } from "../game/outfit";
import { nextJumpAllowed } from "../game/training-session";
import type { HillProfile } from "../sim/hill-profile";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import { formatDecimal } from "../text/decimal";
import type { JumpSimState } from "../sim/jump-sim";
import { FrameBuffer } from "./frame-buffer";
import { drawSnowfall } from "./jump-view-snowfall";
import { BAR_HEIGHT_PX, drawBar, drawNotes, drawStartLight, drawWindBox, prompt } from "./jump-view-hud";
import { drawGhost } from "./jump-view-ghost";
import { drawHillScene, jumperInPicture } from "./jump-view-scene";
import { DEFAULT_HILL_LOOK, type HillLook } from "./hill-look";
import { drawBirds, drawFloodlights, drawInrunLamps, drawNightSky, drawWindSocks } from "./scene-extras";
import { SQUARE_PIXEL_WIDTH } from "./scene-layers";
import { DAY_SCENERY, type JumpViewModel, type Scenery } from "./jump-view-model";
import { color, withLook } from "./palette";
import { drawText, textWidth } from "./pixel-font";
import { UI_TEXT } from "../text/ui-text";
import { VIEW_HEIGHT_PX, VIEW_MAX_WIDTH_PX, VIEW_MIN_WIDTH_PX } from "./view-size";

export {
  FALLEN_MAX_HEIGHT_M,
  TROUGH_FALLEN_HALF_WIDTH_M,
  TROUGH_FALLEN_MAX_HEIGHT_M,
  figureHalfWidthM,
  figurePoints,
} from "./jump-view-jumper";
export { windSockDirection } from "./scene-extras";
export { type ControlScheme, type JumpViewModel, type Scenery } from "./jump-view-model";

/** Logical height of the original; the width follows the screen's proportions (variant B). */
export { VIEW_HEIGHT_PX, VIEW_MAX_WIDTH_PX, VIEW_MIN_WIDTH_PX } from "./view-size";

/** Logical width for a display area, keeping square pixels and the original height. */
/**
 * Device pixels per game pixel: all the room there is, and never less than one. The picture reaches the edges
 * of its area; a scale that is not whole leaves the game pixels uneven by less than one device pixel.
 */
export function pictureScale(fill: number): number {
  return Math.max(1, fill);
}

export function viewWidthFor(areaWidth: number, areaHeight: number): number {
  if (!(areaWidth > 0 && areaHeight > 0)) return 356;
  const w = Math.round((VIEW_HEIGHT_PX * areaWidth) / areaHeight);
  return Math.min(VIEW_MAX_WIDTH_PX, Math.max(VIEW_MIN_WIDTH_PX, w));
}

/** Rows of the sky bands at the top of the scene; stars and the moon are drawn there only. */
export const SKY_ROWS = 48;
/** The hill's name in the colour the original gives a replay's file name there (0xCB), a new record in 0xCD. */
const TITLE_INK = 0xcb;
/**
 * Where the hill's name starts (the top of its capitals): in the corner where the original writes the replay's
 * file name, as far from the top as from the left, so the mark over a capital stands level with the top of the
 * wind box's frame and not against the edge.
 */
export const TITLE_AT_PX = { x: 5, y: 5 } as const;
const RECORD_INK = 0xcd;
/** Frames per blink phase of the line about a new record (half a second). */
const BLINK_FRAMES = 35;
/** Prompts: the height of a line of text with its spacing, and the gap between the last line and the bar. */
const PROMPT_LINE_PX = 10;
const PROMPT_BOTTOM_GAP_PX = 3;

/** Where in the picture the jumper stands, as shares of its width and height. */
export interface PreviewAnchor {
  xShare: number;
  yShare: number;
}

const PREVIEW_ANCHOR: PreviewAnchor = { xShare: 0.5, yShare: 0.55 };

/** The hill a preview is drawn on. */
export interface PreviewHill {
  profile: HillProfile;
  kPointM: number;
  look: HillLook;
}

/**
 * The jumper on the hill without the interface (outfit preview, icons): the scene of the jump view, cut out
 * around the jumper so that he stands at `anchor` of the picture wherever the scene allows.
 */
export function drawJumperPreview(
  fb: FrameBuffer,
  m: { hill: PreviewHill; state: JumpSimState; outfit: Outfit },
  anchor: PreviewAnchor = PREVIEW_ANCHOR,
): void {
  const width = Math.max(VIEW_MIN_WIDTH_PX, fb.width);
  const height = Math.max(VIEW_HEIGHT_PX, fb.height);
  const scene = new FrameBuffer(width, height);
  withLook({ lighting: "day", fog: false }, () =>
    drawHillScene(
      scene,
      {
        profile: m.hill.profile,
        kPointM: m.hill.kPointM,
        look: m.hill.look,
        state: m.state,
        outfit: m.outfit,
        recordM: 0,
        pixelWidth: SQUARE_PIXEL_WIDTH,
      },
      height - 1,
    ),
  );
  const jumper = jumperInPicture(width, SQUARE_PIXEL_WIDTH);
  const left = Math.min(width - fb.width, Math.max(0, Math.round(jumper.x - anchor.xShare * fb.width)));
  const top = Math.min(height - fb.height, Math.max(0, Math.round(jumper.y - anchor.yShare * fb.height)));
  for (let y = 0; y < fb.height; y++) {
    const from = (top + y) * width + left;
    fb.pixels.set(scene.pixels.subarray(from, from + fb.width), y * fb.width);
  }
}

/**
 * In a competition, while the jumper waits on the gate and its countdown runs, the points that would equal the
 * leader and the distance they take, as the original writes them (0baf:56D8) in its yellow (0xCD). The original
 * writes them where the hill's name stands here, so they go under the wind box, clear of it and the start light.
 */
const NEEDED_INK = 0xcd;
export const NEEDED_TOP_PX = 33;

function drawNeededToLead(fb: FrameBuffer, m: JumpViewModel): void {
  const needed = m.contest?.neededPoints ?? null;
  const distance = m.contest?.neededDistanceM ?? null;
  const L = m.state.logic;
  if (needed === null || distance === null || L.phase !== PHASE.gate || L.startCountdown <= 0) return;
  const text = UI_TEXT.hud.neededToLead(formatDecimal(needed, 1), String(distance));
  drawText(fb, Math.max(TITLE_AT_PX.x, m.titleInsetPx ?? 0), NEEDED_TOP_PX, text, { ramp: NEEDED_INK });
}

/** Draws one frame of the jump at the logical resolution. */
export function drawJumpView(fb: FrameBuffer, m: JumpViewModel): void {
  const scenery = m.scenery ?? DAY_SCENERY;
  withLook({ lighting: scenery.lighting, fog: scenery.fog }, () => drawScene(fb, m, scenery));
}

function drawScene(fb: FrameBuffer, m: JumpViewModel, scenery: Scenery): void {
  const night = scenery.lighting === "night";
  // Fog hides the stars and the moon.
  const clearNight = night && !scenery.fog;
  const s = m.state;
  const h = m.profile;
  const groundBottom = fb.height - BAR_HEIGHT_PX;
  const lightsOn = scenery.lighting !== "day";
  const targetM = m.contest?.neededDistanceM ?? null;
  drawHillScene(
    fb,
    {
      profile: h,
      kPointM: m.kPointM,
      look: m.look ?? DEFAULT_HILL_LOOK,
      state: s,
      outfit: m.outfit ?? DEFAULT_OUTFIT,
      recordM: m.recordM ?? 0,
      ...(targetM === null ? {} : { targetM }),
      pixelWidth: SQUARE_PIXEL_WIDTH,
      ...(scenery.lighting === "day" ? {} : { floodlights: scenery.lighting }),
      ...(m.ghost === undefined ? {} : { ghost: m.ghost, drawGhost: (f, g, a) => drawGhost(f, h, g, a) }),
    },
    groundBottom - 1,
    {
      afterSky: (view, c) => {
        if (clearNight) drawNightSky(c, h, m.look ?? DEFAULT_HILL_LOOK, view, m.frame, SKY_ROWS);
      },
      afterBackground: (view) => {
        if (!night) drawBirds(fb, h, view, m.frame);
      },
      afterFarFence: (view) => {
        if (lightsOn) drawFloodlights(fb, h, view);
        drawWindSocks(fb, h, view, s, m.frame);
      },
      afterInrun: (view, railPx) => {
        if (lightsOn) drawInrunLamps(fb, h, view, railPx);
      },
    },
  );
  if (scenery.snowfall) {
    const cam = { x: s.jumper.xM, y: s.jumper.yM, cx: fb.width / 2, cy: groundBottom / 2 };
    drawSnowfall(fb, m.windDriftM ?? { x: 0, y: 0 }, cam, m.frame, groundBottom);
  }
  // HUD: the hill, the wind box (the only wind reading, as in the original), prompts, notes.
  drawText(
    fb,
    Math.max(TITLE_AT_PX.x, m.titleInsetPx ?? 0),
    m.titleTopPx ?? TITLE_AT_PX.y,
    UI_TEXT.hillLabel(m.hillName, m.kPointM),
    {
      ramp: TITLE_INK,
    },
  );
  drawWindBox(fb, s);
  drawStartLight(fb, s);
  drawNeededToLead(fb, m);
  const finished = s.logic.finished;
  const notesShown = notesShownBy(s.logic, m.frame);
  const lines = prompt(m, nextJumpAllowed(s.logic, m.frame));
  {
    // At the bottom of the picture, above the bar: the jumper is always in its upper part, and three lines in
    // the middle of the sky covered him.
    const firstLineY = groundBottom - PROMPT_BOTTOM_GAP_PX - lines.length * PROMPT_LINE_PX;
    lines.forEach((line, i) => {
      const x = Math.round((fb.width - textWidth(line)) / 2);
      drawText(fb, x, firstLineY + i * PROMPT_LINE_PX, line, color("white"), color("black"));
    });
  }
  // A disqualified jump (no takeoff) is never scored, so there are no notes to show.
  if (finished && s.logic.distanceM > 0) drawNotes(fb, s, m.frame);
  // A new record blinks from the frame the distance appears in the bar, so its first showing is always whole.
  const sinceLanding = m.frame - s.logic.landedFrame;
  if (m.newRecord === true && finished && sinceLanding >= 0 && Math.floor(sinceLanding / BLINK_FRAMES) % 2 === 0) {
    const text = UI_TEXT.hud.newRecord;
    drawText(fb, Math.round((fb.width - textWidth(text)) / 2), 22, text, { ramp: RECORD_INK });
  }
  drawBar(fb, m, groundBottom, notesShown);
}
