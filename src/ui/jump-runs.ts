import type { RefObject } from "react";
import type { SoundEngine } from "../audio/sound-engine";
import { vibrate } from "../game/haptics";
import type { HillChoice } from "../game/hill-choice";
import { leftTouchLeansOnly, rightTouchEndsPreparation, type PlayerInput } from "../game/player-input";
import {
  isJumpOver,
  newSeed,
  nextJumpAllowed,
  presentationFrame,
  startTrainingJump,
  type TrainingJump,
} from "../game/training-session";
import type { ControlScheme, Scenery } from "../render/jump-view";
import { PHASE, type FrameInput, type JumpLogicState } from "../sim/jump-logic";
import type { JumpSimState } from "../sim/jump-sim";
import { beatsRecord, type HillRecord, type Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import {
  JUMP_STARTED_ANNOUNCEMENT,
  replayOverAnnouncement,
  resultAnnouncement,
  touchdownAnnouncement,
} from "./jump-announcement";
import { recordingSource, replayStart, type JumpRecording, type ReplaySource, type ReplayView } from "./jump-replay";
import { jumpResult, stepJump, type JumpCue, type JumpResult } from "./jump-round";
import type { JumpSounds } from "./jump-sounds";
import { ghostAlong, ghostAtGate, type RecordGhost } from "./record-ghost";

/** What the loop reads anew in every frame: it outlives a render. */
export interface LiveProps {
  /** A jump is over: its result, and the recording that plays it again. */
  onFinished: (result: JumpResult, recording: JumpRecording) => void;
  record: HillRecord | undefined;
  settings: Settings;
  controls: ControlScheme;
  scenery: Scenery;
  /** Whether the player chose another look in this visit: a replay then shows that one, not the jump's own. */
  sceneryChosen: boolean;
  /** How the replay is being watched, while one plays. */
  replay: ReplayView | null;
  /** The replay of the hill's record, played as a ghost beside each training jump; null for none. */
  ghost: ReplaySource | null;
  /**
   * In a competition: what moves on to the next jumper once this jump is over, in place of a new training jump;
   * null in training.
   */
  contestNext: (() => void) | null;
  /** The name the picture gives the jumper, when it is not the player's own (a competitor's). */
  jumperName: string | null;
  /** Whether the replay played is a computer jumper's competition jump, shown as a jump rather than a replay. */
  contestCpu: boolean;
}

/** What the runs need from the screen. */
export interface RunContext {
  live: LiveProps;
  inputRef: RefObject<PlayerInput>;
  /** Lets go of everything held, for a jump that starts again. */
  resetHands: () => void;
  soundRef: RefObject<SoundEngine | null>;
  announce: (text: string) => void;
  /** Tells whether a finished jump can be watched again. */
  onReplayAvailable: (available: boolean) => void;
  /**
   * Tells how the replay is to be watched now, or that none plays; given a function, from how it is watched as
   * the screen has it then, so two presses within one frame both count.
   */
  onReplayChange: (next: ReplayView | null | ((view: ReplayView | null) => ReplayView | null)) => void;
  /** Opens the menu of the jump screen, where a replay of the original goes on once it is over. */
  openMenu: () => void;
}

/** A run of jumps on the hill: what a picture frame does to it, and what starts its jump again. */
interface JumpRun {
  /** Steps the jump by `steps` simulation frames, with the moments that come of it. */
  step: (steps: number) => void;
  /**
   * Handles a jump that is over. Returns whether the jump was over, and its presentation frame, as they were
   * before a new jump started.
   */
  settle: () => { over: boolean; clock: number };
  restart: () => void;
  /**
   * The jump, whether it beats the record (known from the touchdown on), and the record's jump at the same moment
   * while it is shown as a ghost.
   */
  now: () => { jump: TrainingJump; newRecord: boolean; ghost: JumpSimState | null };
}

/** Feels and plays the moments of the jump, and tells a screen reader when the jumper leaves the gate. */
function playCues(cues: readonly JumpCue[], c: RunContext, feel: boolean): void {
  for (const cue of cues) {
    if (cue.kind === "feedback") {
      if (feel && c.live.settings.vibration) vibrate(cue.event);
      c.soundRef.current?.play(cue.event);
      if (cue.event === "start") c.announce(JUMP_STARTED_ANNOUNCEMENT);
    } else {
      c.soundRef.current?.play(cue.event);
    }
  }
}

/**
 * The ghost of the hill's record beside the training jumps: it leaves the gate with the player and keeps level
 * from there. It shows while the player's jumper moves, and goes as soon as the setting or the record does.
 */
function createGhostTrack(hill: HillChoice, source: () => ReplaySource | null) {
  // The ghost at the gate is the same for every jump with one record, so it is played there once.
  let atGate: { source: ReplaySource; ghost: RecordGhost | null } | null = null;
  const fromGate = (): RecordGhost | null => {
    const now = source();
    if (now === null) return null;
    if (atGate?.source !== now) atGate = { source: now, ghost: ghostAtGate(hill, now) };
    return atGate.ghost;
  };
  let ghost = fromGate();
  /** The frame of the player's jump in which the player left the gate; null before. */
  let playerStart: number | null = null;
  /** Sees the player's jump in a frame of its own, so the start is known to the frame within a step. */
  const see = (logic: JumpLogicState) => {
    if (playerStart === null && logic.phase >= PHASE.inrun) playerStart = logic.frame;
  };
  return {
    restart() {
      ghost = fromGate();
      playerStart = null;
    },
    see,
    follow(jump: TrainingJump) {
      const logic = jump.state.logic;
      // A record that arrives, or a ghost switched on, while the player waits at the gate joins this jump.
      if (playerStart === null && ghost?.source !== (source() ?? undefined)) ghost = fromGate();
      see(logic);
      if (ghost !== null && playerStart !== null) ghost = ghostAlong(ghost, logic.frame - playerStart);
    },
    shown(jump: TrainingJump): JumpSimState | null {
      const on = ghost !== null && playerStart !== null && source() === ghost.source && !isJumpOver(jump);
      return on && ghost ? ghost.jump.state : null;
    },
  };
}

interface TrainingRun extends JumpRun {
  /** The last jump that ended, to be watched again; null before the first. */
  lastRecording: () => JumpRecording | null;
  /** The last jump that ended with its result, to be kept; null before the first. */
  lastJump: () => FinishedJump | null;
}

/**
 * The training jumps on a hill, from the player's input: a finished jump is reported once, kept for a replay,
 * and a fresh press of the left button after it starts the next.
 */
function createTrainingRun(
  hill: HillChoice,
  c: () => RunContext,
  sounds: JumpSounds,
  releaseMouse: () => void,
): TrainingRun {
  const input = c().inputRef.current;
  let jump: TrainingJump = startTrainingJump(hill, newSeed());
  let inputs: FrameInput[] = [];
  let recording: JumpRecording | null = null;
  let last: FinishedJump | null = null;
  let finished = false;
  let newRecord = false;
  let leftDown = false;
  let leftWasDown = false;
  const ghosts = createGhostTrack(hill, () => c().live.ghost);

  const restart = () => {
    jump = startTrainingJump(hill, newSeed());
    ghosts.restart();
    inputs = [];
    c().resetHands();
    finished = false;
    newRecord = false;
    sounds.reset();
    c().announce("");
  };
  const finish = () => {
    finished = true;
    releaseMouse();
    const result = jumpResult(jump);
    // The record is the one from before this jump until onFinished stores the jump, so this repeats the verdict
    // given at touchdown.
    newRecord = beatsRecord(result, c().live.record);
    // A jump left while the jumper still slides out is kept as far as it went; the replay plays the rest with
    // no hands, after the result was settled.
    recording = { seed: jump.seed, inputs, newRecord, scenery: c().live.scenery };
    last = { recording, result };
    c().live.onFinished(result, recording);
    c().onReplayAvailable(true);
    const contest = c().live.contestNext !== null;
    c().announce(resultAnnouncement(jump.state.logic, { newRecord, controls: c().live.controls, contest }));
  };
  /** The input of the next simulation frame; the rules of the touch zones belong to finger steering. */
  const takeFrame = (logic: JumpLogicState) => {
    ghosts.see(logic);
    const zones = c().live.controls === "touch";
    input.setLeftTouchLeansOnly(zones && leftTouchLeansOnly(logic.phase));
    input.setRightTouchIsBothButtons(zones && rightTouchEndsPreparation(logic.phase));
    return input.takeFrame();
  };

  return {
    step(steps) {
      const stepped = stepJump(jump, { steps, leftHeld: input.left, record: c().live.record }, takeFrame);
      jump = stepped.jump;
      ghosts.follow(jump);
      leftDown = stepped.leftDown;
      // The recording is owned here and handed out only once the jump is finished.
      if (!finished) inputs.push(...stepped.taken);
      playCues(stepped.cues, c(), true);
      if (stepped.touchdown) {
        newRecord = stepped.touchdown.newRecord;
        c().announce(touchdownAnnouncement(jump.state.logic, newRecord));
      }
    },
    settle() {
      const over = isJumpOver(jump);
      if (!finished && over) finish();
      // Once the notes are up (or a moment after a disqualification), a fresh press of the left button starts
      // the next jump; the jumper may still be sliding out, and the result is final by then, so it is recorded first.
      const clock = presentationFrame(jump);
      if (leftDown && !leftWasDown && nextJumpAllowed(jump.state.logic, clock)) {
        if (!finished) finish();
        const contestNext = c().live.contestNext;
        if (contestNext) contestNext();
        else restart();
      }
      leftWasDown = leftDown;
      return { over, clock };
    },
    restart,
    now: () => ({ jump, newRecord, ghost: ghosts.shown(jump) }),
    lastRecording: () => recording,
    lastJump: () => last,
  };
}

interface ReplayRun extends JumpRun {
  /** Whether the replay has played to where a press starts a new jump. */
  ended: () => boolean;
  /** Where the replay is, in simulation frames, and how long it is until the jumper stops. */
  position: () => ReplayPosition;
  /** Goes to a moment of the replay: the jump is computed there in silence, and plays on from it. */
  seek: (frame: number) => void;
}

/** A moment of a replay, in simulation frames from its start, and the length of the replay. */
export interface ReplayPosition {
  frame: number;
  length: number;
}

/** Frames computed at a time when a replay goes to another moment. */
const SEEK_CHUNK_FRAMES = 200;
/** A replay that does not stop within this is cut here (a jump is 900 to 1600 frames). */
const MAX_REPLAY_FRAMES = 6000;

/**
 * A recorded jump played again: the same simulation from the same seed and inputs, heard but not felt, and
 * not scored again.
 */
function createReplayRun(hill: HillChoice, source: ReplaySource, c: () => RunContext, sounds: JumpSounds): ReplayRun {
  const start = () => source.start(hill);
  let jump = start();
  let newRecord = false;
  /** Whether the end of the replay has been told, with the notes and what a press does now. */
  let toldOver = false;
  const takeFrame = (logic: JumpLogicState) => source.input(logic);
  const ended = () => nextJumpAllowed(jump.state.logic, presentationFrame(jump));
  /** The frame the jumper stops in, found once by playing the replay through. */
  let length: number | null = null;
  const lengthOf = (): number => {
    if (length === null) {
      let probe = start();
      while (!isJumpOver(probe) && probe.state.logic.frame < MAX_REPLAY_FRAMES) {
        probe = stepJump(probe, { steps: SEEK_CHUNK_FRAMES, leftHeld: false, record: undefined }, takeFrame).jump;
      }
      length = probe.state.logic.frame;
    }
    return length;
  };
  const restart = () => {
    jump = start();
    newRecord = false;
    toldOver = false;
    sounds.reset();
    c().announce(UI_TEXT.announcement.replayStarted);
  };
  return {
    step(steps) {
      const stepped = stepJump(jump, { steps, leftHeld: false, record: undefined }, takeFrame);
      jump = stepped.jump;
      playCues(stepped.cues, c(), false);
      if (stepped.touchdown) {
        newRecord = source.newRecord;
        c().announce(touchdownAnnouncement(jump.state.logic, newRecord));
      }
    },
    settle() {
      // Told once the press that ends the replay works: the notes are up then, as in the jump.
      if (!toldOver && ended()) {
        toldOver = true;
        const origin = c().live.contestNext === null ? source.origin : "contest";
        c().announce(replayOverAnnouncement(jump.state.logic, newRecord, origin));
      }
      return { over: isJumpOver(jump), clock: presentationFrame(jump) };
    },
    restart,
    now: () => ({ jump, newRecord, ghost: null }),
    ended,
    position: () => ({ frame: Math.min(presentationFrame(jump), lengthOf()), length: lengthOf() }),
    seek(frame) {
      const target = Math.min(Math.max(1, Math.round(frame)), lengthOf());
      jump = start();
      newRecord = false;
      while (jump.state.logic.frame < target && !isJumpOver(jump)) {
        const steps = Math.min(SEEK_CHUNK_FRAMES, target - jump.state.logic.frame);
        const stepped = stepJump(jump, { steps, leftHeld: false, record: undefined }, takeFrame);
        jump = stepped.jump;
        if (stepped.touchdown) newRecord = source.newRecord;
      }
      // What was passed in silence is not told or played again; the end is told when it comes.
      toldOver = ended();
      sounds.skipTo(presentationFrame(jump), newRecord);
    },
  };
}

/** A jump that ended, with what it scored and what plays it again. */
export interface FinishedJump {
  recording: JumpRecording;
  result: JumpResult;
}

/** What the screen can ask of the loop. */
export interface JumpLoopControls {
  /** Starts the jump again: a new training jump, or the replay from its start. */
  restart: () => void;
  /** Plays the last finished jump again. */
  watchReplay: () => void;
  /** Leaves the replay for a new training jump. */
  endReplay: () => void;
  /** The last training jump that ended, to be kept; null before the first. */
  lastJump: () => FinishedJump | null;
  /** Where the replay being watched is; null while jumping. */
  replayPosition: () => ReplayPosition | null;
  /** Goes to a moment of the replay being watched. */
  seekReplay: (frame: number) => void;
}

export const NO_CONTROLS: JumpLoopControls = {
  restart: () => undefined,
  watchReplay: () => undefined,
  endReplay: () => undefined,
  lastJump: () => null,
  replayPosition: () => null,
  seekReplay: () => undefined,
};

export interface RunSwitch {
  /** The run the frames go to: the replay while one plays, the training otherwise. */
  current: () => JumpRun;
  replaying: () => boolean;
  /** Plays a replay over the training, from its start. */
  play: (source: ReplaySource) => void;
  /** The name of the jumper of the replay being played, when it is not the player. */
  jumperName: () => string | null;
  /** The look of the hill to draw: a replay's own, unless the player chose another in this visit. */
  scenery: () => Scenery;
  controls: JumpLoopControls;
  /** A click or a touch of the picture in a replay: pause or go on, and once it is over, a new jump. */
  press: () => void;
}

/** The training on the hill, and a replay of its last finished jump laid over it while one is watched. */
export function createRunSwitch(
  hill: HillChoice,
  c: () => RunContext,
  sounds: JumpSounds,
  releaseMouse: () => void,
): RunSwitch {
  const training = createTrainingRun(hill, c, sounds, releaseMouse);
  let replay: ReplayRun | null = null;
  const current = (): JumpRun => replay ?? training;
  const endReplay = () => {
    if (!replay) return;
    // In a competition the jump after the replay is the next jumper's.
    const contestNext = c().live.contestNext;
    if (contestNext) {
      contestNext();
      return;
    }
    replay = null;
    jumperName = null;
    replayScenery = null;
    training.restart();
    c().onReplayChange(null);
  };
  let jumperName: string | null = null;
  let replayScenery: Scenery | null = null;
  let replayOrigin: ReplaySource["origin"] = "own";
  const play = (source: ReplaySource) => {
    releaseMouse();
    replay = createReplayRun(hill, source, c, sounds);
    jumperName = source.jumperName ?? null;
    replayScenery = source.scenery ?? null;
    replayOrigin = source.origin;
    replay.restart();
    c().onReplayChange(replayStart(source.origin));
  };
  const watchReplay = () => {
    const recording = training.lastRecording();
    if (recording) play(recordingSource(recording));
  };
  return {
    current,
    replaying: () => replay !== null,
    play,
    jumperName: () => jumperName,
    scenery: () => (replayScenery !== null && !c().live.sceneryChosen ? replayScenery : c().live.scenery),
    controls: {
      restart() {
        // A competition jump is not jumped again; its replay may start again.
        if (!replay && c().live.contestNext) return;
        current().restart();
        // A replay started again plays, even if it was paused.
        if (replay) c().onReplayChange((view) => view && { ...view, paused: false });
      },
      watchReplay,
      endReplay,
      lastJump: training.lastJump,
      replayPosition: () => replay?.position() ?? null,
      seekReplay: (frame) => replay?.seek(frame),
    },
    press() {
      if (!replay) return;
      if (replay.ended()) {
        // After the player's own jump the next one follows; after a file of the original, the choices of the menu.
        if (replayOrigin === "original") c().openMenu();
        else endReplay();
      } else c().onReplayChange((view) => view && { ...view, paused: !view.paused });
    },
  };
}
