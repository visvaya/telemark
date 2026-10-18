import { landingYM, type HillProfile } from "../sim/hill-profile";
import { colourAt, hillLayerTables, rowsAt } from "./hill-layer-tables";
import { colourSpan, putIndex, type SceneCanvas } from "./scene-span";
import { onSurfaceAtHeight } from "./scene-anchor";
import { LAYER, layerIndex, layerOffset, originalColumn, type SceneView } from "./scene-layers";
import { landingXAtArcLength, rowRunLine } from "./scene-lines";

/** Palette index of the snow far below the near edge (0x3E). */
const GROUND_FAR_COLOUR = 0x3e00;
/** Far fence: 5 rows above the far edge, a post every 60 table indices (4.3 m at the far edge). */
const FAR_FENCE_ROWS = 5;
const FAR_FENCE_POST_EVERY = 60;
const FAR_FENCE_POST_PHASE = 26;
/** Near fence: 11 rows above the near edge, a post every 130 table indices (4 m at the near edge). */
const NEAR_FENCE_ROWS = 11;
const NEAR_FENCE_POST_EVERY = 130;
/** The fences start 1 m past the takeoff (plus the hill's own offset). */
const FENCE_AFTER_TAKEOFF_M = 1;
/** Marks are measured from the takeoff along the slope, 0.15 m further than their distance; the record 0.1 m more. */
const MARK_EXTRA_M = 0.15;
const RECORD_EXTRA_M = 0.1;
/** A record of 0 puts its line out of sight. */
const NO_RECORD_M = 10000;
const MARK_SPACING_M = 5;

/**
 * Colours of the lines on the landing hill (palette indices): marks every 5 m, the K point, the hill record, and
 * this project's line of the distance that would lead a competition, in the yellow of the original's bar texts.
 */
export const LINE_COLOUR = { mark: 0x54, kPoint: 0x4b, record: 0x6b, target: 0x79 } as const;

/** What a hill shows on its landing hill and fences (from its definition in the original). */
export interface HillMarks {
  kPointM: number;
  /** Distance of the first mark and how many there are, every 5 m. */
  firstMarkM: number;
  markCount: number;
  /** Palette index of the fences' darkest shade. */
  fenceColour: number;
  /** Extra distance past the takeoff before the fences start, in metres. */
  fenceStartM: number;
}

export interface DistanceLine {
  distanceM: number;
  colour: number;
}

/**
 * The lines the original draws across the landing hill: the marks, then the K point, then the hill record; in a
 * competition, last and so over the others, the distance that would lead (`targetM`), measured as the K point is.
 */
export function distanceLines(marks: HillMarks, recordM: number, targetM?: number): DistanceLine[] {
  const lines: DistanceLine[] = [];
  for (let k = 0; k < marks.markCount; k++) {
    lines.push({ distanceM: marks.firstMarkM + MARK_SPACING_M * k + MARK_EXTRA_M, colour: LINE_COLOUR.mark });
  }
  lines.push({ distanceM: marks.kPointM + MARK_EXTRA_M, colour: LINE_COLOUR.kPoint });
  const record = recordM > 0 ? recordM : NO_RECORD_M;
  lines.push({ distanceM: record + RECORD_EXTRA_M + MARK_EXTRA_M, colour: LINE_COLOUR.record });
  if (targetM !== undefined) lines.push({ distanceM: targetM + MARK_EXTRA_M, colour: LINE_COLOUR.target });
  return lines;
}

/** The landing hill: from the far edge (layer 17) to the near edge (layer 23), lighter where it is flatter. */
export function drawLandingHill(c: SceneCanvas, h: HillProfile, view: SceneView, pal: Uint32Array) {
  const t = hillLayerTables(h);
  const far = layerOffset(view, LAYER.farEdge);
  const near = layerOffset(view, LAYER.nearEdge);
  for (let sx = 0; sx < c.fb.width; sx++) {
    const column = originalColumn(view, sx);
    const jf = far.x + column;
    const jn = near.x + column;
    const top = rowsAt(t.farEdge, jf) + far.y;
    const bottom = rowsAt(t.nearEdge, jn) + near.y;
    colourSpan(c, pal, sx, top, bottom, colourAt(t.farEdge, jf), colourAt(t.nearEdge, jn));
  }
}

