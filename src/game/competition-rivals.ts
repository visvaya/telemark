import type { CountryCode } from "../render/flags";
import type { Outfit } from "./outfit";

/** A computer jumper of the competition: a made-up name, a country and colours (indexes of OUTFIT_SWATCHES). */
export interface Rival {
  name: string;
  country: CountryCode;
  outfit: Outfit;
}

/** The eight computer jumpers, in the order of their places in the competition settings. */
export const RIVALS: readonly Rival[] = [
  { name: "Aatu Lehtovaara", country: "FI", outfit: { pants: 9, sleeves: 0, gloves: 0, helmet: 9, skis: 1 } },
  { name: "Lars Hovden", country: "NO", outfit: { pants: 2, sleeves: 2, gloves: 0, helmet: 3, skis: 5 } },
  { name: "Matej Brezar", country: "SI", outfit: { pants: 3, sleeves: 0, gloves: 3, helmet: 0, skis: 2 } },
  { name: "Kenji Morioka", country: "JP", outfit: { pants: 4, sleeves: 4, gloves: 0, helmet: 4, skis: 1 } },
  { name: "Florian Hasenauer", country: "AT", outfit: { pants: 5, sleeves: 5, gloves: 0, helmet: 5, skis: 3 } },
  { name: "Tomasz Wierzbicki", country: "PL", outfit: { pants: 6, sleeves: 6, gloves: 6, helmet: 0, skis: 4 } },
  { name: "Jonas Kellerhals", country: "CH", outfit: { pants: 7, sleeves: 7, gloves: 0, helmet: 7, skis: 6 } },
  { name: "Mikael Sundqvist", country: "SE", outfit: { pants: 10, sleeves: 10, gloves: 1, helmet: 10, skis: 7 } },
];

/** The colours of "Gracz 2" to "Gracz 8"; "Gracz 1" wears the outfit of the game's settings. */
export const PLAYER_OUTFITS: readonly Outfit[] = [
  { pants: 9, sleeves: 9, gloves: 0, helmet: 9, skis: 4 },
  { pants: 11, sleeves: 11, gloves: 0, helmet: 11, skis: 0 },
  { pants: 0, sleeves: 0, gloves: 8, helmet: 8, skis: 1 },
  { pants: 3, sleeves: 3, gloves: 0, helmet: 3, skis: 5 },
  { pants: 1, sleeves: 6, gloves: 6, helmet: 6, skis: 2 },
  { pants: 7, sleeves: 2, gloves: 2, helmet: 2, skis: 3 },
  { pants: 5, sleeves: 11, gloves: 11, helmet: 11, skis: 6 },
];
