import { describe, expect, it } from "vitest";
import { hillChoiceOf, OWN_HILLS } from "../game/hill-choice";
import type { HillSpec } from "../hills/hill-spec";
import { OWN_HILL_SPECS } from "../hills/own-hills";
import { buildHillProfile } from "../sim/hill-setup";
import {
  drawnSceneLengthOf,
  hillLayerTables,
  LAYER_TABLE_LENGTH_M,
  SCENE_LENGTH_MAX_M,
  SCENE_PAST_OUTRUN_LOWEST_M,
  sceneLengthOf,
  tableRange,
} from "./hill-layer-tables";
import { layerX } from "./scene-layers";

/** The game's largest hill, whose outrun's lowest point lies nearest the original's scene's end. */
const largest = OWN_HILL_SPECS.toSorted((x, y) => y.kPointM - x.kPointM)[0];
if (largest === undefined) throw new Error("no own hill");
const base: HillSpec = largest;

/** The largest hill's data with its landing hill and outrun moved `byM` metres further along the scene. */
function movedBy(byM: number): HillSpec {
  const { inrun, landing } = base.profile;
  // The outrun's parabola follows its start and the landing hill, so moving both moves it too.
  return {
    ...base,
    id: "moved",
    profile: {
      inrun,
      landing: { ...landing, centerXM: landing.centerXM + byM, outrunStartXM: landing.outrunStartXM + byM },
    },
  };
}

describe("the length of the scene", () => {
  it("keeps the original's 380 m for every hill the game has today", () => {
    for (const hill of OWN_HILLS) expect(drawnSceneLengthOf(hill.profile)).toBe(LAYER_TABLE_LENGTH_M);
  });

  it("reaches past the outrun's lowest point as far as a jumper coasts, up to the longest scene", () => {
    const moved = movedBy(60);
    const profile = buildHillProfile(moved.profile.inrun, moved.profile.landing);
    const lowest = Math.max(profile.outrunStartXM, -profile.outrunCurveB / (2 * profile.outrunCurveA));
    expect(lowest).toBeGreaterThan(LAYER_TABLE_LENGTH_M);
    expect(sceneLengthOf(profile)).toBe(Math.min(SCENE_LENGTH_MAX_M, Math.ceil(lowest + SCENE_PAST_OUTRUN_LOWEST_M)));
    expect(sceneLengthOf(buildHillProfile(movedBy(400).profile.inrun, movedBy(400).profile.landing))).toBe(
      SCENE_LENGTH_MAX_M,
    );
  });

  it("draws the longer scene for an own hill only, and the original's for any other profile", () => {
    const moved = movedBy(60);
    const own = hillChoiceOf(moved);
    const other = buildHillProfile(moved.profile.inrun, moved.profile.landing);
    expect(drawnSceneLengthOf(own.profile)).toBe(sceneLengthOf(own.profile));
    expect(drawnSceneLengthOf(other)).toBe(LAYER_TABLE_LENGTH_M);
    // The near edge's table covers the scene: its last index lies past the scene's end.
    const layer = 23;
    const lastOf = (h: typeof other) => hillLayerTables(h).nearEdge.first + hillLayerTables(h).nearEdge.rows.length - 1;
    expect(layerX(layer, lastOf(own.profile))).toBeGreaterThan(sceneLengthOf(own.profile));
    expect(lastOf(other)).toBe(tableRange(layer)[1]);
  });

  it("gives the original's table range for the original's length", () => {
    for (const layer of [17, 19, 20, 21, 23]) {
      expect(tableRange(layer)).toEqual(tableRange(layer, LAYER_TABLE_LENGTH_M));
      expect(tableRange(layer, 450)[1]).toBeGreaterThan(tableRange(layer)[1]);
    }
  });
});
