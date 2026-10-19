import { describe, expect, it } from "vitest";
import { OWN_HILLS, type HillChoice } from "../game/hill-choice";
import { DEFAULT_OUTFIT } from "../game/outfit";
import { startTrainingJump } from "../game/training-session";
import { inrunYM, landingYM, type HillProfile } from "../sim/hill-profile";
import { hillLayerTables, rowsAt } from "./hill-layer-tables";
import { drawHillScene } from "./jump-view-scene";
import type { HillLook } from "./hill-look";
import { backgroundWaves, drawFloodlightSpill } from "./scene-backdrop";
import {
  FLOODLIGHT,
  firstMastXM,
  floodlightPalettes,
  floodlightStep,
  relightLandingHill,
  relightNearGround,
} from "./scene-floodlight";
import { FrameBuffer } from "./frame-buffer";
import { LAYER, LAYER_SCALE, layerOffset, originalColumn, sceneView, type SceneView } from "./scene-layers";
import { sceneCanvas } from "./scene-span";
import { BIRD_FRAMES, drawBirds, drawNightSky } from "./scene-extras";
import { color, withLook } from "./palette";
import { LINE_COLOUR, distanceLines } from "./scene-hill";
import { SKY_FIRST_INDEX, greyedMiddle, sceneDac } from "./scene-palette";
import { placeTrees, sceneTrees } from "./scene-trees";
import { TREE_VARIANTS, treeBitmap, type TreeKind } from "./tree-bitmaps";

/** Every own hill: each test of a hill's scenery runs on all of them, placed from each hill's own data. */
const HILLS: readonly { id: string; hill: HillChoice }[] = OWN_HILLS.map((hill) => ({ id: hill.id, hill }));
const rgbAt = (dac: Uint8Array, i: number) => Array.from(dac.subarray(i * 3, i * 3 + 3));

describe("the scene palette", () => {
  it("builds the original's ramps (values of v2.10P's palette during a jump)", () => {
    const dac = sceneDac([23, 57, 58]);
    expect([0, 31, 63, 0x4a, 0x8a, 0xca, 0xea].map((i) => rgbAt(dac, i))).toEqual([
      [0, 0, 2],
      [29, 30, 31],
      [56, 56, 63],
      [58, 12, 12],
      [15, 61, 61],
      [59, 43, 5],
      [31, 31, 31],
    ]);
  });

  it("pulls the middle colours towards grey with the original's rounding of exact halves", () => {
    expect(greyedMiddle([63, 10, 10])).toEqual([58, 12, 12]);
    expect(greyedMiddle([10, 63, 63])).toEqual([15, 61, 61]);
  });

  it("fades the sky from dark blue at the top to the hill's colour at the horizon", () => {
    const dac = sceneDac([23, 57, 58]);
    expect(rgbAt(dac, SKY_FIRST_INDEX)).toEqual([25, 25, 60]);
    expect(rgbAt(dac, 0xfa)).toEqual([32, 46, 58]);
    expect(rgbAt(dac, 0xff)).toEqual([23, 57, 58]);
  });
});

describe("the background hills", () => {
  it("draw their waves from the hill's seed as the original does", () => {
    const sets = backgroundWaves(4292, 50);
    expect(sets).toHaveLength(5);
    expect(sets[0]?.[0]).toEqual({
      amplitude: Math.fround(14.827066421508789),
      phase: Math.fround(1.996000051498413),
      frequency: Math.fround(0.010406414978206158),
    });
    expect(sets[4]?.[3]).toEqual({
      amplitude: Math.fround(14.313616752624512),
      phase: Math.fround(3.009000062942505),
      frequency: Math.fround(0.006863419897854328),
    });
  });
});

