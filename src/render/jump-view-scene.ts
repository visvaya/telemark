import type { Outfit } from "../game/outfit";
import { inrunSlope, landingSlope, type HillProfile, inrunYM, landingYM } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import { roundHalfEven } from "../sim/pascal-numeric";
import type { FrameBuffer } from "./frame-buffer";
import type { HillLook } from "./hill-look";
import { drawFigure, drawShadow, type FigureAnchor } from "./jump-view-jumper";
import { drawBackgroundBands, drawFloodlightSpill, drawSky } from "./scene-backdrop";
import {
  distanceLines,
  drawDistanceLines,
  drawFarFence,
  drawLandingHill,
  drawNearFence,
  drawNearGround,
  type HillMarks,
} from "./scene-hill";
import {
  drawGateFar,
  drawGateNear,
  drawInrunBehind,
  drawInrunNearWall,
  drawInrunSupports,
  drawSkiTracks,
  inrunLook,
} from "./scene-inrun";
import {
  LAYER,
  LAYER_SCALE,
  ORIGINAL_PX_PER_M,
  ORIGINAL_ROW_PX_PER_M,
  layerIndex,
  layerOffset,
  sceneView,
  type SceneView,
} from "./scene-layers";
import { drawMountains } from "./scene-mountains";
import { scenePalette } from "./scene-palette";
import { putIndex, sceneCanvas, type SceneCanvas } from "./scene-span";
import { floodlightPalettes, relightLandingHill, relightNearGround } from "./scene-floodlight";
import { drawTrees } from "./scene-trees";

/** The original draws the jumper's foot at column 148 and row 200 - 113, its shadow one column to the left. */
const FIGURE_COLUMN = 148;
const SHADOW_COLUMN = 147;
const FIGURE_ROW = 87;
/** Palette index of the shadow. */
const SHADOW_COLOUR = 0x18;
/** Within this distance of the takeoff both shadows (on the inrun and on the landing hill) are drawn, each cut. */
const SHADOW_SWITCH_M = 2;

export interface HillSceneModel {
  profile: HillProfile;
  kPointM: number;
  look: HillLook;
  state: JumpSimState;
  outfit: Outfit;
  recordM: number;
  /** In a competition, the distance that would lead, drawn as a line of its own; absent otherwise. */
  targetM?: number;
  /** Width of one picture column in the original's columns: 6/5 for square pixels, 1 for the original's screen. */
  pixelWidth: number;
  /**
   * The floodlights, when they are on: at dusk their light reaches the background behind the hill, at night it
   * stays on the hill, weaker away from the masts.
   */
  floodlights?: "dusk" | "night";
  /** Drawn under the player's jumper, in the jumper's plane. */
  ghost?: JumpSimState;
  drawGhost?: (fb: FrameBuffer, ghost: JumpSimState, anchor: FigureAnchor) => void;
}

/** Where the player's jumper stands in a picture `widthPx` columns wide: its foot's column and row. */
export function jumperInPicture(widthPx: number, pixelWidth: number): { x: number; y: number } {
  return { x: (FIGURE_COLUMN - 160) / pixelWidth + widthPx / 2, y: FIGURE_ROW };
}

/** Where the figure of a jumper at (x, y) stands, under a view centred on the player's jumper at (jx, jy). */
function figureAnchor(view: SceneView, x: number, y: number, jx: number, jy: number): FigureAnchor {
  const p = LAYER_SCALE[LAYER.jumper] ?? 1;
  const column = FIGURE_COLUMN + p * ORIGINAL_PX_PER_M * (x - jx);
  return {
    x: (column - 160) / view.pixelWidth + view.widthPx / 2,
    y: FIGURE_ROW + p * ORIGINAL_ROW_PX_PER_M * (jy - y),
    pxPerMX: ORIGINAL_PX_PER_M / view.pixelWidth,
    pxPerMY: ORIGINAL_ROW_PX_PER_M,
  };
}

function marksOf(m: HillSceneModel): HillMarks {
  return { kPointM: m.kPointM, ...m.look.marks };
}

