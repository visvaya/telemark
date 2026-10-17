import type { ReactNode, RefObject } from "react";
import type { HillChoice } from "../game/hill-choice";
import { versionLabel } from "../game/version";
import type { OfflineState } from "../pwa/offline-state";
import type { ControlScheme } from "../render/jump-view";
import type { HillRecord, Settings } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { HillLists } from "./hill-screen";
import { HowToJump } from "./how-to-jump";
import { UpdateNotice } from "./offline-notice";
import { REPLAY_SPEED_LABEL, type ReplayView } from "./jump-replay";
import { RecordGhostToggle, ReplaySliderToggle } from "./replay-settings";
import { SettingsControls } from "./settings-controls";
import type { MenuPanel } from "./use-pause-menu";

const JUMP_TEXT = UI_TEXT.jumpScreen;

interface Props {
  panel: MenuPanel;
  onPanel: (panel: MenuPanel) => void;
  /** Takes the focus when the instructions or the list of hills replace the buttons. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  menuOpen: boolean;
  resumeRef: RefObject<HTMLButtonElement | null>;
  touch: boolean;
  controls: ControlScheme;
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPickHill: (hill: HillChoice) => void;
  onResume: () => void;
  onAgain: () => void;
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  tiltOn: boolean;
  onToggleTilt: () => void;
  /** A note about the motion sensor, or nothing. */
  tiltNote: string;
  /** Whether the menu asks first whether to lean by tilting the phone (the browser gives the sensor after a tap). */
  tiltQuestion: boolean;
  onTiltAnswer: (yes: boolean) => void;
  /** The question's yes, which takes the focus when the question opens the menu. */
  tiltYesRef: RefObject<HTMLButtonElement | null>;
  onExit: () => void;
  /** A competition jump: no new jump and no other hill from the menu. */
  contest: boolean;
  /** The question before a competition is left, in place of the exit button while it is asked. */
  abandonQuestion: ReactNode;
  /** How the replay is being watched; null while jumping. */
  replay: ReplayView | null;
  /** Whether a finished jump can be watched again. */
  replayAvailable: boolean;
  onWatchReplay: () => void;
  /** Moves the replay to its next tempo. */
  onReplaySpeed: () => void;
  onReplayFromStart: () => void;
  onReplayEnd: () => void;
  /** Leaves a replay of the original for the replay screen, to choose another file. */
  onOtherReplay: () => void;
  /** Keeps the last jump that ended on the shelf of replays. */
  onKeepLast: () => void;
  /** What became of the last request to keep a jump, or nothing. */
  keepNote: string;
  /** Whether a newer release waits. */
  offline: OfflineState | null;
}

const REPLAY_TEXT = JUMP_TEXT.replay;

/**
 * In a replay the menu holds what the replay needs: its tempo, its start and whether its slider shows, then the
 * way on. After the player's own jump that is keeping the jump or back to jumping; a replay opened on the replay
 * screen (a file of the original or a kept jump) leads back there, or to training on its hill.
 */
function ReplayButtons(p: ReplayButtonsProps) {
  const { replay, touch, onReplaySpeed, onReplayFromStart, onReplayEnd, onOtherReplay } = p;
  return (
    <>
      <button type="button" className="pixel-button" onClick={onReplaySpeed}>
        {REPLAY_TEXT.speed(REPLAY_SPEED_LABEL[replay.speed])}
      </button>
      <button type="button" className="pixel-button" onClick={onReplayFromStart}>
        {REPLAY_TEXT.fromStart}
        {touch ? "" : JUMP_TEXT.againKey}
      </button>
      <ReplaySliderToggle replays={p.settings.replays} onSettings={p.onSettings} />
      {replay.origin === "own" ? (
        <>
          <button type="button" className="pixel-button" onClick={p.onKeepLast}>
            {REPLAY_TEXT.keepLast}
            {touch ? "" : JUMP_TEXT.keepKey}
          </button>
          <button type="button" className="pixel-button" onClick={onReplayEnd}>
            {REPLAY_TEXT.end}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="pixel-button" onClick={onOtherReplay}>
            {REPLAY_TEXT.other}
          </button>
          <button type="button" className="pixel-button" onClick={onReplayEnd}>
            {REPLAY_TEXT.jumpHere}
          </button>
        </>
      )}
    </>
  );
}

type ReplayButtonsProps = Pick<
  Props,
  | "touch"
  | "onReplaySpeed"
  | "onReplayFromStart"
  | "onReplayEnd"
  | "onOtherReplay"
  | "onKeepLast"
  | "settings"
  | "onSettings"
> & { replay: ReplayView };

