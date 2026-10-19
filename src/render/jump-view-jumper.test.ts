import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { DEFAULT_OUTFIT, OUTFIT_COLOR_COUNT, type Outfit } from "../game/outfit";
import { startTrainingJump } from "../game/training-session";
import { FrameBuffer } from "./frame-buffer";
import { drawFigure } from "./jump-view-jumper";
import { color } from "./palette";

const hill = OWN_HILLS[0];
const ANCHOR = { x: 80, y: 150, pxPerMX: 12, pxPerMY: 12 };

/** How many pixels of the figure, drawn alone on an empty picture, have the colour `packed`. */
function countOf(outfit: Outfit, leader: boolean, packed: number): number {
  if (!hill) throw new Error("no hill");
  const fb = new FrameBuffer(160, 200);
  drawFigure(fb, hill.profile, startTrainingJump(hill, 3).state, ANCHOR, outfit, leader);
  return fb.pixels.filter((p) => p === packed).length;
}

describe("the jumper's torso", () => {
  it("has its own light colour, whatever the outfit, as in the original", () => {
    const torso = color("torso");
    const counts = Array.from({ length: OUTFIT_COLOR_COUNT }, (_v, i) =>
      countOf({ ...DEFAULT_OUTFIT, pants: i }, false, torso),
    );
    expect(counts[0]).toBeGreaterThan(0);
    expect(new Set(counts).size).toBe(1);
    expect(countOf(DEFAULT_OUTFIT, false, color("torsoLeader"))).toBe(0);
  });

  it("is yellow on the leader of a World Cup, in place of the light one", () => {
    const plain = countOf(DEFAULT_OUTFIT, false, color("torso"));
    expect(countOf(DEFAULT_OUTFIT, true, color("torsoLeader"))).toBe(plain);
    expect(countOf(DEFAULT_OUTFIT, true, color("torso"))).toBe(0);
  });
});