describe("the lines on the landing hill", () => {
  it("are the marks every 5 m, the K point in red and the record in blue", () => {
    const lines = distanceLines({ kPointM: 85, firstMarkM: 70, markCount: 3, fenceColour: 0xc0, fenceStartM: 0 }, 91.5);
    expect(lines.map((l) => [l.distanceM, l.colour])).toEqual([
      [70.15, LINE_COLOUR.mark],
      [75.15, LINE_COLOUR.mark],
      [80.15, LINE_COLOUR.mark],
      [85.15, LINE_COLOUR.kPoint],
      [91.75, LINE_COLOUR.record],
    ]);
  });

  it("puts the record line out of sight when there is no record", () => {
    const lines = distanceLines({ kPointM: 85, firstMarkM: 70, markCount: 0, fenceColour: 0xc0, fenceStartM: 0 }, 0);
    expect(lines.at(-1)?.distanceM).toBeGreaterThan(1000);
  });
});

describe("the trees", () => {
  it.each(HILLS)(
    "stand on layers 2 to 15, at most 20 on a layer, none near the takeoff on the nearest layers ($id)",
    ({ hill }) => {
      const trees = placeTrees(hill.profile, hill.look);
      expect(trees.length).toBeGreaterThan(20);
      expect(trees.every((t) => t.layer >= 2 && t.layer <= 15)).toBe(true);
      for (let layer = 2; layer <= 15; layer++) {
        expect(trees.filter((t) => t.layer === layer).length).toBeLessThanOrEqual(20);
      }
      const takeoff = hill.profile.takeoffXM;
      const near = trees.filter((t) => t.layer >= 11 && t.xM >= takeoff - 30 && t.xM <= takeoff + 20);
      expect(near).toEqual([]);
    },
  );

  it.each(HILLS)("leave out the ones a hill takes out of sight ($id)", ({ hill }) => {
    const all = placeTrees(hill.profile, hill.look);
    const layer = all[0]?.layer ?? 2;
    const look: HillLook = {
      ...hill.look,
      trees: { ...hill.look.trees, hidden: [{ layer, first: 1, last: 1 }] },
    };
    const some = placeTrees(hill.profile, look);
    expect(some.length).toBe(all.length - 1);
    expect(some.filter((t) => t.layer === layer)).toEqual(all.filter((t) => t.layer === layer).slice(1));
  });

  it("have the original's sizes, narrower in square pixels", () => {
    const largest = treeBitmap("spruce", 12, 1);
    expect([largest.width, largest.height]).toEqual([71, 120]);
    expect(treeBitmap("pine", 2, 6 / 5).height).toBe(6);
    expect(treeBitmap("pine", 12, 6 / 5).width).toBe(56);
  });
});

describe("the birds", () => {
  it("never show as a flat line: in every shape the wings span at least two rows", () => {
    for (const shapes of Object.values(BIRD_FRAMES)) {
      for (const rows of [...shapes.beat, shapes.glide]) {
        const wingRows = rows.filter((row) => row.includes("+")).length;
        expect(wingRows).toBeGreaterThanOrEqual(2);
        expect(rows.join("")).toContain("#");
      }
    }
  });

  it.each(HILLS)(
    "keep to the sky over the top of the inrun: in the picture at the start, out of it lower down ($id)",
    ({ hill }) => {
      const h = hill.profile;
      const birdPixelsAt = (xM: number, yM: number) => {
        const fb = new FrameBuffer(432, 200);
        drawBirds(fb, h, sceneView(xM, yM, 432, 1.2), 0);
        return fb.pixels.filter((p) => p === color("bird")).length;
      };
      expect(birdPixelsAt(h.startXM, inrunYM(h, h.startXM))).toBeGreaterThan(0);
      expect(birdPixelsAt(h.takeoffXM, inrunYM(h, h.takeoffXM))).toBe(0);
      expect(birdPixelsAt(h.takeoffXM + 60, landingYM(h, h.takeoffXM + 60))).toBe(0);
    },
  );
});