/** While jumping: a new jump, the last one again, the instructions and another hill. */
function TrainingButtons(
  p: Pick<Props, "touch" | "onAgain" | "replayAvailable" | "onWatchReplay" | "onKeepLast" | "onPanel" | "contest">,
) {
  return (
    <>
      {!p.contest && (
        <button type="button" className="pixel-button" onClick={p.onAgain}>
          {JUMP_TEXT.again}
          {p.touch ? "" : JUMP_TEXT.againKey}
        </button>
      )}
      {/* Unavailable rather than disabled, so the keyboard and a screen reader still find it. */}
      <button
        type="button"
        className="pixel-button"
        aria-disabled={!p.replayAvailable}
        onClick={p.replayAvailable ? p.onWatchReplay : undefined}
      >
        {REPLAY_TEXT.watch}
        {p.touch ? "" : JUMP_TEXT.watchKey}
      </button>
      <button
        type="button"
        className="pixel-button"
        aria-disabled={!p.replayAvailable}
        onClick={p.replayAvailable ? p.onKeepLast : undefined}
      >
        {REPLAY_TEXT.keepLast}
        {p.touch ? "" : JUMP_TEXT.keepKey}
      </button>
      {!p.replayAvailable && <p className="note">{REPLAY_TEXT.notYet}</p>}
      <button type="button" className="pixel-button" onClick={() => p.onPanel("help")}>
        {UI_TEXT.menu.howTo}
      </button>
      {!p.contest && (
        <button type="button" className="pixel-button" onClick={() => p.onPanel("hills")}>
          {JUMP_TEXT.changeHill}
        </button>
      )}
    </>
  );
}

/**
 * Whether to lean by tilting the phone, asked above the menu's buttons where the browser gives the sensor only
 * after a tap. An answer closes the menu and the jump goes on; the focus starts on the yes, tilting being the
 * default.
 */
function TiltQuestion({
  onAnswer,
  onResume,
  focusRef,
}: {
  onAnswer: (yes: boolean) => void;
  onResume: () => void;
  focusRef: RefObject<HTMLButtonElement | null>;
}) {
  const answer = (yes: boolean) => {
    onAnswer(yes);
    onResume();
  };
  return (
    <div className="tilt-question" role="group" aria-labelledby="tilt-question-text">
      <p className="note" id="tilt-question-text">
        {JUMP_TEXT.tiltQuestion}
      </p>
      <button type="button" className="pixel-button" ref={focusRef} onClick={() => answer(true)}>
        {JUMP_TEXT.tiltYes}
      </button>
      <button type="button" className="pixel-button" onClick={() => answer(false)}>
        {JUMP_TEXT.tiltNo}
      </button>
    </div>
  );
}

/** The buttons of the jump screen; in the open menu, the instructions or the list of hills can take their place. */
export function JumpMenu({ headingRef, resumeRef, ...p }: Props) {
  if (p.panel !== "menu") {
    return (
      <>
        <h2 className="how-to-title" tabIndex={-1} ref={headingRef}>
          {p.panel === "help" ? UI_TEXT.howTo.title : UI_TEXT.hills.title}
        </h2>
        {p.panel === "help" ? (
          <HowToJump steering={p.controls} />
        ) : (
          <div className="menu-hills">
            <HillLists hills={p.hills} records={p.records} onPick={p.onPickHill} />
          </div>
        )}
        <button type="button" className="pixel-button" onClick={() => p.onPanel("menu")}>
          {UI_TEXT.back}
        </button>
      </>
    );
  }
  const asking = p.menuOpen && p.tiltQuestion && p.replay === null;
  return (
    <>
      {asking && <TiltQuestion onAnswer={p.onTiltAnswer} onResume={p.onResume} focusRef={p.tiltYesRef} />}
      {p.menuOpen && (
        <button type="button" className="pixel-button resume-button" ref={resumeRef} onClick={p.onResume}>
          {p.replay ? REPLAY_TEXT.resume : JUMP_TEXT.resume}
          {p.touch ? "" : JUMP_TEXT.resumeKey}
        </button>
      )}
      {p.replay ? <ReplayButtons {...p} replay={p.replay} /> : <TrainingButtons {...p} />}
      {/* A replay takes no hands, so the settings of the steering are left out of its menu. */}
      <SettingsControls
        settings={p.settings}
        onSettings={p.onSettings}
        controls={p.controls}
        touch={p.touch}
        steering={p.replay === null}
        tiltOn={p.tiltOn}
        onToggleTilt={p.onToggleTilt}
      />
      {/* The ghost runs beside training jumps only, so a replay's menu leaves it out. */}
      {p.replay === null && !p.contest && (
        <RecordGhostToggle recordGhost={p.settings.recordGhost} onSettings={p.onSettings} />
      )}
      {p.abandonQuestion ?? (
        <button type="button" className="pixel-button" onClick={p.onExit}>
          {JUMP_TEXT.exit}
        </button>
      )}
      {p.keepNote !== "" && (
        <p className="note" role="status">
          {p.keepNote}
        </p>
      )}
      {p.tiltNote !== "" && (
        <p className="note error" role="status">
          {p.tiltNote}
        </p>
      )}
      {/* One block in the column of buttons: the empty region of the note adds no gap. */}
      <div className="version-block">
        <UpdateNotice state={p.offline} />
        <p className="note version-note">{versionLabel()}</p>
      </div>
    </>
  );
}
