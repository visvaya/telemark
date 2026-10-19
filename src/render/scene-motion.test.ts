import { describe, expect, it } from "vitest";
import { OWN_HILLS, type HillChoice } from "../game/hill-choice";
import { isJumpOver, startTrainingJump, stepTrainingJump, type TrainingJump } from "../game/training-session";
import type { JumpSimState } from "../sim/jump-sim";
import { makeBot } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import { SKY_ROWS } from "./jump-view";
import { drawWindBox } from "./jump-view-hud";
import { layerScroll, skyDrift, type ScreenPoint } from "./scene-anchor";
import {
  BIRD_LAYER,
  birdFlightPx,
  birdPlaces,
  inrunLampPlaces,
  mastPlaces,
  moonInPicture,
  sockPlaces,
  type PropPlace,
} from "./scene-extras";
import { distanceLineEnds, drawFarFence, drawLandingHill, drawNearGround } from "./scene-hill";
import { drawInrunBehind, inrunLook } from "./scene-inrun";
import {
  LAYER,
  SQUARE_PIXEL_WIDTH,
  layerIndex,
  layerOffset,
  originalColumn,
  sceneView,
  type SceneView,
} from "./scene-layers";
import { landingXAtArcLength } from "./scene-lines";
import type { SceneCanvas } from "./scene-span";
import { VIEW_MAX_WIDTH_PX } from "./view-size";

/**
 * Motion invariants of the jump picture over a whole jump. Props and the ends of the distance lines are placed by
 * the same functions their draw code uses, and their gap to the surface under them is read from the pixels that
 * surface's own draw function paints: the gap stays the same, each thing's column shows its own table index or a
 * neighbour of it, nothing turns back while the camera goes one way, and places do not depend on the picture's
 * width beyond its shift. Birds move with their layer, the moon only with the stars' drift, the wind box not at
 * all; those places are computed, not read from pixels.
 */

/** A whole jump is a few hundred frames; on a loaded machine the jump and the checks take a few seconds. */
const MOTION_TIMEOUT_MS = 60_000;
/**
 * Every second frame of the jump is checked on the first own hill; every eighth on the others, whose things are
 * placed by the same code from other tables, so that each further hill costs a few seconds and not tens.
 */
const FRAME_STEP = 2;
const OTHER_HILL_FRAME_STEP = 8;

/** A bot's jump with a landing, frame by frame (every `frameStep`-th), to the end of the outrun. */
function botJump(c: HillChoice, frameStep: number): { frame: number; state: JumpSimState }[] {
  let jump: TrainingJump = startTrainingJump(c, 7);
  const bot = makeBot(
    c.profile,
    { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2, leanPattern: () => 0 },
    () => jump.state,
  );
  const frames: { frame: number; state: JumpSimState }[] = [];
  for (let f = 1; f < 3000 && !isJumpOver(jump); f++) {
    jump = stepTrainingJump(jump, bot(f));
    if (f % frameStep === 0) frames.push({ frame: f, state: jump.state });
  }
  return frames;
}

interface Picture {
  name: string;
  widthPx: number;
  pixelWidth: number;
}

const PICTURES: readonly Picture[] = [
  { name: `${VIEW_MAX_WIDTH_PX} square`, widthPx: VIEW_MAX_WIDTH_PX, pixelWidth: SQUARE_PIXEL_WIDTH },
  { name: "356 square", widthPx: 356, pixelWidth: SQUARE_PIXEL_WIDTH },
  { name: "the original's 320", widthPx: 320, pixelWidth: 1 },
];

/** What a thing stands on, as drawn: the far fence, the inrun's far rail, the far or the near edge of the hill. */
type Surface = "farFence" | "inrunRail" | "farEdge" | "nearEdge";

/** A thing standing on a drawn surface, placed in one view by the same function the draw code uses. */
interface Placed {
  key: string;
  layer: number;
  xM: number;
  surface: Surface;
  at: ScreenPoint;
}

/**
 * Distance lines checked, as the original draws them 0.15 m past a whole metre: two off the marks, at 2/9 and 5/9
 * of the K point (20 m and 50 m on a hill of K90), and the K point's own line.
 */
const lineDistancesM = (kPointM: number): number[] =>
  [Math.round((kPointM * 2) / 9), kPointM, Math.round((kPointM * 5) / 9)].map((m) => m + 0.15);

const props = (name: string, places: readonly PropPlace[], layer: number, surface: Surface): Placed[] =>
  places.map((p) => ({ key: `${name} ${p.index}`, layer, xM: p.xM, surface, at: p.at }));

