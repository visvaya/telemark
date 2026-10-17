import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundEngine } from "../audio/sound-engine";
import { OWN_HILLS } from "../game/hill-choice";
import type { PlayerInput } from "../game/player-input";
import type { Scenery } from "../render/jump-view";
import type { FrameInput } from "../sim/jump-logic";
import { DEFAULT_SETTINGS } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { recordingSource, type ReplaySource, type ReplayView } from "./jump-replay";
import type { JumpResult } from "./jump-round";
import { createRunSwitch, type RunContext } from "./jump-runs";
import type { JumpSounds } from "./jump-sounds";

const felt = vi.hoisted(() => [] as string[]);
vi.mock("../game/haptics", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, vibrate: (event: string) => felt.push(event) };
});

const hill = OWN_HILLS[0];
const MAX_FRAMES = 4000;

/** Hands on a script by simulation frame: the press from the gate, then both buttons for the landing. */
const handsAt = (frame: number): FrameInput => ({
  left: frame === 70 || (frame > 500 && frame < 520),
  right: frame > 500 && frame < 520,
  dy: 0,
});

const noop = () => undefined;

/** The player's input as the runs read it, following the script frame by frame. */
function scriptedInput(): PlayerInput {
  let frame = 0;
  return {
    get left() {
      return false;
    },
    get right() {
      return false;
    },
    setButton: noop,
    setButtons: noop,
    setLeftTouchLeansOnly: noop,
    setRightTouchIsBothButtons: noop,
    release: noop,
    addMotion: noop,
    setLeanKeys: noop,
    takeFrame: () => handsAt(++frame),
    reset: () => {
      frame = 0;
    },
  };
}

const silentSounds: JumpSounds = {
  play: () => undefined,
  hush: () => undefined,
  reset: () => undefined,
  skipTo: () => undefined,
};

function setUp() {
  /** Set by `freeze`: the screen renders no more, so the live view stays as it was (React applies later). */
  let stale = false;
  if (!hill) throw new Error("no hill");
  const finished: JumpResult[] = [];
  const heard: string[] = [];
  const played: string[] = [];
  let replay: ReplayView | null = null;
  let available = false;
  let menuOpened = 0;
  const engine: SoundEngine = {
    prepare: noop,
    unlock: noop,
    setEnabled: noop,
    setHidden: noop,
    update: noop,
    play: (cue) => {
      played.push(cue);
    },
    dispose: noop,
  };
  const context: RunContext = {
    live: {
      onFinished: (result) => finished.push(result),
      record: undefined,
      settings: { ...DEFAULT_SETTINGS, vibration: true },
      controls: "mouse",
      scenery: { lighting: "day", snowfall: false, fog: false },
      sceneryChosen: false,
      replay: null,
      ghost: null,
      contestNext: null,
      jumperName: null,
      contestCpu: false,
    },
    inputRef: { current: scriptedInput() },
    resetHands: () => context.inputRef.current.reset(),
    soundRef: { current: engine },
    announce: (text) => heard.push(text),
    onReplayAvailable: (value) => {
      available = value;
    },
    openMenu: () => {
      menuOpened++;
    },
    onReplayChange: (next) => {
      // As React applies a function: from the view as it is now.
      replay = typeof next === "function" ? next(replay) : next;
      if (!stale) context.live = { ...context.live, replay };
    },
  };
  const runs = createRunSwitch(
    hill,
    () => context,
    silentSounds,
    () => undefined,
  );
  const playOut = () => {
    for (let f = 0; f < MAX_FRAMES; f++) {
      const run = runs.current();
      run.step(2);
      if (run.settle().over) return run.now().jump;
    }
    throw new Error("the jump never ended");
  };
  return {
    runs,
    finished,
    heard,
    played,
    playOut,
    available: () => available,
    replay: () => replay,
    menuOpened: () => menuOpened,
    freeze: () => {
      stale = true;
    },
    /** The look of the visit, and whether the player chose it in this visit. */
    setScenery: (scenery: Scenery, sceneryChosen: boolean) => {
      context.live = { ...context.live, scenery, sceneryChosen };
    },
    /** A competition jump: what moves on to the next jumper. */
    setContestNext: (contestNext: () => void) => {
      context.live = { ...context.live, contestNext };
    },
    /** The ghost the screen hands the loop: the replay of the hill's record, or none. */
    setGhost: (ghost: ReplaySource | null) => {
      context.live = { ...context.live, ghost };
    },
  };
}

