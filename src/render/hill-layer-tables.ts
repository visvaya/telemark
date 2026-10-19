import { inrunSlope, inrunYM, landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { roundHalfEven } from "../sim/pascal-numeric";
import { LAYER_SCALE, layerRows, layerX } from "./scene-layers";

/**
 * Per-hill tables of the layers the hill is drawn on, as the original builds them once per hill (0baf:1e89):
 * for each table index of a layer the height of the terrain in rows and the palette colour (8.8) of its surface.
 * Indices beyond the original's tables are computed the same way, for views wider than its screen.
 */

/** Indices computed on either side of the original's table (a 480-column view reaches about 130 past it). */
const MARGIN_INDICES = 480;
/** Metres of the hill the original's tables cover: past it a hill has no scenery drawn under it. */
export const LAYER_TABLE_LENGTH_M = 380;
/** Columns per metre of the jumper's plane in the original's screen units. */
const TABLE_PX_PER_M = 14;
/** Length of the original's tables in the jumper's plane: 5320 = 380 m at 14 px/m, plus 321 entries. */
const TABLE_LENGTH_PX = LAYER_TABLE_LENGTH_M * TABLE_PX_PER_M;
const TABLE_EXTRA_ENTRIES = 0x141;

/** Indices are computed in chunks of this many, when a frame first needs them. */
const CHUNK_SHIFT = 6;
const CHUNK = 1 << CHUNK_SHIFT;

/**
 * A layer's table, filled lazily chunk by chunk: the first frame on a hill needs only the indices in view, and
 * building whole tables at once would hold that frame up.
 */
export interface LayerTable {
  /** Table index of element 0. */
  first: number;
  rows: Int16Array;
  /** Colour of the surface (palette index * 256) per table index. */
  colour: Uint16Array;
  ready: Uint8Array;
  /** Rows of index `j`, and the index whose x gives its colour with that colour. */
  height: (j: number) => number;
  colourSource: (j: number) => number;
  colourOf: (j: number) => number;
}

export function lazyTable(
  first: number,
  last: number,
  height: (j: number) => number,
  sourceOf: (j: number) => number,
  colourOf: (j: number) => number,
): LayerTable {
  const size = last - first + 1;
  return {
    first,
    rows: new Int16Array(size),
    colour: new Uint16Array(size),
    ready: new Uint8Array((size >> CHUNK_SHIFT) + 1),
    height,
    colourSource: sourceOf,
    colourOf,
  };
}

function ensure(t: LayerTable, i: number): void {
  const { ready, rows, colour } = t;
  const chunk = i >> CHUNK_SHIFT;
  if (ready[chunk] === 1) return;
  ready[chunk] = 1;
  let source = Number.NaN;
  let value = 0;
  const end = Math.min(rows.length, (chunk + 1) * CHUNK);
  for (let k = chunk * CHUNK; k < end; k++) {
    const j = k + t.first;
    rows[k] = t.height(j);
    const s = t.colourSource(j);
    if (s !== source) {
      source = s;
      value = t.colourOf(s);
    }
    colour[k] = value;
  }
}

type Profile = (h: HillProfile, x: number) => number;

/** The colour of a surface from its slope: round((amplitude cos(atan(14 slope)) + base) * 256). */
export function slopeColour(slope: number, amplitude: number, base: number): number {
  return roundHalfEven((amplitude * Math.cos(Math.atan(14 * slope)) + base) * 256);
}

/**
 * The table index whose x gives the colour of index `j`: the original fills the colour of every second (or
 * fourth) index and reads it back at j >> 1 (or j >> 2).
 */
export function colourSource(j: number, every: number): number {
  return every * Math.floor(j / every) + 1;
}

/** The range of indices of a layer's table: the original's (round(5320 p) + 321 entries) and a margin each side. */
export function tableRange(layer: number): [number, number] {
  const p = LAYER_SCALE[layer] ?? 1;
  return [1 - MARGIN_INDICES, Math.round(TABLE_LENGTH_PX * p) + TABLE_EXTRA_ENTRIES + MARGIN_INDICES];
}

function buildTable(
  h: HillProfile,
  layer: number,
  height: Profile,
  slope: Profile,
  amplitude: number,
  base: number,
  every: number,
): LayerTable {
  const [first, last] = tableRange(layer);
  return lazyTable(
    first,
    last,
    (j) => layerRows(layer, height(h, layerX(layer, j))),
    (j) => colourSource(j, every),
    (j) => slopeColour(slope(h, layerX(layer, j)), amplitude, base),
  );
}

export interface HillLayerTables {
  farEdge: LayerTable;
  nearEdge: LayerTable;
  inrunFar: LayerTable;
  inrunJumper: LayerTable;
  inrunNear: LayerTable;
  /** The ground under the inrun on its near side (layer 21), where its supports stand. */
  groundNear: LayerTable;
}

const cache = new WeakMap<HillProfile, HillLayerTables>();

const landing: Profile = landingYM;
const landingSlopeAt: Profile = landingSlope;
const inrun: Profile = inrunYM;
const inrunSlopeAt: Profile = inrunSlope;

/** The tables of a hill, built on first use. */
export function hillLayerTables(h: HillProfile): HillLayerTables {
  let tables = cache.get(h);
  if (tables === undefined) {
    tables = {
      // Landing hill (layers 17 and 23): 20 cos + 32 at every second index, 15 cos + 48 at every fourth.
      farEdge: buildTable(h, 17, landing, landingSlopeAt, 20, 32, 2),
      nearEdge: buildTable(h, 23, landing, landingSlopeAt, 15, 48, 4),
      // Inrun (layers 19, 20, 21): 20 cos + 35 and 20 cos + 43.
      inrunFar: buildTable(h, 19, inrun, inrunSlopeAt, 20, 35, 2),
      inrunJumper: buildTable(h, 20, inrun, inrunSlopeAt, 20, 35, 2),
      inrunNear: buildTable(h, 21, inrun, inrunSlopeAt, 20, 43, 4),
      groundNear: buildTable(h, 21, landing, landingSlopeAt, 20, 43, 4),
    };
    cache.set(h, tables);
  }
  return tables;
}

/** Rows of table index `j`, clamped to the table's ends. */
export function rowsAt(t: LayerTable, j: number): number {
  const i = Math.min(t.rows.length - 1, Math.max(0, j - t.first));
  ensure(t, i);
  return t.rows[i] ?? 0;
}

export function colourAt(t: LayerTable, j: number): number {
  const i = Math.min(t.colour.length - 1, Math.max(0, j - t.first));
  ensure(t, i);
  return t.colour[i] ?? 0;
}