/** The props and the ends of the distance lines in one view (masts and inrun lamps only by night, as drawn). */
function placedThings(c: HillChoice, view: SceneView, night: boolean): Placed[] {
  const h = c.profile;
  const lines = lineDistancesM(c.kPointM).flatMap((distanceM): Placed[] => {
    const xM = landingXAtArcLength(h, h.takeoffXM, distanceM, 1);
    const [x0, y0, x1, y1] = distanceLineEnds(h, view, distanceM);
    return [
      { key: `far end of the ${distanceM} m line`, layer: LAYER.farEdge, xM, surface: "farEdge", at: [x0, y0] },
      { key: `near end of the ${distanceM} m line`, layer: LAYER.nearEdge, xM, surface: "nearEdge", at: [x1, y1] },
    ];
  });
  return [
    ...props("sock", sockPlaces(h, view), LAYER.farEdge, "farFence"),
    ...(night
      ? [
          ...props("mast", mastPlaces(h, view), LAYER.farEdge, "farFence"),
          ...props("inrun lamp", inrunLampPlaces(h, view), LAYER.inrunFar, "inrunRail"),
        ]
      : []),
    ...lines,
  ];
}

/** Every palette index drawn as one opaque colour: a drawn pixel is any pixel that is not 0. */
const OPAQUE = new Uint32Array(256).fill(0xffffffff);
const PICTURE_ROWS = 200;

/**
 * The top drawn row of each surface under each view column, read from the pixels its own draw function paints
 * (the fence, the inrun, the landing hill and the snow in front of it), -1 where nothing is drawn. This is what
 * a prop is checked against, independently of how the placement module computes the surface's row.
 */
function drawnTops(hill: HillChoice, view: SceneView, fb: FrameBuffer): Record<Surface, Int16Array> {
  const h = hill.profile;
  const c: SceneCanvas = { fb, indices: new Uint8Array(fb.width * fb.height), lastRow: fb.height - 1 };
  const look = hill.look;
  const top = (draw: () => void): Int16Array => {
    fb.pixels.fill(0);
    draw();
    const tops = new Int16Array(fb.width).fill(-1);
    for (let sx = 0; sx < fb.width; sx++) {
      for (let y = 0; y < fb.height; y++) {
        if (fb.pixels[y * fb.width + sx] !== 0) {
          tops[sx] = y;
          break;
        }
      }
    }
    return tops;
  };
  return {
    farFence: top(() => drawFarFence(c, h, view, { kPointM: hill.kPointM, ...look.marks }, OPAQUE)),
    inrunRail: top(() => drawInrunBehind(c, h, inrunLook(look), view, OPAQUE)),
    farEdge: top(() => drawLandingHill(c, h, view, OPAQUE)),
    nearEdge: top(() => drawNearGround(c, h, view, OPAQUE)),
  };
}

/** A bot's jump on one hill, its views in each picture and the surfaces drawn under them. */
interface HillMotion {
  jump: { frame: number; state: JumpSimState }[];
  viewsOf: (p: Picture) => SceneView[];
  surfacesOf: (p: Picture) => Record<Surface, Int16Array>[];
}

function motionOf(hill: HillChoice, frameStep: number): HillMotion {
  const jump = botJump(hill, frameStep);
  const viewsOf = (p: Picture) =>
    jump.map(({ state }) => sceneView(state.jumper.xM, state.jumper.yM, p.widthPx, p.pixelWidth));
  /** The drawn surfaces of every frame of the jump in a picture, drawn once for both lightings. */
  const drawnSurfaces = new Map<string, Record<Surface, Int16Array>[]>();
  const surfacesOf = (p: Picture): Record<Surface, Int16Array>[] => {
    const known = drawnSurfaces.get(p.name);
    if (known !== undefined) return known;
    const fb = new FrameBuffer(p.widthPx, PICTURE_ROWS);
    const all = viewsOf(p).map((view) => drawnTops(hill, view, fb));
    drawnSurfaces.set(p.name, all);
    return all;
  };
  return { jump, viewsOf, surfacesOf };
}

/** Indices `i` of consecutive frames (i - 1, i) within a run of the camera going one way across the picture. */
function steadyCamera(views: readonly SceneView[]): number[] {
  const sign = (i: number) => Math.sign((views[i]?.camX ?? 0) - (views[i - 1]?.camX ?? 0));
  const steady: number[] = [];
  for (let i = 2; i < views.length - 1; i++) {
    const s = sign(i);
    if (s !== 0 && sign(i - 1) === s && sign(i + 1) === s) steady.push(i);
  }
  return steady;
}

