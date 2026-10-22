import { BorlandRandom } from "../sim/borland-random";
import { landingSlope, landingYM, type HillProfile } from "../sim/hill-profile";
import { roundHalfEven } from "../sim/pascal-numeric";
import { f32 } from "../sim/physics-constants";
import { randomUnit } from "../sim/wind";
import {
  colourAt,
  colourSource,
  hillLayerTables,
  lazyTable,
  rowsAt,
  slopeColour,
  tableRange,
  type LayerTable,
  drawnSceneLengthOf,
} from "./hill-layer-tables";
import type { HillLook } from "./hill-look";
import { LAYER, layerOffset, layerRows, layerX, originalColumn, type SceneView } from "./scene-layers";
import { mixPacked, SKY_FIRST_INDEX } from "./scene-palette";
import { colourSpan, type SceneCanvas } from "./scene-span";

/**
 * The original's background (0baf:1c31, 0baf:1e89, 0baf:344c): a sky of 16 bands, then five layers of snowy hills
 * whose outline mixes the landing hill with sine waves, the farther the more waves; each band of snow between
 * two layers is cut off by the far edge of the landing hill.
 */

/** One sine wave of a background layer. */
interface Wave {
  amplitude: number;
  phase: number;
  frequency: number;
}

const WAVE_SETS = 5;
const WAVES_PER_SET = 4;
/** Random(6282) / 2000: a phase in 0..pi. */
const PHASE_RANGE = 6282;
const PHASE_SCALE = 2000;
const AMPLITUDE_BASE_M = 3;
const FREQUENCY_SCALE = 30;
const FREQUENCY_BASE = 0.001;
/** Every wave set adds this to its sum. */
const WAVE_BASE_M = 20;

/** 0baf:1c31: the waves of the five sets from the hill's seed, as the original draws them (with its wasted draws). */
export function backgroundWaves(seed: number, amplitudeM: number): Wave[][] {
  const rng = new BorlandRandom(seed & 0xffff);
  const sets: Wave[][] = [];
  for (let i = 0; i < WAVE_SETS; i++) {
    const set: Wave[] = [];
    for (let k = 0; k < WAVES_PER_SET; k++) {
      const previous = sets[i - 1]?.[k];
      let amplitude: number;
      if (previous === undefined) {
        amplitude = f32(randomUnit(rng, 4) * amplitudeM + AMPLITUDE_BASE_M);
      } else {
        amplitude = f32((randomUnit(rng, 4) * amplitudeM + AMPLITUDE_BASE_M + previous.amplitude) / 2);
        // The original computes a mixed phase and frequency here and then overwrites both with fresh draws.
        rng.below(PHASE_RANGE);
        randomUnit(rng, 5);
      }
      const phase = f32(rng.below(PHASE_RANGE) / PHASE_SCALE);
      const frequency = f32(randomUnit(rng, 5) / FREQUENCY_SCALE + FREQUENCY_BASE);
      set.push({ amplitude, phase, frequency });
    }
    sets.push(set);
  }
  return sets;
}

/** 0baf:1b12: height of a wave set at x (20 plus the waves). */
function waveHeight(set: readonly Wave[], x: number): number {
  let sum = WAVE_BASE_M;
  for (const w of set) sum = f32(Math.sin(w.frequency * x + w.phase) * w.amplitude + sum);
  return sum;
}

/** 0baf:1b97: its slope. */
function waveSlope(set: readonly Wave[], x: number): number {
  let sum = 0;
  for (const w of set) sum = f32(w.frequency * w.amplitude * Math.cos(w.frequency * x + w.phase) + sum);
  return sum;
}

/** A background layer: how much of the landing hill and of a wave set (scaled down) shapes it, and its shading. */
interface BackgroundLayer {
  layer: number;
  set: number;
  hill: number;
  waveScale: number;
  shade: { amplitude: number; base: number } | null;
  /** Palette colour (8.8) of layers drawn without shading. */
  fixedColour?: number;
}

// oxfmt-ignore
const LAYERS: readonly BackgroundLayer[] = [
  { layer: 1, set: 0, hill: 0.03, waveScale: 1, shade: null, fixedColour: 0x3e00 },
  { layer: 2, set: 1, hill: 0.4, waveScale: 1, shade: null, fixedColour: 0x3a00 },
  { layer: 4, set: 2, hill: 0.6, waveScale: 1.5, shade: { amplitude: 8, base: 46 } },
  { layer: 7, set: 3, hill: 0.8, waveScale: 2.5, shade: { amplitude: 12, base: 38 } },
  { layer: 11, set: 4, hill: 0.95, waveScale: 2.5, shade: { amplitude: 18, base: 34 } },
];

const SKY_BANDS = 16;
const SKY_BAND_ROWS = 3;

/** DS:464E: the background's base height, the bottom of the outrun's parabola plus the hill's offset. */
export function backgroundBaseM(h: HillProfile, overOutrunM: number): number {
  const x = f32(-h.outrunCurveB / (2 * h.outrunCurveA));
  return roundHalfEven(h.outrunCurveA * x * x + h.outrunCurveB * x + h.outrunCurveCM + overOutrunM);
}

