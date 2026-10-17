import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.pageTitle;
const withApp = (screen: string): string => T.withApp(screen, UI_TEXT.appName);

/** What the title needs to know about the screen shown (the screens of the application fit this shape). */
export type TitledScreen =
  | { kind: "menu" }
  | { kind: "hills" }
  | { kind: "outfit" }
  | { kind: "howto" }
  | { kind: "install" }
  | { kind: "about" }
  | { kind: "settings" }
  | { kind: "replays" }
  | { kind: "contest-setup" }
  | { kind: "contest"; hill: { name: string; kPointM: number } }
  | { kind: "jump"; hill: { name: string; kPointM: number } };

/**
 * Title of the page for a screen. Each screen has its own, so a browser tab, the history and a screen reader say
 * where the player is; the name of the game comes last, after what changes.
 */
export function screenTitle(screen: TitledScreen): string {
  if (screen.kind === "menu") return UI_TEXT.appName;
  if (screen.kind === "hills") return withApp(T.hills);
  if (screen.kind === "outfit") return withApp(T.outfit);
  if (screen.kind === "howto") return withApp(T.howTo);
  if (screen.kind === "install") return withApp(T.install);
  if (screen.kind === "about") return withApp(T.about);
  if (screen.kind === "settings") return withApp(T.settings);
  if (screen.kind === "replays") return withApp(T.replays);
  if (screen.kind === "contest-setup") return withApp(T.competitionSetup);
  if (screen.kind === "contest")
    return withApp(T.competition(UI_TEXT.hillLabel(screen.hill.name, screen.hill.kPointM)));
  return withApp(T.jump(UI_TEXT.hillLabel(screen.hill.name, screen.hill.kPointM)));
}