/** Snow in front of the near edge, down to the bottom of the picture. */
export function drawNearGround(c: SceneCanvas, h: HillProfile, view: SceneView, pal: Uint32Array) {
  const t = hillLayerTables(h);
  const near = layerOffset(view, LAYER.nearEdge);
  for (let sx = 0; sx < c.fb.width; sx++) {
    const jn = near.x + originalColumn(view, sx);
    colourSpan(c, pal, sx, rowsAt(t.nearEdge, jn) + near.y, 200, colourAt(t.nearEdge, jn), GROUND_FAR_COLOUR);
  }
}

/** Where a line at an arc distance from the takeoff crosses the landing hill (x, y), per hill and distance. */
const lineCache = new WeakMap<HillProfile, Map<number, readonly [number, number]>>();

function linePoint(h: HillProfile, distanceM: number): readonly [number, number] {
  let byDistance = lineCache.get(h);
  if (byDistance === undefined) {
    byDistance = new Map();
    lineCache.set(h, byDistance);
  }
  let point = byDistance.get(distanceM);
  if (point === undefined) {
    const x = landingXAtArcLength(h, h.takeoffXM, distanceM, 1);
    point = [x, landingYM(h, x)];
    byDistance.set(distanceM, point);
  }
  return point;
}

/**
 * Where a line at an arc distance from the takeoff is drawn: its far end's column and row, then its near end's.
 * Each end keeps the original's height against its edge where the original's column is shown; where the view
 * skips it, the end moves to the nearest column shown and up or down by as much as the edge does there, so it
 * keeps its place on the edge as the picture scrolls.
 */
export function distanceLineEnds(h: HillProfile, view: SceneView, distanceM: number): [number, number, number, number] {
  const t = hillLayerTables(h);
  const [x, y] = linePoint(h, distanceM);
  return [
    ...onSurfaceAtHeight(view, LAYER.farEdge, t.farEdge, x, y),
    ...onSurfaceAtHeight(view, LAYER.nearEdge, t.nearEdge, x, y),
  ];
}

/** Lines across the landing hill, each from its point on the far edge to the same point on the near edge. */
export function drawDistanceLines(
  c: SceneCanvas,
  h: HillProfile,
  view: SceneView,
  lines: readonly DistanceLine[],
  pal: Uint32Array,
): void {
  for (const line of lines) {
    const [x0, y0, x1, y1] = distanceLineEnds(h, view, line.distanceM);
    if (Math.max(x0, x1) < 0 || Math.min(x0, x1) >= c.fb.width) continue;
    rowRunLine(x0, y0, x1, y1, (px, py) => putIndex(c, pal, px, py, line.colour));
  }
}

/** A fence along an edge: a band of rows above it, posts at regular table indices, from past the takeoff on. */
function drawFence(c: SceneCanvas, h: HillProfile, view: SceneView, marks: HillMarks, pal: Uint32Array, near: boolean) {
  const t = hillLayerTables(h);
  const layer = near ? LAYER.nearEdge : LAYER.farEdge;
  const table = near ? t.nearEdge : t.farEdge;
  const off = layerOffset(view, layer);
  const start = layerIndex(layer, FENCE_AFTER_TAKEOFF_M + h.takeoffXM + marks.fenceStartM);
  const f = marks.fenceColour;
  for (let sx = 0; sx < c.fb.width; sx++) {
    const j = off.x + originalColumn(view, sx);
    if (j < start) continue;
    const y = rowsAt(table, j) + off.y;
    if (near) {
      const phase = j % NEAR_FENCE_POST_EVERY;
      const post = phase >= 1 && phase <= 10;
      const [a, b] = post ? [f + 5, f + 1] : [f + 9, f + 5];
      colourSpan(c, pal, sx, y - NEAR_FENCE_ROWS, y, a << 8, b << 8);
    } else {
      const phase = (j + FAR_FENCE_POST_PHASE) % FAR_FENCE_POST_EVERY;
      const post = phase >= 1 && phase <= 4;
      const [a, b] = post ? [f + 3, f] : [f + 6, f + 3];
      colourSpan(c, pal, sx, y - FAR_FENCE_ROWS, y, a << 8, b << 8);
    }
  }
}

export function drawFarFence(c: SceneCanvas, h: HillProfile, view: SceneView, marks: HillMarks, pal: Uint32Array) {
  drawFence(c, h, view, marks, pal, false);
}

export function drawNearFence(c: SceneCanvas, h: HillProfile, view: SceneView, marks: HillMarks, pal: Uint32Array) {
  drawFence(c, h, view, marks, pal, true);
}