function buildLayer(h: HillProfile, look: HillLook, waves: readonly Wave[][], def: BackgroundLayer): LayerTable {
  const base = backgroundBaseM(h, look.terrain.baseOverOutrunM);
  const set = waves[def.set] ?? [];
  const rest = 1 - def.hill;
  const [first, last] = tableRange(def.layer, drawnSceneLengthOf(h));
  const shade = def.shade;
  return lazyTable(
    first,
    last,
    (j) => {
      const x = layerX(def.layer, j);
      return layerRows(def.layer, landingYM(h, x) * def.hill + (waveHeight(set, x) / def.waveScale + base) * rest);
    },
    (j) => colourSource(j, 2),
    (j) => {
      if (shade === null) return 0;
      const x = layerX(def.layer, j);
      const slope = landingSlope(h, x) * def.hill + (waveSlope(set, x) / def.waveScale) * rest;
      return slopeColour(slope, shade.amplitude, shade.base);
    },
  );
}

const cache = new WeakMap<HillProfile, Map<HillLook, LayerTable[]>>();

function backgroundTables(h: HillProfile, look: HillLook): LayerTable[] {
  let byLook = cache.get(h);
  if (byLook === undefined) {
    byLook = new Map();
    cache.set(h, byLook);
  }
  let tables = byLook.get(look);
  if (tables === undefined) {
    const waves = backgroundWaves(look.terrain.seed, look.terrain.amplitudeM);
    tables = LAYERS.map((def) => buildLayer(h, look, waves, def));
    byLook.set(look, tables);
  }
  return tables;
}

/** Height table of a background key layer (1, 2, 4, 7 or 11). */
export function backgroundLayerTable(h: HillProfile, look: HillLook, layer: number): LayerTable | undefined {
  const i = LAYERS.findIndex((d) => d.layer === layer);
  return i < 0 ? undefined : backgroundTables(h, look)[i];
}

/** The sky: 16 bands of 3 rows from the top, fixed to the screen. */
export function drawSky(c: SceneCanvas, pal: Uint32Array): void {
  for (let i = 0; i < SKY_BANDS; i++) {
    const colour = pal[SKY_FIRST_INDEX + i] ?? 0;
    for (let y = i * SKY_BAND_ROWS; y < (i + 1) * SKY_BAND_ROWS && y <= c.lastRow; y++) {
      c.fb.pixels.fill(colour, y * c.fb.width, (y + 1) * c.fb.width);
      c.indices.fill(SKY_FIRST_INDEX + i, y * c.fb.width, (y + 1) * c.fb.width);
    }
  }
}

/**
 * The bands of snow between the background layers, from `fromBand` to `toBand` (0..4: layer 1 to 2, 2 to 4, 4 to 7,
 * 7 to 11, 11 to the far edge of the landing hill).
 */
export function drawBackgroundBands(
  c: SceneCanvas,
  h: HillProfile,
  look: HillLook,
  view: SceneView,
  pal: Uint32Array,
  fromBand: number,
  toBand: number,
): void {
  const tables = backgroundTables(h, look);
  const farEdge = hillLayerTables(h).farEdge;
  const edgeOff = layerOffset(view, LAYER.farEdge);
  for (let band = fromBand; band <= toBand; band++) {
    const top = tables[band];
    const topDef = LAYERS[band];
    if (top === undefined || topDef === undefined) continue;
    const bottom = tables[band + 1];
    const bottomDef = LAYERS[band + 1];
    const topOff = layerOffset(view, topDef.layer);
    const bottomOff = bottomDef === undefined ? edgeOff : layerOffset(view, bottomDef.layer);
    for (let sx = 0; sx < c.fb.width; sx++) {
      const column = originalColumn(view, sx);
      const jt = topOff.x + column;
      const jb = bottomOff.x + column;
      const je = edgeOff.x + column;
      const edgeY = rowsAt(farEdge, je) + edgeOff.y;
      const bottomY = bottom === undefined ? edgeY : Math.min(rowsAt(bottom, jb) + bottomOff.y, edgeY);
      const topColour = topDef.fixedColour ?? colourAt(top, jt);
      const bottomColour =
        bottom === undefined ? colourAt(farEdge, je) : (bottomDef?.fixedColour ?? colourAt(bottom, jb));
      colourSpan(c, pal, sx, rowsAt(top, jt) + topOff.y, bottomY, topColour, bottomColour);
    }
  }
}

/** Rows above the landing hill's far edge that the floodlights reach, and the share of their light at the edge. */
const SPILL_ROWS_PX = 28;
const SPILL_AT_EDGE = 0.55;

/**
 * This project's addition at dusk: the floodlights' light reaches the snow and the trees just behind the landing
 * hill, fading with the distance from its far edge, so the lit hill does not end in a hard line against the
 * darker background. Drawn over the background before the hill; the sky is left alone. At night the light stays
 * on the hill instead (`scene-floodlight.ts`).
 */
export function drawFloodlightSpill(c: SceneCanvas, h: HillProfile, view: SceneView, near: Uint32Array): void {
  const farEdge = hillLayerTables(h).farEdge;
  const edgeOff = layerOffset(view, LAYER.farEdge);
  const { fb, indices } = c;
  const pixels = fb.pixels;
  for (let sx = 0; sx < fb.width; sx++) {
    const edgeY = rowsAt(farEdge, edgeOff.x + originalColumn(view, sx)) + edgeOff.y;
    const bottom = Math.min(edgeY, c.lastRow);
    for (let y = Math.max(0, edgeY - SPILL_ROWS_PX); y <= bottom; y++) {
      const i = y * fb.width + sx;
      const index = indices[i] ?? 0;
      if (index >= SKY_FIRST_INDEX) continue;
      const lit = 1 - (edgeY - y) / SPILL_ROWS_PX;
      pixels[i] = mixPacked(pixels[i] ?? 0, near[index] ?? 0, SPILL_AT_EDGE * lit * lit);
    }
  }
}
