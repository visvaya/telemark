/** What the full-screen switch in the settings shows. */
export type FullscreenSwitch = "hidden" | "on" | "off";

interface FullscreenState {
  /** Whether the page may ask for the full screen (`document.fullscreenEnabled`). */
  readonly enabled: boolean;
  /** A screen played with fingers (`(pointer: coarse)`). */
  readonly touch: boolean;
  /** The page's own full screen, which it can leave. */
  readonly own: boolean;
  /** `(display-mode: fullscreen)`: the page's full screen, the browser's (F11) or the installed app's. */
  readonly reported: boolean;
}

export function fullscreenSwitch({ enabled, touch, own, reported }: FullscreenState): FullscreenSwitch {
  if (!enabled) return "hidden";
  // A touch screen has no F11, so a full screen the page did not ask for is the installed app's (`display:
  // fullscreen` in the manifest). Only the system leaves it, and a switch reading "on" would have nothing to do.
  if (touch && reported && !own) return "hidden";
  return own || reported ? "on" : "off";
}
