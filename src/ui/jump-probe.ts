import type { JumpSimState } from "../sim/jump-sim";

/** What a browser test reads of a jump, to press as a player who watches the jumper would. */
export interface JumpProbe {
  /** The frame of the simulation. */
  frame: number;
  /** How far ahead of the jumper the edge of the takeoff is, in metres; below zero once past it. */
  toEdgeM: number;
  /** The lean of the body in flight, which the mouse and a finger dragged on the left zone change. */
  bodyAngleRad: number;
}

declare global {
  interface Window {
    telemarkJumpProbe?: JumpProbe;
  }
}

export const probeOf = (state: JumpSimState, takeoffXM: number): JumpProbe => ({
  frame: state.logic.frame,
  toEdgeM: takeoffXM - state.jumper.xM,
  bodyAngleRad: state.logic.bodyAngleRad,
});

/**
 * Under automation only (`navigator.webdriver`): puts the probe of each frame where a browser test reads it, so the
 * test presses by where the jumper is, not by the clock, which a loaded machine pulls away from the simulation. A
 * player's browser gets null. The probe is a property of the window, not of the page, so nothing on the page
 * changes with each frame.
 */
export function jumpProbePublisher(takeoffXM: number): ((state: JumpSimState) => void) | null {
  if (!navigator.webdriver) return null;
  return (state) => {
    window.telemarkJumpProbe = probeOf(state, takeoffXM);
  };
}
