import { UI_TEXT } from "../text/ui-text";

/** The version of the game, from package.json (the build writes it in: vite.config.ts). */
export const GAME_VERSION: string = import.meta.env.GAME_VERSION;

/** Where the source code of the game is published. */
export const SOURCE_CODE_URL = "https://github.com/visvaya/telemark";

/** How the version is shown to the player. */
export function versionLabel(version: string = GAME_VERSION): string {
  return UI_TEXT.version(version);
}
