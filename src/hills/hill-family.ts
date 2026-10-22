/**
 * The family of the original's hills: how its 37 hills play, relative to their size. Measured relative to K (or
 * a power of it), the way they play hardly depends on the size: the best jump lands 2 to 18% past K on every one
 * of them, the good rival 0 to 14% past it. So one band per measure, spanning all 37, judges a hill of any size,
 * with no step between sizes and no narrowing where the original has few hills (above K200), and reaches past its
 * largest hill as its trend does.
 *
 * A band is the originals' linear trend over K (least squares) and the furthest any original lies from it, each
 * way, widened by a margin for the spread of the measure between samples of winds. Measured 2026-10-22 with the
 * play measures (`playMeasures`) of the 37 hills read from the player's game files; the local comparison with the
 * original's hills checks that every one of them still lies inside (`original-hills*.local.test.ts`). The hills at
 * the edges are the original's unusual ones: the flat K110 is the fastest for its size and the shortest in the air,
 * the steep K220 the slowest and the longest in the air, the K95 lands furthest past K and the K105 the least.
 */

/** The play measures a band reads. */
export interface FamilyMeasures {
  takeoffSpeedMinKmPerH: number;
  takeoffSpeedMaxKmPerH: number;
  bestMedianM: number;
  medianGoodM: number;
  medianGoodFlightS: number;
  highestAboveTerrainP90M: number;
  windSpreadM: number;
}

export interface FamilyBand {
  /** What the band judges, in words for a problem's message. */
  what: string;
  /** The measure, relative to the hill's size so that hills of every size compare. */
  of: (m: FamilyMeasures, kPointM: number) => number;
  /** The originals' trend: its value at K = 0 and its change per metre of K. */
  trendAtZero: number;
  trendPerMetreOfK: number;
  /** How far the originals lie from the trend at most, below it (a negative number) and above it. */
  belowTrend: number;
  aboveTrend: number;
  /** Added on each side for the spread of the measure between samples of winds. */
  margin: number;
  /** Whether a value below the band is a problem: less wind spread or a lower flight is not. */
  boundBelow: boolean;
}

/** The names of the bands, in the order their problems are reported. */
export const FAMILY_BAND_NAMES = ["speed", "best", "good", "flight", "height", "wind"] as const;
export type FamilyBandName = (typeof FAMILY_BAND_NAMES)[number];

const meanSpeedKmPerH = (m: FamilyMeasures): number => (m.takeoffSpeedMinKmPerH + m.takeoffSpeedMaxKmPerH) / 2;

/**
 * The bands. Speed grows as the square root of K, the time in the air as K to the power 0.7, the flight height as
 * the square root of K; the distances and the wind spread as K itself. The margins are about the spread between
 * the three disjoint samples of winds of the stability test: 2 km/h at K180, 1.5% of K of distance, 0.15 s of
 * flight at K100, 0.3 m of height at K100, 0.6% of K of wind spread.
 */
export const FAMILY_BANDS = {
  speed: {
    what: "takeoff speed (km/h) over the square root of K",
    of: (m, k) => meanSpeedKmPerH(m) / Math.sqrt(k),
    trendAtZero: 8.2092,
    trendPerMetreOfK: -0.006447,
    belowTrend: -1.1476,
    aboveTrend: 1.8559,
    margin: 0.15,
    boundBelow: true,
  },
  best: {
    what: "best jump past K as a share of K",
    of: (m, k) => (m.bestMedianM - k) / k,
    trendAtZero: 0.079,
    trendPerMetreOfK: -0.000031,
    belowTrend: -0.0522,
    aboveTrend: 0.1014,
    margin: 0.015,
    boundBelow: true,
  },
  good: {
    what: "good player's median past K as a share of K",
    of: (m, k) => (m.medianGoodM - k) / k,
    trendAtZero: 0.056,
    trendPerMetreOfK: -0.000119,
    belowTrend: -0.0434,
    aboveTrend: 0.0908,
    margin: 0.015,
    boundBelow: true,
  },
  flight: {
    what: "good player's flight time (s) over K to the power 0.7",
    of: (m, k) => m.medianGoodFlightS / k ** 0.7,
    trendAtZero: 0.181,
    trendPerMetreOfK: 0.000031,
    belowTrend: -0.0238,
    aboveTrend: 0.02,
    margin: 0.006,
    boundBelow: true,
  },
  height: {
    what: "90th percentile of the flight height (m) over the square root of K",
    of: (m, k) => m.highestAboveTerrainP90M / Math.sqrt(k),
    trendAtZero: 0.6325,
    trendPerMetreOfK: -0.00019,
    belowTrend: -0.1695,
    aboveTrend: 0.1228,
    margin: 0.03,
    boundBelow: false,
  },
  wind: {
    what: "wind spread of the distance as a share of K",
    of: (m, k) => m.windSpreadM / k,
    trendAtZero: 0.0569,
    trendPerMetreOfK: 0.000023,
    belowTrend: -0.0247,
    aboveTrend: 0.0452,
    margin: 0.006,
    boundBelow: false,
  },
} as const satisfies Record<FamilyBandName, FamilyBand>;

/** The range a band allows on a hill of this K point, margins included; no lower end where it has none. */
export function familyRange(band: FamilyBand, kPointM: number): { min: number; max: number } {
  const trend = band.trendAtZero + band.trendPerMetreOfK * kPointM;
  return {
    min: band.boundBelow ? trend + band.belowTrend - band.margin : Number.NEGATIVE_INFINITY,
    max: trend + band.aboveTrend + band.margin,
  };
}

/** The bands a hill's measures lie outside, with the value and the range each; empty when it plays like the family. */
export function outsideFamily(
  m: FamilyMeasures,
  kPointM: number,
): { name: FamilyBandName; value: number; min: number; max: number }[] {
  return FAMILY_BAND_NAMES.flatMap((name) => {
    const band: FamilyBand = FAMILY_BANDS[name];
    const value = band.of(m, kPointM);
    const { min, max } = familyRange(band, kPointM);
    return value >= min && value <= max ? [] : [{ name, value, min, max }];
  });
}