describe("a competition jump", () => {
  it("is not jumped again, and its replay ends in the next jumper's turn", () => {
    const t = setUp();
    let next = 0;
    t.setContestNext(() => next++);
    const jumped = t.playOut();
    t.runs.controls.restart();
    expect(t.runs.current().now().jump).toBe(jumped);
    t.runs.controls.watchReplay();
    expect(t.replay()).not.toBeNull();
    t.runs.controls.endReplay();
    expect(next).toBe(1);
    expect(t.finished).toHaveLength(1);
  });
});

describe("training and its replay", () => {
  beforeEach(() => {
    felt.length = 0;
  });

  it("plays the last jump again to the same end, heard but not felt and not scored again", () => {
    const t = setUp();
    expect(t.available()).toBe(false);
    const live = t.playOut();
    expect(t.finished).toHaveLength(1);
    expect(t.available()).toBe(true);
    const feltLive = [...felt];
    expect(feltLive).toContain("start");
    const playedLive = [...t.played];

    felt.length = 0;
    t.played.length = 0;
    t.runs.controls.watchReplay();
    expect(t.replay()).toEqual({ speed: 1, paused: false, origin: "own" });
    expect(t.heard.at(-1)).toBe(UI_TEXT.announcement.replayStarted);
    const again = t.playOut();
    expect(again.state).toEqual(live.state);
    expect(felt).toEqual([]);
    expect(t.played).toEqual(playedLive);
    expect(t.finished).toHaveLength(1);
  });

  it("shows a replay with the look its jump had, until the player chooses another in the visit", () => {
    const t = setUp();
    const night: Scenery = { lighting: "night", snowfall: true, fog: false };
    t.setScenery(night, false);
    t.playOut();
    const recording = t.runs.controls.lastJump()?.recording;
    expect(recording?.scenery).toEqual(night);
    // Another visit with another look: the replay keeps the night of its jump.
    const day: Scenery = { lighting: "day", snowfall: false, fog: true };
    t.setScenery(day, false);
    if (recording) t.runs.play(recordingSource(recording));
    expect(t.runs.scenery()).toEqual(night);
    t.setScenery(day, true);
    expect(t.runs.scenery()).toEqual(day);
    t.runs.controls.endReplay();
    t.setScenery(day, false);
    expect(t.runs.scenery()).toEqual(day);
  });

  it("runs the record beside the next jump as a ghost, level with the player from the gate", () => {
    const t = setUp();
    const record = t.playOut();
    const recording = t.runs.controls.lastJump()?.recording;
    if (!recording) throw new Error("no recording");
    t.setGhost(recordingSource(recording));
    t.runs.controls.restart();
    const now = () => t.runs.current().now();
    // At the gate the ghost waits unseen; the player's press (frame 70 of the script) sets both off.
    t.runs.current().step(60);
    expect(now().ghost).toBeNull();
    t.runs.current().step(140);
    // The record left the gate in the same frame of its jump as the player, so they share the frame.
    expect(now().ghost?.logic.frame).toBe(now().jump.state.logic.frame);
    // It is the record's jump: the same hands from another seed land it where the record landed.
    for (let f = 0; f < MAX_FRAMES && now().ghost?.logic.finished !== true; f++) t.runs.current().step(2);
    expect(now().ghost?.logic.distanceM).toBe(record.state.logic.distanceM);
    // Switched off, or with the record gone, there is no ghost.
    t.setGhost(null);
    expect(now().ghost).toBeNull();
  });

  it("pauses on a press, and once over leaves for a new training jump", () => {
    const t = setUp();
    t.playOut();
    t.runs.controls.watchReplay();
    t.runs.press();
    expect(t.replay()).toEqual({ speed: 1, paused: true, origin: "own" });
    t.runs.press();
    expect(t.replay()).toEqual({ speed: 1, paused: false, origin: "own" });
    t.playOut();
    // Let the notes come up: the replay is over when a press may start a new jump.
    for (let f = 0; f < 1000 && t.replay() !== null; f++) {
      t.runs.current().step(1);
      t.runs.current().settle();
      t.runs.press();
      if (t.replay()?.paused === true) t.runs.press();
    }
    expect(t.replay()).toBeNull();
    expect(t.runs.replaying()).toBe(false);
    expect(t.runs.current().now().jump.state.logic.frame).toBe(1);
  });

  it("plays again from its start when asked while paused", () => {
    const t = setUp();
    t.playOut();
    t.runs.controls.watchReplay();
    t.runs.current().step(200);
    t.runs.press();
    expect(t.replay()).toEqual({ speed: 1, paused: true, origin: "own" });
    t.runs.controls.restart();
    expect(t.replay()).toEqual({ speed: 1, paused: false, origin: "own" });
    expect(t.runs.current().now().jump.state.logic.frame).toBe(1);
  });

  it("after a replay of the original, a press opens the menu instead of starting a jump", () => {
    const t = setUp();
    // No hands at all: the countdown runs out and the jump is disqualified, which ends it soon.
    const idle = recordingSource({ seed: 1, inputs: [], newRecord: false });
    t.runs.play({ ...idle, origin: "original" });
    expect(t.replay()).toEqual({ speed: 1, paused: false, origin: "original" });
    t.playOut();
    for (let f = 0; f < 1000 && t.menuOpened() === 0; f++) {
      t.runs.current().step(1);
      t.runs.current().settle();
      t.runs.press();
      if (t.replay()?.paused === true) t.runs.press();
    }
    expect(t.menuOpened()).toBe(1);
    expect(t.runs.replaying()).toBe(true);
  });

  it("counts two presses within one frame, before the screen has shown the first", () => {
    const t = setUp();
    t.playOut();
    t.runs.controls.watchReplay();
    t.freeze();
    t.runs.press();
    t.runs.press();
    expect(t.replay()).toEqual({ speed: 1, paused: false, origin: "own" });
  });

  it("tells once that the replay is over, with the notes and what a press does now", () => {
    const t = setUp();
    t.playOut();
    t.runs.controls.watchReplay();
    t.playOut();
    for (let f = 0; f < 1000; f++) {
      t.runs.current().step(1);
      t.runs.current().settle();
    }
    const over = t.heard.filter((text) => text.includes(UI_TEXT.announcement.replayOver.own));
    expect(over).toHaveLength(1);
    expect(over[0]).toMatch(/^(Lądowanie|Upadek|Dyskwalifikacja)/);
  });

  it("goes to a moment of a replay and plays on from it to the same end", () => {
    const t = setUp();
    const live = t.playOut();
    expect(t.runs.controls.replayPosition()).toBeNull();
    t.runs.controls.watchReplay();
    const position = t.runs.controls.replayPosition();
    expect(position?.frame).toBe(1);
    expect(position?.length).toBe(live.state.logic.frame);
    const middle = Math.round((position?.length ?? 0) / 2);
    t.runs.controls.seekReplay(middle);
    expect(t.runs.controls.replayPosition()?.frame).toBe(middle);
    expect(t.runs.current().now().jump.state.logic.frame).toBe(middle);
    expect(t.runs.current().settle().over).toBe(false);
    expect(t.playOut().state).toEqual(live.state);
    // Beyond its end it stops at the end; what was passed in silence is not told at once.
    const heard = t.heard.length;
    t.runs.controls.seekReplay(1e6);
    expect(t.runs.controls.replayPosition()?.frame).toBe(live.state.logic.frame);
    t.runs.current().settle();
    expect(t.heard.slice(heard).filter((text) => text.includes(UI_TEXT.announcement.replayOver.own))).toHaveLength(0);
  });

  it("has nothing to play before the first jump has ended", () => {
    const t = setUp();
    t.runs.controls.watchReplay();
    expect(t.runs.replaying()).toBe(false);
    expect(t.replay()).toBeNull();
  });
});