/** A place with -0 read as 0 (a column computed as 0.0 less something). */
const unsigned = ([x, y]: ScreenPoint): ScreenPoint => [x + 0, y + 0];

const visible = (p: Picture, [sx]: ScreenPoint) => sx >= 0 && sx < p.widthPx;

const moonAt = (hill: HillChoice, view: SceneView) => moonInPicture(hill.profile, hill.look, view, SKY_ROWS);

/** Every own hill: what is checked here is placed from the hill's data, so each hill is checked the same way. */
const HILLS: readonly { id: string; hill: HillChoice; frameStep: number }[] = OWN_HILLS.map((hill, i) => ({
  id: hill.id,
  hill,
  frameStep: i === 0 ? FRAME_STEP : OTHER_HILL_FRAME_STEP,
}));

describe.each(HILLS)("on $id", ({ hill, frameStep }) => {
  const { jump, viewsOf, surfacesOf } = motionOf(hill, frameStep);

  describe.each([
    { lighting: "day", night: false },
    { lighting: "night", night: true },
  ])("motion of the jump picture by $lighting", ({ night }) => {
    it(
      "keeps props and line ends on the surfaces drawn under them, at their own table index",
      () => {
        // The gap between a thing's foot and the top of the surface drawn under it, per thing, in every picture.
        const gaps = new Map<string, Set<number>>();
        for (const p of PICTURES) {
          const views = viewsOf(p);
          const allTops = surfacesOf(p);
          views.forEach((view, i) => {
            const tops = allTops[i];
            if (tops === undefined) throw new Error(`no frame ${i}`);
            for (const thing of placedThings(hill, view, night)) {
              const [sx, row] = thing.at;
              if (!visible(p, thing.at)) continue;
              const top = tops[thing.surface][sx] ?? -1;
              // Where the surface is cut off by the top of the picture, or not drawn there, there is no gap to read.
              if (top > 0) gaps.set(thing.key, (gaps.get(thing.key) ?? new Set()).add(row - top));
              // Moves exactly as its layer scrolls: its column shows its own table index or, where the view skips
              // that index, a neighbour of it.
              const shown = layerOffset(view, thing.layer).x + originalColumn(view, sx);
              expect(
                Math.abs(shown - layerIndex(thing.layer, thing.xM)),
                `${thing.key}, ${p.name}`,
              ).toBeLessThanOrEqual(p.pixelWidth === 1 ? 0 : 1);
            }
          });
        }
        const moving = [...gaps]
          .filter(([, set]) => set.size > 1)
          .map(([key, set]) => `${key}: ${[...set].join(", ")}`);
        expect(moving).toEqual([]);
        // The jump shows the props it is meant to check: the six ends of the distance lines and at least one wind
        // sock by day, and masts and lamps besides by night.
        expect(gaps.size).toBeGreaterThanOrEqual(night ? 13 : 7);
      },
      MOTION_TIMEOUT_MS,
    );

    it(
      "never turns a thing back while the camera goes one way",
      () => {
        for (const p of PICTURES) {
          const views = viewsOf(p);
          const steady = steadyCamera(views);
          expect(steady.length).toBeGreaterThan(jump.length / 2);
          for (const i of steady) {
            const before = views[i - 1];
            const after = views[i];
            if (before === undefined || after === undefined) throw new Error(`no frame ${i}`);
            const camera = Math.sign(after.camX - before.camX);
            const was = new Map(placedThings(hill, before, night).map((thing) => [thing.key, thing.at]));
            const turns = placedThings(hill, after, night).filter(({ key, at }) => {
              const a = was.get(key);
              // The picture moves against the camera.
              return a !== undefined && visible(p, a) && visible(p, at) && Math.sign(at[0] - a[0]) * camera > 0;
            });
            expect(
              turns.map((thing) => thing.key),
              `${p.name}, frame ${i}`,
            ).toEqual([]);
          }
        }
      },
      MOTION_TIMEOUT_MS,
    );

    it(
      "places things against the scenery the same way whatever the picture's width",
      () => {
        const [wide, narrow] = PICTURES;
        if (wide === undefined || narrow === undefined) throw new Error("no pictures");
        const shift = (wide.widthPx - narrow.widthPx) / 2;
        const narrowViews = viewsOf(narrow);
        viewsOf(wide).forEach((view, i) => {
          const other = narrowViews[i];
          if (other === undefined) throw new Error(`no frame ${i}`);
          const inWide = new Map(placedThings(hill, view, night).map((thing) => [thing.key, thing.at]));
          // What the narrow picture places, the wide one places too, shifted by half the difference of the widths.
          const inNarrow = placedThings(hill, other, night);
          expect(
            inNarrow.map(({ key, at }) => [key, unsigned(at)]),
            `frame ${i}`,
          ).toEqual(
            inNarrow.map(({ key }) => {
              const [x, y] = inWide.get(key) ?? [Number.NaN, Number.NaN];
              return [key, unsigned([x - shift, y])];
            }),
          );
        });
      },
      MOTION_TIMEOUT_MS,
    );
  });

  describe("the moon in the jump picture", () => {
    it(
      "keeps to one place of the sky for the whole jump",
      () => {
        for (const p of PICTURES) {
          const places = new Set(
            viewsOf(p).map((view) => {
              const [x, y] = moonAt(hill, view);
              return `${x + skyDrift(view)},${y}`;
            }),
          );
          expect([...places], `picture ${p.name}`).toHaveLength(1);
        }
      },
      MOTION_TIMEOUT_MS,
    );

    it(
      "never turns back while the camera goes one way",
      () => {
        for (const p of PICTURES) {
          const views = viewsOf(p);
          const turns = steadyCamera(views).filter((i) => {
            const before = views[i - 1];
            const after = views[i];
            if (before === undefined || after === undefined) return true;
            return (
              Math.sign(moonAt(hill, after)[0] - moonAt(hill, before)[0]) * Math.sign(after.camX - before.camX) > 0
            );
          });
          expect(turns, `picture ${p.name}`).toEqual([]);
        }
      },
      MOTION_TIMEOUT_MS,
    );
    // Its place is not compared between widths: its usual place is a share of the picture's width, so a narrower
    // picture shows it at a place of its own, still fixed for the jump.
  });

  describe("the birds in the jump picture", () => {
    const h = hill.profile;

    it(
      "fly with their layer, across and up or down",
      () => {
        const span = VIEW_MAX_WIDTH_PX + 60;
        for (const p of PICTURES) {
          const views = viewsOf(p);
          const start = views[0];
          if (start === undefined) throw new Error("no frames");
          const worst = { across: 0, bob: 0 };
          views.forEach((view, i) => {
            const frame = jump[i]?.frame ?? 0;
            const scroll = layerScroll(view, BIRD_LAYER);
            const drop = scroll.y - layerScroll(start, BIRD_LAYER).y;
            birdPlaces(h, view, frame).forEach(([sx, sy], bird) => {
              // Across: its own flight less the layer's scroll, wrapped around the birds' span.
              const across = sx - (p.widthPx - span) / 2 - (birdFlightPx(bird, frame) - scroll.x);
              worst.across = Math.max(worst.across, Math.abs((((across % span) + span + span / 2) % span) - span / 2));
              // Up and down: with the layer, bobbing at most 2 rows around its height.
              worst.bob = Math.max(worst.bob, Math.abs(sy - drop - (12 + bird * 6)));
            });
          });
          expect(worst.across, `picture ${p.name}`).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(worst.bob, `picture ${p.name}`).toBeLessThanOrEqual(2);
        }
      },
      MOTION_TIMEOUT_MS,
    );

    it(
      "keep their places whatever the picture's width",
      () => {
        const [wide, narrow] = PICTURES;
        if (wide === undefined || narrow === undefined) throw new Error("no pictures");
        const shift = (wide.widthPx - narrow.widthPx) / 2;
        const narrowViews = viewsOf(narrow);
        viewsOf(wide).forEach((view, i) => {
          const frame = jump[i]?.frame ?? 0;
          const other = narrowViews[i];
          if (other === undefined) throw new Error(`no frame ${i}`);
          expect(birdPlaces(h, other, frame).map(unsigned)).toEqual(
            birdPlaces(h, view, frame).map(([bx, by]) => unsigned([bx - shift, by])),
          );
        });
      },
      MOTION_TIMEOUT_MS,
    );
  });

  describe("the interface of the jump picture", () => {
    it(
      "stays fixed to the picture",
      () => {
        const fb = new FrameBuffer(VIEW_MAX_WIDTH_PX, 200);
        const boxes = new Set(
          jump.map(({ state }) => {
            fb.pixels.fill(0);
            drawWindBox(fb, state);
            let [left, top, right, bottom] = [fb.width, fb.height, -1, -1];
            for (let i = 0; i < fb.pixels.length; i++) {
              if (fb.pixels[i] === 0) continue;
              const x = i % fb.width;
              const y = (i - x) / fb.width;
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
            return `${left},${top},${right},${bottom}`;
          }),
        );
        expect([...boxes]).toHaveLength(1);
      },
      MOTION_TIMEOUT_MS,
    );
  });
});
