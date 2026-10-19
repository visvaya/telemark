import type { CupStandingRow } from "./cup";

/** The places of the podium, in the order they are read. */
const PODIUM_PLACES = [1, 2, 3] as const;

export interface PodiumStep {
  place: (typeof PODIUM_PLACES)[number];
  /** Everybody on that place, in standings order; none when ties above took it or there are too few entrants. */
  rows: readonly CupStandingRow[];
}

/** The three steps of the podium from the cup standings, place 1 first; tied entrants share a step. */
export function cupPodium(rows: readonly CupStandingRow[]): PodiumStep[] {
  return PODIUM_PLACES.map((place) => ({ place, rows: rows.filter((r) => r.place === place) }));
}

/** The standings below the podium, from place 4 down. */
export function cupRest(rows: readonly CupStandingRow[]): CupStandingRow[] {
  return rows.filter((r) => r.place > PODIUM_PLACES.length);
}
