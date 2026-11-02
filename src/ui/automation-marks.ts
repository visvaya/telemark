import { PHASE, type JumpLogicState } from "../sim/jump-logic";

/**
 * The simulation frame in which the jumper left the gate, carried from one drawn frame to the next: null at the
 * gate. On the inrun the frames counted there tell the exact frame, however many steps the frame took.
 */
export function startFrameOf(
  previous: number | null,
  logic: Pick<JumpLogicState, "frame" | "phase" | "inrunFrames">,
): number | null {
  if (logic.phase === PHASE.gate) return null;
  if (previous !== null && previous <= logic.frame) return previous;
  return logic.frame - (logic.phase === PHASE.inrun ? logic.inrunFrames : 0);
}

/**
 * Whether the page is driven by automation (`navigator.webdriver`): then the jump picture carries the simulation
 * frame, the frame of the start and whether the jump is over, so the browser tests press by the game's own steps and
 * not by the clock. A player's browser does not set the flag, and the loop writes nothing.
 */
export function automated(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver;
}