/** The moon's pixels in the sky rows of a picture 432 wide, as (x, y) pairs. */
function moonPixels(pixels: Uint32Array, moon: readonly number[]): [number, number][] {
  const found: [number, number][] = [];
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 432; x++) if (moon.includes(pixels[y * 432 + x] ?? 0)) found.push([x, y]);
  }
  return found;
}

describe("the moon", () => {
  it.each(HILLS)(
    "stays where it is when the mountains rise in front of it, cut by them rather than moved ($id)",
    ({ hill }) => {
      const h = hill.profile;
      const view = sceneView(h.startXM, inrunYM(h, h.startXM), 432, 1.2);
      const moon = withLook({ lighting: "night", fog: false }, () => [color("moon"), color("moonShade")]);
      // The sky down to `skyRows`, with mountains from `ridgeRow` down.
      const draw = (ridgeRow: number) => {
        const fb = new FrameBuffer(432, 200);
        const c = sceneCanvas(fb, 199);
        c.indices.fill(SKY_FIRST_INDEX);
        c.indices.fill(0x24, ridgeRow * 432);
        withLook({ lighting: "night", fog: false }, () => drawNightSky(c, h, hill.look, view, 0, 48));
        return moonPixels(fb.pixels, moon);
      };
      const whole = draw(48);
      expect(whole.length).toBeGreaterThan(40);
      const xs = whole.map(([x]) => x);
      const ys = whole.map(([, y]) => y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const radius = Math.max(...whole.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      for (const ridgeRow of [Math.round(cy) + 3, Math.round(cy), Math.round(cy) - 2]) {
        const cut = draw(ridgeRow);
        expect(cut.length).toBeGreaterThan(0);
        expect(cut.length).toBeLessThan(whole.length);
        expect(cut.filter(([x, y]) => Math.hypot(x - cx, y - cy) > radius + 0.01)).toEqual([]);
      }
    },
  );
});

describe("this project's trees", () => {
  const kinds: readonly TreeKind[] = ["spruce", "pine"];

  it("are never a bare stick: some row of needles spans most of the tree's width", () => {
    for (const kind of kinds) {
      for (let size = 2; size <= 12; size++) {
        for (let variant = 0; variant < TREE_VARIANTS; variant++) {
          const b = treeBitmap(kind, size, 6 / 5, variant);
          let widest = 0;
          for (let y = 0; y < b.height; y++) {
            const row = b.pixels.subarray(y * b.width, (y + 1) * b.width);
            const needles = row.filter((i) => i >= 0x51 && i <= 0x56).length;
            widest = Math.max(widest, needles);
          }
          // A pine's pointed crown is a little narrower than a spruce's.
          expect(widest).toBeGreaterThanOrEqual(Math.ceil(b.width * (kind === "pine" ? 0.55 : 0.6)));
        }
      }
    }
  });

  it("come in shapes that differ from each other", () => {
    for (const kind of kinds) {
      const shapes = new Set<string>();
      for (let variant = 0; variant < TREE_VARIANTS; variant++) {
        shapes.add(treeBitmap(kind, 10, 1, variant).pixels.join(","));
      }
      expect(shapes.size).toBe(TREE_VARIANTS);
    }
  });

  it.each(HILLS)("keep the original's trees in place and add groves only on the farther layers ($id)", ({ hill }) => {
    const original = placeTrees(hill.profile, hill.look);
    const drawn = sceneTrees(hill.profile, hill.look);
    expect(drawn.filter((t) => original.includes(t))).toEqual(original);
    const added = drawn.filter((t) => !original.includes(t));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((t) => t.layer <= 10)).toBe(true);
  });
});

describe("the scenery beside the jumper's track", () => {
  it.each(HILLS)("puts no tree on or in front of the plane the jumper moves in ($id)", ({ hill }) => {
    // Trees stand only on the background layers, all behind the far edge of the hill, so wherever their seed puts
    // them along the hill, none stands on the inrun, the landing hill or the outrun the jumper passes.
    const trees = sceneTrees(hill.profile, hill.look);
    expect(trees.length).toBeGreaterThan(0);
    expect(trees.filter((t) => t.layer >= LAYER.farEdge)).toEqual([]);
    expect(LAYER.farEdge).toBeLessThan(LAYER.jumper);
  });

  it.each(HILLS)("stands the inrun's supports under the inrun only, never over the landing hill ($id)", ({ hill }) => {
    // A support is drawn from the inrun's underside down to the ground, so under the inrun it stays below
    // the track; past the takeoff it would stand in the landing hill the jumper flies over and lands on.
    const outside = hill.look.supports.filter(
      (s) => !(s.fromXM >= 0 && s.fromXM < s.toXM && s.toXM <= hill.profile.takeoffXM),
    );
    expect(outside).toEqual([]);
  });
});

describe("the floodlights' light behind the hill at dusk", () => {
  it.each(HILLS)(
    "brightens the background towards the hill's far edge, a few rows above it only, and leaves the sky alone ($id)",
    ({ hill }) => {
      const fb = new FrameBuffer(64, 200);
      const c = sceneCanvas(fb, 199);
      const dark = 0xff000000;
      fb.pixels.fill(dark);
      c.indices.fill(20);
      // The sky in the left half of the picture.
      for (let y = 0; y < 200; y++) c.indices.fill(SKY_FIRST_INDEX, y * 64, y * 64 + 32);
      const near = new Uint32Array(256).fill(0xffffffff);
      drawFloodlightSpill(
        c,
        hill.profile,
        sceneView(hill.profile.takeoffXM + 40, landingYM(hill.profile, hill.profile.takeoffXM + 40), 64, 1.2),
        near,
      );
      const columns = Array.from({ length: 64 }, (_column, x) => {
        const red = Array.from({ length: 200 }, (_row, y) => (fb.pixels[y * 64 + x] ?? 0) & 0xff);
        const rows = red.flatMap((r, y) => (r > 0 ? [y] : []));
        return { x, rows, run: rows.map((y) => red[y] ?? 0) };
      });
      expect(columns.filter((column) => column.x < 32 && column.rows.length > 0)).toEqual([]);
      const lit = columns.filter((column) => column.rows.length > 0);
      expect(lit.length).toBeGreaterThan(0);
      for (const { rows, run } of lit) {
        // One run of rows, getting lighter downwards, at most the reach of the light and never full light.
        expect((rows.at(-1) ?? 0) - (rows[0] ?? 0) + 1).toBe(rows.length);
        expect(rows.length).toBeLessThanOrEqual(28);
        expect(run).toEqual(run.toSorted((a, b) => a - b));
        expect(Math.max(...run)).toBeLessThan(160);
      }
    },
  );
});

/** The colour of each far edge table index in a picture of the landing hill relit with the camera at x. */
function farEdgeColours(h: HillProfile, cameraXM: number): Map<number, number> {
  const fb = new FrameBuffer(160, 200);
  const c = sceneCanvas(fb, 199);
  c.indices.fill(20);
  const near = new Uint32Array(256).fill(0xffffffff);
  const far = new Uint32Array(256).fill(0xff000000);
  const view = sceneView(cameraXM, inrunYM(h, cameraXM), 160, 1);
  fb.pixels.fill(near[20] ?? 0);
  relightLandingHill(c, h, view, floodlightPalettes(near, far));
  const edge = layerOffset(view, LAYER.farEdge);
  const table = hillLayerTables(h).farEdge;
  const colours = new Map<number, number>();
  for (let sx = 0; sx < 160; sx++) {
    const j = edge.x + originalColumn(view, sx);
    const y = rowsAt(table, j) + edge.y;
    if (y >= 0 && y < 200) colours.set(j, fb.pixels[y * 160 + sx] ?? 0);
  }
  return colours;
}

/**
 * Where full light begins along one row of the relit hill: the world x of the first column, from the left, at full
 * light, by the perspective of the layers (a column shows world x = camX / 14 + (column - 160) / (14 x scale) at the
 * depth `scale`). The row is a share of the way from the far edge to the near edge (`across`), or a number of rows
 * under the near edge (`below`). Null when the row shows no such change.
 */
function fullLightFromXM(h: HillProfile, view: SceneView, row: { across: number } | { below: number }): number | null {
  const width = view.widthPx;
  const fb = new FrameBuffer(width, 200);
  const c = sceneCanvas(fb, 199);
  c.indices.fill(20);
  const lit = 0xffffffff;
  fb.pixels.fill(lit);
  const palettes = floodlightPalettes(new Uint32Array(256).fill(lit), new Uint32Array(256).fill(0xff000000));
  relightLandingHill(c, h, view, palettes);
  relightNearGround(c, h, view, palettes);
  const t = hillLayerTables(h);
  const far = layerOffset(view, LAYER.farEdge);
  const near = layerOffset(view, LAYER.nearEdge);
  const farScale = LAYER_SCALE[LAYER.farEdge] ?? 1;
  const nearScale = LAYER_SCALE[LAYER.nearEdge] ?? 1;
  const lit0 = Array.from({ length: width }, (_x, sx) => {
    const column = originalColumn(view, sx);
    const top = rowsAt(t.farEdge, far.x + column) + far.y;
    const bottom = rowsAt(t.nearEdge, near.x + column) + near.y;
    const [y, scale] =
      "across" in row
        ? [Math.round(top + row.across * (bottom - top)), farScale + row.across * (nearScale - farScale)]
        : [bottom + row.below, nearScale + row.below * FLOODLIGHT.nearGroundScalePerRow];
    const inPicture = y >= 0 && y < 200;
    return { column, scale, inPicture, full: inPicture && fb.pixels[y * width + sx] === lit };
  });
  const k = lit0.findIndex((p, i) => i > 0 && p.full && lit0[i - 1]?.inPicture === true && lit0[i - 1]?.full === false);
  const at = lit0[k];
  return at === undefined ? null : view.camX / 14 + (at.column - 160) / (14 * at.scale);
}

/** Rows 170 to 179 of a picture 160 columns wide: the hill under the inrun in the test below. */
function bottomRows(pixels: Uint32Array): number[] {
  return Array.from(pixels.subarray(170 * 160, 180 * 160));
}

describe("the floodlights' light on the hill at night", () => {
  const profiles = OWN_HILLS.map((choice) => choice.profile);

  it("lights the hill fully from just before the first mast all the way down, landing area and outrun included", () => {
    for (const h of profiles) {
      const from = firstMastXM(h) - FLOODLIGHT.fullLightM;
      expect(from).toBeLessThan(h.takeoffXM);
      const xs = Array.from({ length: 200 }, (_x, k) => from + k * 1.5);
      expect(xs.filter((x) => floodlightStep(h, x) !== 0)).toEqual([]);
      expect(floodlightStep(h, h.outrunStartXM + 100)).toBe(0);
    }
  });

  it("weakens in steps up the inrun, and the top of the inrun is the weakest", () => {
    for (const h of profiles) {
      const xs = Array.from({ length: 120 }, (_x, k) => h.takeoffXM - k);
      const steps = xs.map((x) => floodlightStep(h, x));
      expect(steps).toEqual(steps.toSorted((a, b) => a - b));
      expect(new Set(steps).size).toBe(FLOODLIGHT.stepShares.length + 1);
      expect(floodlightStep(h, h.startXM)).toBe(FLOODLIGHT.stepShares.length);
    }
    expect(FLOODLIGHT.stepShares).toEqual(FLOODLIGHT.stepShares.toSorted((a, b) => a - b));
    expect(Math.max(...FLOODLIGHT.stepShares)).toBeLessThan(1);
  });

  it("builds each step's palette between the lit and the moonlit ones, the lit one first", () => {
    const near = new Uint32Array(256).fill(0xffc8c8c8);
    const far = new Uint32Array(256).fill(0xff141414);
    const palettes = floodlightPalettes(near, far);
    expect(palettes[0]).toBe(near);
    expect(floodlightPalettes(near, far)).toBe(palettes);
    const reds = palettes.map((pal) => (pal[7] ?? 0) & 0xff);
    expect(reds).toEqual([200, ...FLOODLIGHT.stepShares.map((share) => Math.round(200 - 180 * share))]);
  });

  it.each(HILLS)("keeps the light of every place on the hill where it is while the camera moves ($id)", ({ hill }) => {
    const h = hill.profile;
    const a = farEdgeColours(h, h.takeoffXM - 8);
    const b = farEdgeColours(h, h.takeoffXM - 4);
    const shared = [...a.keys()].filter((j) => b.has(j));
    expect(shared.length).toBeGreaterThan(40);
    expect(shared.map((j) => b.get(j))).toEqual(shared.map((j) => a.get(j)));
    // The picture shows more than one step, so the comparison sees the steps themselves.
    expect(new Set(shared.map((j) => a.get(j))).size).toBeGreaterThan(1);
  });

  it.each(HILLS)(
    "keeps full light starting at the same place on the hill, across it and below it, as the camera moves ($id)",
    ({ hill }) => {
      const h = hill.profile;
      const at = (xM: number, liftM = 0) => sceneView(xM, inrunYM(h, xM) + liftM, 432, 1.2);
      // At the takeoff and past it, and at the takeoff with the camera lower down; all a little below the inrun, so
      // the rows under the near edge stay in the picture on every own hill.
      const views = [at(h.takeoffXM, -1), at(h.takeoffXM + 4, -1), at(h.takeoffXM, -4)];
      for (const row of [{ across: 0.5 }, { across: 0.9 }, { below: 6 }]) {
        const xs = views.map((view) => fullLightFromXM(h, view, row));
        // Full light starts in sight in every view, so each finds it.
        expect(xs.map((x) => x !== null)).toEqual(views.map(() => true));
        const found = xs.flatMap((x) => (x === null ? [] : [x]));
        // Within two columns of the nearest depth these rows show (a column there is under 0.1 m).
        expect(Math.max(...found) - Math.min(...found)).toBeLessThan(0.2);
      }
    },
  );

  it.each(HILLS)(
    "is drawn only at night: at dusk the hill under the inrun keeps the lit colours ($id)",
    ({ hill: choice }) => {
      const h = choice.profile;
      // The jumper 10 m before the takeoff, with the hill under the inrun in the lower rows.
      const start = startTrainingJump(choice, 3).state;
      const xM = h.takeoffXM - 10;
      const state = { ...start, jumper: { ...start.jumper, xM, yM: inrunYM(h, xM) } };
      const draw = (floodlights: "dusk" | "night" | undefined) => {
        const fb = new FrameBuffer(160, 200);
        // The colours of the night, so that the lit and the moonlit palettes differ.
        withLook({ lighting: "night", fog: false }, () =>
          drawHillScene(
            fb,
            {
              profile: h,
              kPointM: choice.kPointM,
              look: choice.look,
              state,
              outfit: DEFAULT_OUTFIT,
              leader: false,
              recordM: 0,
              pixelWidth: 1,
              ...(floodlights === undefined ? {} : { floodlights }),
            },
            180,
          ),
        );
        return fb.pixels;
      };
      const plain = draw(undefined);
      const dusk = draw("dusk");
      const night = draw("night");
      // Below the far edge the hill is drawn in the same colours at dusk as without the lights' changes.
      expect(bottomRows(dusk)).toEqual(bottomRows(plain));
      expect(bottomRows(night)).not.toEqual(bottomRows(plain));
    },
  );
});
