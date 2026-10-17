import type { Competitor, JumpScore } from "../game/competition";
import { PLAYER_OUTFITS, RIVALS } from "../game/competition-rivals";
import { DEFAULT_OUTFIT, type Outfit } from "../game/outfit";
import type { CountryCode } from "../render/flags";
import { UI_TEXT } from "../text/ui-text";
import { formatDecimal } from "./number-text";

const T = UI_TEXT.competition;

/** The name of a competitor: "Gracz n" for a player, the made-up name of a computer jumper. */
export function competitorName(c: Competitor | undefined): string {
  if (c === undefined) return "";
  return c.kind === "player" ? T.playerName(c.slot + 1) : (RIVALS[c.slot]?.name ?? "");
}

/** The country of a computer jumper; none for a player. */
export function competitorCountry(c: Competitor | undefined): CountryCode | null {
  return c?.kind === "cpu" ? (RIVALS[c.slot]?.country ?? null) : null;
}

/** The colours a competitor jumps in; "Gracz 1" wears the player's own. */
export function competitorOutfit(c: Competitor | undefined, own: Outfit): Outfit {
  if (c === undefined) return own;
  if (c.kind === "cpu") return RIVALS[c.slot]?.outfit ?? DEFAULT_OUTFIT;
  return c.slot === 0 ? own : (PLAYER_OUTFITS[c.slot - 1] ?? DEFAULT_OUTFIT);
}

/** A jump as the tables write it: distance and points, and a fall when there was one. */
export function jumpText(s: JumpScore | null): string {
  if (s === null) return T.noJump;
  const text = T.jump(formatDecimal(s.distanceM, 1), formatDecimal(s.points, 1));
  return s.fell ? `${text}, ${T.fell}` : text;
}
