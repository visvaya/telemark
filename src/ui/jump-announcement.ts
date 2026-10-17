import type { JumpLogicState } from "../sim/jump-logic";
import { UI_TEXT } from "../text/ui-text";
import type { ReplayOrigin } from "./jump-replay";
import { formatDecimal } from "./number-text";

const T = UI_TEXT.announcement;

/** What a screen reader hears when the jumper leaves the gate. */
export const JUMP_STARTED_ANNOUNCEMENT = T.jumpStarted;

type Touchdown = Pick<JumpLogicState, "distanceM" | "fallType">;
type ScoredJump = Pick<JumpLogicState, "distanceM" | "fallType" | "points" | "judges">;

interface ResultContext {
  newRecord: boolean;
  /** How the game is played: it decides what starts the next jump. */
  controls: "mouse" | "touch" | "tilt";
  /** A competition jump: a press goes on to the next jumper rather than jumping again. */
  contest?: boolean;
}

/** A jump without a distance is a disqualification: the start time ran out, or the jumper never left the inrun. */
function outcome(jump: Touchdown): string {
  if (jump.distanceM === 0) return T.disqualified;
  const distance = T.distance(formatDecimal(jump.distanceM, 2));
  return jump.fallType === 0 ? T.landing(distance) : T.fall(distance);
}

/** Said in the frame the jump is scored, while the jumper is still moving; a new record is known by then. */
export function touchdownAnnouncement(jump: Touchdown, newRecord = false): string {
  return newRecord ? `${outcome(jump)}. ${T.record}` : `${outcome(jump)}.`;
}

/** The outcome again, the five notes, the points and a new record. */
function resultParts(jump: ScoredJump, newRecord: boolean): string[] {
  const notes = jump.judges.map((judge) => formatDecimal(judge.note, 1)).join("; ");
  return [
    `${outcome(jump)}.`,
    ...(jump.distanceM === 0 ? [] : [T.notes(notes)]),
    T.points(formatDecimal(jump.points, 1)),
    ...(newRecord ? [T.record] : []),
  ];
}

/** Said once the jumper has stopped: the result, and how to jump again. */
export function resultAnnouncement(jump: ScoredJump, context: ResultContext): string {
  const next = context.contest === true ? T.contestNext : T.nextJump;
  return [...resultParts(jump, context.newRecord), T.replayReady[context.controls], next[context.controls]].join(" ");
}

/** Said once a replay is over: the result as the jump had it, and what a press of the picture does now. */
export function replayOverAnnouncement(jump: ScoredJump, newRecord: boolean, origin: ReplayOrigin | "contest"): string {
  return [...resultParts(jump, newRecord), origin === "contest" ? T.contestOver : T.replayOver[origin]].join(" ");
}
