import { useEffect, useRef, useState, type RefObject } from "react";
import { planSteps } from "../game/fixed-step";
import type { HillChoice } from "../game/hill-choice";
import { MARK_FIRST_JUMP_FRAME, markOnce } from "../game/performance-marks";
import { mouseGain, sensitivityGain } from "../game/sensitivity";
import { tiltStep } from "../game/tilt-input";
import type { TrainingJump } from "../game/training-session";
import type { JumpSimState } from "../sim/jump-sim";
import { VIEW_HEIGHT_PX, drawJumpView, viewWidthFor, type Scenery } from "../render/jump-view";
import { UI_TEXT } from "../text/ui-text";
import { createJumpDiagnostics } from "./jump-diagnostics";
import { listenToPlayerInput, watchPointerLock, type PointerLockWatch } from "./jump-input-listeners";
import { makePicture, pictureSize, titlePlaceFor, type TitlePlace, type JumpPicture } from "./jump-picture";
import { REPLAY_SPEED_LABEL, type ReplaySource, type ReplayView } from "./jump-replay";
import {
  NO_CONTROLS,
  createRunSwitch,
  type JumpLoopControls,
  type LiveProps,
  type RunContext,
  type RunSwitch,
} from "./jump-runs";
import { createJumpSounds } from "./jump-sounds";
import type { TiltReading } from "./use-steering";

interface JumpLoopOptions extends RunContext {
  hill: HillChoice;
  tiltRef: RefObject<TiltReading>;
  pausedRef: RefObject<boolean>;
  pauseButtonRef: RefObject<HTMLElement | null>;
  toggleMenu: () => void;
  /** Keeps the last jump, as the menu's button does (the S key). */
  keepLast: () => void;
  /** A replay to play as the screen opens (one of the original's); training follows it. */
  initialReplay: ReplaySource | null;
}

interface FrameView {
  jump: TrainingJump;
  newRecord: boolean;
  ghost: JumpSimState | null;
  over: boolean;
  clock: number;
  title: TitlePlace;
  replay: ReplayView | null;
  playerName: string;
  scenery: Scenery;
}

/** Who jumps in the picture and how the hill looks: a replay's own jumper and look, or the player's. */
const lookOf = (runs: Pick<RunSwitch, "jumperName" | "scenery">, live: LiveProps) => ({
  playerName: runs.jumperName() ?? live.jumperName ?? UI_TEXT.hud.playerName,
  scenery: runs.scenery(),
});

/** Draws a frame of the jump into the picture, as the player has the screen set up. */
function drawFrame(picture: JumpPicture, hill: HillChoice, live: LiveProps, v: FrameView): void {
  const best = live.record;
  drawJumpView(picture.fb, {
    profile: hill.profile,
    kPointM: hill.kPointM,
    look: hill.look,
    hillName: hill.name,
    playerName: v.playerName,
    state: v.jump.state,
    controls: live.controls,
    titleInsetPx: v.title.insetPx,
    ...(v.title.topPx === null ? {} : { titleTopPx: v.title.topPx }),
    hints: live.settings.hillHints,
    frame: v.clock,
    over: v.over,
    newRecord: v.newRecord,
    scenery: v.scenery,
    outfit: live.settings.outfit,
    windDriftM: v.jump.windDriftM,
    ...(best === undefined ? {} : { recordM: best.distanceM }),
    ...(v.ghost === null ? {} : { ghost: v.ghost }),
    // A computer jumper's competition jump plays as a replay, but the picture shows it as a jump.
    ...(v.replay === null || live.contestCpu
      ? {}
      : {
          replay: {
            speedLabel: REPLAY_SPEED_LABEL[v.replay.speed],
            paused: v.replay.paused,
            menuAtEnd: v.replay.origin === "original",
          },
        }),
  });
}

/** What the mouse and the keys do on the jump screen, acting on the runs and the options of the time. */
function inputHandlers(o: () => JumpLoopOptions, runs: RunSwitch, lock: PointerLockWatch) {
  return {
    paused: () => o().pausedRef.current,
    mouseGain: () => mouseGain(o().live.settings.sensitivity.mouse),
    restart: runs.controls.restart,
    replaying: runs.replaying,
    replayPress: runs.press,
    escape: () => {
      lock.release();
      o().toggleMenu();
    },
    hasLastJump: () => runs.controls.lastJump() !== null,
    watchLast: runs.controls.watchReplay,
    keepLast: () => o().keepLast(),
  };
}

/**
 * Runs the training jumps on the hill: steps the simulation at its fixed rate from the player's input, draws
 * each frame, plays the sounds and reports each finished jump. Returns the refs of the elements it draws into,
 * and what starts the jump again.
 */
