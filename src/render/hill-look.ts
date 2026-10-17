/**
 * How a hill looks, besides its profile: what the original's hill setup (0baf:631c) passes to its scenery routines.
 * Colours are palette indices of the scene palette, the sky a 6-bit RGB colour.
 */
export interface HillLook {
  /** Colour the sky fades to at the horizon (003f:9da5). */
  skyRgb6: readonly [number, number, number];
  /** Background hills (0baf:1c31): seed and size of their sine waves, and the base height over the outrun's bottom. */
  terrain: { seed: number; amplitudeM: number; baseOverOutrunM: number };
  /**
   * Trees (0baf:602e): two kinds, how many of each, where along the hill and the seed; some hills then take a few
   * of them out of sight (records `first`..`last`, from 1, of a layer).
   */
  trees: {
    firstCount: number;
    secondCount: number;
    fromXM: number;
    toXM: number;
    seed: number;
    hidden: readonly { layer: number; first: number; last: number }[];
  };
  /** Supports under the inrun (1eee:0437): from and to in metres, side and front colours. */
  supports: readonly InrunSupport[];
  inrun: {
    /** Back of the start platform, in metres. */
    platformStartXM: number;
    /** Rows of the near wall above the track and below it. */
    nearWallUpPx: number;
    nearWallDownPx: number;
    /** Palette index of the walls' darkest shade. */
    wallColour: number;
    /** Palette index of the start gate's far half; the near half is the next index. */
    gateColour: number;
  };
  marks: {
    /** Distance of the first mark before the K point and how many there are, every 5 m. */
    firstMarkM: number;
    markCount: number;
    /** Palette index of the fences' darkest shade. */
    fenceColour: number;
    /** Extra distance past the takeoff before the fences start, in metres. */
    fenceStartM: number;
  };
}

export interface InrunSupport {
  fromXM: number;
  toXM: number;
  colour: number;
  frontColour: number;
}

/**
 * The look of this project's training hill, and of an original hill whose definition lacks the scenery calls: a
 * neutral blue sky, a grey inrun with four supports (the last under the end of the inrun, by the takeoff, as on
 * every hill of the original), gold fences and three marks before the K point (values chosen for this project in
 * the ranges the original's hills use).
 */
export const DEFAULT_HILL_LOOK: HillLook = {
  skyRgb6: [30, 50, 63],
  terrain: { seed: 4321, amplitudeM: 50, baseOverOutrunM: 3 },
  trees: { firstCount: 70, secondCount: 30, fromXM: 50, toXM: 200, seed: 5150, hidden: [] },
  supports: [
    { fromXM: 7, toXM: 9.5, colour: 13, frontColour: 25 },
    { fromXM: 20, toXM: 21, colour: 13, frontColour: 17 },
    { fromXM: 33, toXM: 40, colour: 13, frontColour: 25 },
    { fromXM: 42.5, toXM: 45.7, colour: 13, frontColour: 25 },
  ],
  inrun: { platformStartXM: 6, nearWallUpPx: 12, nearWallDownPx: 11, wallColour: 228, gateColour: 163 },
  marks: { firstMarkM: 75, markCount: 3, fenceColour: 192, fenceStartM: 0 },
};
