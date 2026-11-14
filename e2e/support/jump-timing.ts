/**
 * When the buttons of a scripted jump go down, by the state of the jump as the page shows it to an automated test
 * (src/ui/jump-probe.ts): the takeoff by where the jumper is, the rest by frames of the simulation counted from the
 * takeoff. Kept apart from the Playwright code, so a unit test can run the same presses in the simulation.
 *
 * Not by the clock: on a loaded machine the game drops time it cannot keep up with (at most 8 steps of the
 * simulation for one animation frame), so the jumper falls behind the clock and a press by time comes early.
 *
 * The values sit inside windows measured by running the built-in hill in the simulation with 12 seeds
 * (2026-11-03): both buttons pressed 4.5 m before the edge of the takeoff, or up to 35 frames (half a second) after
 * that, take off cleanly, held for a moment as a mouse holds them or tapped one after the other as on a touch
 * screen (a tap counts for one frame); a press of the right button between 14 and 101 frames after the takeoff
 * prepares the landing, and the left button up to 28 frames after it puts the telemark down at once, which makes
 * the landing clean wherever in the flight it happens. Earlier than about 5 m a tap starts the takeoff so soon
 * that the jumper leaves the inrun before the edge. The mouse presses both buttons for the landing as one chord:
 * pressed apart in WebKit, the left one came up to 38 frames after the right one.
 */
export const JUMP_TIMING = {
  TAKEOFF_LEAD_M: 4.5,
  LANDING_AFTER_TAKEOFF_FRAMES: 41,
  /**
   * The least frames between the end of the takeoff press and the landing: the game takes a landing only once both
   * buttons are up, and a slow press (WebKit) can still hold them when the landing is due.
   */
  FRAMES_AFTER_RELEASE: 3,
  TELEMARK_AFTER_LANDING_FRAMES: 7,
  /** How long each scripted press holds its button down. */
  PRESS_HOLD_MS: 60,
  /**
   * A jump played with chords, both buttons at once (e2e/input.spec.ts): the takeoff chord at the same place, the
   * landing chord this many frames after it, at the very beginning of the flight. Its first button prepares the
   * landing and its second puts the telemark down: the jump lands clean when both buttons of both chords count,
   * and falls when the second button of the landing chord is lost, because a landing prepared this early and never
   * put down is held too long.
   */
  LANDING_CHORD_AFTER_TAKEOFF_FRAMES: 34,
  /** How long a chord holds its buttons down. */
  CHORD_HOLD_MS: 100,
} as const;