export function useJumpLoop(options: JumpLoopOptions) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const diagnosticsRef = useRef<HTMLPreElement>(null);
  const controlsRef = useRef<JumpLoopControls>(NO_CONTROLS);
  /** For the screen: always the same object, acting on the loop that runs at the time. */
  const [controls] = useState<JumpLoopControls>(() => ({
    restart: () => controlsRef.current.restart(),
    watchReplay: () => controlsRef.current.watchReplay(),
    endReplay: () => controlsRef.current.endReplay(),
    lastJump: () => controlsRef.current.lastJump(),
    replayPosition: () => controlsRef.current.replayPosition(),
    seekReplay: (frame) => controlsRef.current.seekReplay(frame),
  }));
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const { hill } = options;

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return undefined;
    const o = () => latest.current;
    const input = o().inputRef.current;
    input.reset();
    // The measurements exist only when asked for; without them the loop reads no clock of its own.
    const overlay = diagnosticsRef.current;
    const meter = overlay
      ? createJumpDiagnostics((text, stats) => {
          overlay.textContent = text;
          // The same numbers for whoever reads them from the page, under the names the statistics have.
          overlay.dataset["stats"] = JSON.stringify(stats);
        })
      : null;
    const sounds = createJumpSounds(() => o().soundRef.current);
    const lock = watchPointerLock(canvas, input, () => o().openMenu());
    const runs = createRunSwitch(hill, o, sounds, lock.release);
    controlsRef.current = runs.controls;
    // Another hill: nothing to watch again yet.
    o().onReplayAvailable(false);
    if (o().live.replay !== null) o().onReplayChange(null);
    const opening = o().initialReplay;
    if (opening) runs.play(opening);

    let picture = makePicture(viewWidthFor(stage.clientWidth, stage.clientHeight));
    /** Where the name of the hill starts, when the pause button lies over that corner. */
    let title: TitlePlace = { insetPx: 0, topPx: null };
    const fit = () => {
      const size = pictureSize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
      if (size.widthPx !== picture.fb.width) picture = makePicture(size.widthPx);
      canvas.width = size.widthPx;
      canvas.height = VIEW_HEIGHT_PX;
      canvas.style.width = `${size.cssWidthPx}px`;
      canvas.style.height = `${size.cssHeightPx}px`;
      title = titlePlaceFor(canvas, o().pauseButtonRef.current, size.widthPx);
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(stage);

    // A hidden tab stops animation frames, so the continuous sounds are hushed right away.
    const onVisibility = () => {
      meter?.discardNext();
      if (document.hidden) sounds.hush();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let firstFrameMarked = false;
    const frame = (now: number) => {
      const { live, pausedRef, tiltRef } = o();
      const view = runs.replaying() ? live.replay : null;
      const paused = pausedRef.current || view?.paused === true;
      const plan = planSteps(acc, paused ? 0 : ((now - last) / 1000) * (view?.speed ?? 1));
      last = now;
      acc = plan.accumulatorS;
      const tilt = tiltRef.current;
      if (tilt.on && tilt.pitch !== null) {
        // The phone is followed while the game is paused too, so what it did meanwhile does not arrive at once.
        const turned = tiltStep(tilt.follow, tilt.pitch, sensitivityGain(live.settings.sensitivity.tilt));
        tilt.follow = turned.state;
        // A replay takes no hands, so nothing piles up for the jump after it.
        if (plan.steps > 0 && !runs.replaying()) input.addMotion(turned.motion);
      }
      meter?.stepsBegin();
      const current = runs.current();
      current.step(plan.steps);
      meter?.stepsEnd();
      const { over, clock } = current.settle();
      const { jump, newRecord, ghost } = current.now();
      sounds.play(jump.state, clock, newRecord, paused || document.hidden);
      meter?.drawBegin();
      const v = { jump, newRecord, ghost, over, clock, title, replay: view, ...lookOf(runs, live) };
      drawFrame(picture, hill, live, v);
      ctx.putImageData(picture.image, 0, 0);
      meter?.frameEnd(now, plan, paused);
      if (!firstFrameMarked) {
        firstFrameMarked = true;
        markOnce(MARK_FIRST_JUMP_FRAME);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const stopInput = listenToPlayerInput(canvas, input, inputHandlers(o, runs, lock));
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
      resize.disconnect();
      controlsRef.current = NO_CONTROLS;
      stopInput();
      lock.dispose();
    };
  }, [hill]);

  return { stageRef, canvasRef, diagnosticsRef, controls };
}