/** The jumper's shadow on the inrun and on the landing hill near the takeoff, each cut at the takeoff. */
function shadow(c: SceneCanvas, m: HillSceneModel, view: SceneView, anchor: FigureAnchor, pal: Uint32Array) {
  const h = m.profile;
  const j = m.state.jumper;
  const p = LAYER_SCALE[LAYER.jumper] ?? 1;
  const off = layerOffset(view, LAYER.jumper);
  const edge = layerIndex(LAYER.jumper, h.takeoffXM) + 1 - off.x;
  const toView = (column: number) => (column - 160) / view.pixelWidth + view.widthPx / 2;
  const shifted = { ...anchor, x: anchor.x + (SHADOW_COLUMN - FIGURE_COLUMN) / view.pixelWidth };
  const draw = (ground: number, slope: number, fromColumn: number, toColumn: number) => {
    const drop = roundHalfEven((j.yM - ground) * p * ORIGINAL_PX_PER_M);
    const from = toView(fromColumn);
    const to = toView(toColumn);
    drawShadow(h, m.state, shifted, drop, slope, (x, y) => {
      if (x >= from && x <= to) putIndex(c, pal, x, y, SHADOW_COLOUR);
    });
  };
  if (j.xM - SHADOW_SWITCH_M < h.takeoffXM) draw(inrunYM(h, j.xM), inrunSlope(h, j.xM), 0, edge - 3);
  if (j.xM + SHADOW_SWITCH_M > h.takeoffXM) draw(landingYM(h, j.xM), landingSlope(h, j.xM), edge - 2, 319);
}

/** Places in the original's drawing order where this project's additions go. */
export interface SceneHooks {
  /** After the sky and the mountains, before the background's hills (stars, moon). */
  afterSky?: (view: SceneView, c: SceneCanvas) => void;
  /** After the background, before the landing hill (birds). */
  afterBackground?: (view: SceneView) => void;
  /** After the far fence (wind socks, floodlights). */
  afterFarFence?: (view: SceneView) => void;
  /** After the inrun behind the jumper (lamps on its far rail). */
  afterInrun?: (view: SceneView, farRailPx: number) => void;
}

/** The hill, its background and the jumper, as the original draws them, into rows 0..`lastRow` of `fb`. */
export function drawHillScene(fb: FrameBuffer, m: HillSceneModel, lastRow: number, hooks: SceneHooks = {}): void {
  const h = m.profile;
  const j = m.state.jumper;
  const view = sceneView(j.xM, j.yM, fb.width, m.pixelWidth);
  const c = sceneCanvas(fb, lastRow);
  const far = scenePalette(m.look.skyRgb6, true);
  const near = scenePalette(m.look.skyRgb6, false);
  const walls = inrunLook(m.look);
  drawSky(c, far);
  drawMountains(c, h, m.look, view, far);
  hooks.afterSky?.(view, c);
  // Bands of the background with the trees of the layers between them, in the original's order.
  drawBackgroundBands(c, h, m.look, view, far, 0, 0);
  drawTrees(c, h, m.look, view, far, 1, 2);
  drawBackgroundBands(c, h, m.look, view, far, 1, 1);
  drawTrees(c, h, m.look, view, far, 3, 3);
  drawBackgroundBands(c, h, m.look, view, far, 2, 2);
  drawTrees(c, h, m.look, view, far, 4, 6);
  drawBackgroundBands(c, h, m.look, view, far, 3, 4);
  drawTrees(c, h, m.look, view, far, 7, 16);
  if (m.floodlights === "dusk") drawFloodlightSpill(c, h, view, near);
  const nightLight = m.floodlights === "night" ? floodlightPalettes(near, far) : undefined;
  hooks.afterBackground?.(view);
  drawLandingHill(c, h, view, near);
  if (nightLight !== undefined) relightLandingHill(c, h, view, nightLight);
  drawDistanceLines(c, h, view, distanceLines(marksOf(m), m.recordM, m.targetM), near);
  drawFarFence(c, h, view, marksOf(m), near);
  hooks.afterFarFence?.(view);
  drawInrunSupports(c, h, m.look, view, near);
  drawInrunBehind(c, h, walls, view, near);
  drawSkiTracks(c, h, view, near);
  hooks.afterInrun?.(view, walls.farWallUpPx);
  const anchor = figureAnchor(view, j.xM, j.yM, j.xM, j.yM);
  shadow(c, m, view, anchor, near);
  drawGateFar(c, h, walls, view, near);
  if (m.ghost !== undefined && m.drawGhost !== undefined) {
    m.drawGhost(fb, m.ghost, figureAnchor(view, m.ghost.jumper.xM, m.ghost.jumper.yM, j.xM, j.yM));
  }
  drawFigure(fb, h, m.state, anchor, m.outfit);
  drawGateNear(c, h, walls, view, near);
  drawInrunNearWall(c, h, walls, view, near);
  drawNearFence(c, h, view, marksOf(m), near);
  drawNearGround(c, h, view, near);
  if (nightLight !== undefined) relightNearGround(c, h, view, nightLight);
}
