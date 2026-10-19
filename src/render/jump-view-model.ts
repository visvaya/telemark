import type { ContestJumpHud } from "../game/competition-board";
import type { Outfit } from "../game/outfit";
import type { HillProfile } from "../sim/hill-profile";
import type { JumpSimState } from "../sim/jump-sim";
import type { HillLook } from "./hill-look";
import type { Lighting } from "./palette";

/** Look of the scene; purely visual, the simulation never sees it. */
export interface Scenery {
  lighting: Lighting;
  snowfall: boolean;
  fog: boolean;
}

export const DAY_SCENERY: Scenery = { lighting: "day", snowfall: false, fog: false };

/** How the player steers: the prompts name the matching controls. */
export type ControlScheme = "mouse" | "touch" | "tilt";

export interface JumpViewModel {
  profile: HillProfile;
  kPointM: number;
  /** How the hill looks besides its profile; this project's own look when absent. */
  look?: HillLook;
  hillName: string;
  /** Whether the picture tells what to press and when; it does unless this is false. */
  hints?: boolean;
  /** Game pixels the name of the hill starts from the left, when a control of the page lies over that corner. */
  titleInsetPx?: number;
  /** Row the name of the hill's capitals start at, when a control of the page beside it sets it. */
  titleTopPx?: number;
  playerName: string;
  state: JumpSimState;
  controls: ControlScheme;
  /**
   * Presentation clock in simulation frames; keeps running after the simulation stops,
   * so the judges' notes still appear one by one.
   */
  frame: number;
  /** The simulation has stopped (the jumper stands still). */
  over: boolean;
  /** Hill record distance, drawn as a line on the landing hill. */
  recordM?: number;
  /** The jump of the hill's record at the same moment, drawn as a ghost beside the jumper. */
  ghost?: JumpSimState;
  /** This jump set a new hill record. */
  newRecord?: boolean;
  /** Time of day and weather; a clear day when absent. */
  scenery?: Scenery;
  /** The jumper's colours; the original's player 1 when absent. */
  outfit?: Outfit;
  /** The jumper leads a World Cup and wears the leader's yellow torso; absent otherwise. */
  leader?: boolean;
  /** Accumulated drift of the displayed wind, in metres, for the falling snow. */
  windDriftM?: { x: number; y: number };
  /**
   * Set while a recorded jump is played again: its tempo as text, whether it is paused, and whether a press once
   * it is over opens the menu (a replay of the original) rather than starting a jump.
   */
  replay?: { speedLabel: string; paused: boolean; menuAtEnd: boolean };
  /**
   * In a competition jump (not in a replay of it): what leads, which the gate shows and the landing hill marks as a
   * line, and what the bar needs for the total and the place after the jump.
   */
  contest?: ContestJumpHud;
}
