import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { landingArcLengthM } from "../sim/hill-profile";
import { FrameBuffer } from "./frame-buffer";
import {
  LAYER,
  SQUARE_PIXEL_WIDTH,
  layerIndex,
  layerOffset,
  layerRows,
  layerX,
  originalColumn,
  sceneView,
  viewColumn,
} from "./scene-layers";
import { landingXAtArcLength, rowRunLine } from "./scene-lines";
import { colourSpan, sceneCanvas } from "./scene-span";

describe("layers of the scene", () => {
  it("puts the jumper's plane under the jumper, near the middle of the picture", () => {
    const view = sceneView(50, 100, 320, 1);
    const off = layerOffset(view, LAYER.jumper);
    // Column of x = 50 m and row of y = 100 m on the jumper's plane: about 11 px left of the middle, row 88 (89 before rounding).
    expect(layerIndex(LAYER.jumper, 50) - off.x).toBe(149);
    expect(layerRows(LAYER.jumper, 100) + off.y).toBe(88);
  });

  it("maps the view's columns onto the original's, centre on centre", () => {
    const view = sceneView(0, 0, 356, SQUARE_PIXEL_WIDTH);
    expect(originalColumn(view, 178)).toBe(160);
    // A view column is 6/5 of the original's, so going there and back lands on the same column or its neighbour.
    for (const sx of [0, 50, 177, 300, 355]) {
      expect(Math.abs(viewColumn(view, originalColumn(view, sx)) - sx)).toBeLessThanOrEqual(1);
    }
    const original = sceneView(0, 0, 320, 1);
    expect([0, 160, 319].map((sx) => originalColumn(original, sx))).toEqual([0, 160, 319]);
  });

  it("gives a table index back its x", () => {
    expect(layerX(LAYER.farEdge, layerIndex(LAYER.farEdge, 30))).toBeCloseTo(30, 1);
  });
});

describe("a gradient column", () => {
  it("steps the colour from the first row and keeps the gradient when cut off at the top", () => {
    const fb = new FrameBuffer(1, 20);
    const pal = Uint32Array.from({ length: 256 }, (_, i) => i);
    const c = sceneCanvas(fb, 19);
    colourSpan(c, pal, 0, 0, 9, 10 << 8, 20 << 8);
    expect(Array.from(fb.pixels.slice(0, 10))).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    colourSpan(c, pal, 0, -5, 4, 10 << 8, 20 << 8);
    expect(Array.from(fb.pixels.slice(0, 5))).toEqual([16, 17, 18, 19, 20]);
  });
});

describe("lines across the landing hill", () => {
  it("leave no gap between rows however flat they are", () => {
    const pixels: [number, number][] = [];
    rowRunLine(0, 0, 9, 2, (x, y) => pixels.push([x, y]));
    const rows = [0, 1, 2].map((y) => pixels.filter(([, py]) => py === y).map(([x]) => x));
    expect(rows[0]?.[0]).toBe(0);
    expect(rows[2]?.at(-1)).toBeGreaterThanOrEqual(9);
    // Each row starts where the previous one ended.
    expect(rows[1]?.[0]).toBe(rows[0]?.at(-1));
    expect(rows[2]?.[0]).toBe(rows[1]?.at(-1));
  });

  it.each(OWN_HILLS.map((hill) => ({ id: hill.id, hill })))(
    "stand at their distance measured along the slope from the takeoff ($id)",
    ({ hill }) => {
      const h = hill.profile;
      // The K point's line, where the original draws it: 0.15 m past the K point.
      const distanceM = hill.kPointM + 0.15;
      const x = landingXAtArcLength(h, h.takeoffXM, distanceM, 1);
      // The original's walk in 1 m steps drifts from the fine arc as it goes: 0.075 m at K170, 0.1 m at K300.
      const driftMaxM = Math.max(0.1, 0.0005 * hill.kPointM);
      expect(Math.abs(landingArcLengthM(h, h.takeoffXM, x, 0.01) - distanceM)).toBeLessThan(driftMaxM);
    },
  );
});
