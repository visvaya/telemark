/**
 * When the buttons of a scripted jump go down, on the page's own clock, counted from the moment the jumper leaves
 * the gate. Kept apart from the Playwright code, so a unit test can run the same presses in the simulation.
 *
 * The game runs in real time at 70 simulation steps a second, so the browser tests play like a player: by time.
 * The values sit in the middle of windows measured by running the built-in hill in the simulation with 40 seeds:
 * a short press of both buttons between 3.30 s and 4.09 s after the start takes off (the edge of the inrun comes
 * at 3.71 s; a press just after it still counts), a press of the right button between 0.20 s and 0.95 s later
 * prepares the landing, and the left button up to 0.40 s after it puts the telemark down at once, which makes the
 * landing clean wherever in the flight it happens. Outside the takeoff window the jump ends in a fall or without
 * a distance.
 */
export const JUMP_TIMING = {
  TAKEOFF_AFTER_START_MS: 3690,
  LANDING_AFTER_TAKEOFF_MS: 580,
  TELEMARK_AFTER_LANDING_MS: 200,
  /** How long each scripted press holds its button down. */
  PRESS_HOLD_MS: 60,
} as const;
