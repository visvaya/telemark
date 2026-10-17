import { useEffect, useLayoutEffect, useState, type ReactElement } from "react";
import { OWN_HILLS, originalHillChoices, type HillChoice } from "../game/hill-choice";
import { MARK_FIRST_SCREEN, markOnce } from "../game/performance-marks";
import { tiltSupported } from "../game/tilt-input";
import {
  beatsRecord,
  emptySave,
  mergedSave,
  withJump,
  withSettings,
  type SaveData,
  type Settings,
} from "../storage/save-data";
import { detectGameFilesStore, type GameFiles, type GameFilesStore } from "../storage/game-files-store";
import { detectBackend, loadSave, saveSave, type StorageBackend } from "../storage/save-store";
import { readOriginalHills } from "../original/original-hills";
import { UI_TEXT } from "../text/ui-text";
import { typeset } from "./typeset";
import { HillScreen } from "./hill-screen";
import { HowToScreen } from "./how-to-jump";
import { AboutScreen } from "./about-screen";
import { InstallScreen } from "./install-screen";
import type { JumpResult } from "./jump-round";
import { JumpScreen } from "./jump-screen";
import type { JumpRecording, ReplaySource } from "./jump-replay";
import type { FinishedJump } from "./jump-runs";
import type { OfflineState } from "../pwa/offline-state";
import type { KeepOutcome } from "./use-replay-shelf";
import { MenuScreen } from "./menu-screen";
import { OutfitScreen } from "./outfit-screen";
import { ReplaysScreen } from "./replays-screen";
import { screenTitle } from "./screen-title";
import { SettingsScreen } from "./settings-screen";
import { useOfflineState } from "./use-offline-state";
import { saveSync } from "./save-sync";
import { useRecordGhost, useReplayShelf } from "./use-replay-shelf";
import { useCompetition } from "./use-competition";
import { CompetitionSetupScreen } from "./competition-setup-screen";
import { CompetitionScreen } from "./competition-screen";

type Screen =
  | { kind: "menu" }
  | { kind: "hills" }
  | { kind: "outfit" }
  | { kind: "howto" }
  | { kind: "install" }
  | { kind: "about" }
  | { kind: "settings" }
  | { kind: "replays" }
  /** A jump screen; with a replay of the original, it plays that first. */
  | { kind: "jump"; hill: HillChoice; replay?: ReplaySource }
  | { kind: "contest-setup" }
  /** The board of the competition between its jumps. */
  | { kind: "contest"; hill: HillChoice }
  /** A jump of the competition. */
  | { kind: "contest-jump"; hill: HillChoice };

interface SideProps {
  kind: "howto" | "install" | "about" | "settings";
  settings: Settings;
  onSettings: (change: Partial<Settings>) => void;
  onBack: () => void;
  focusOnEntry: boolean;
}

/**
 * The screens beside the game itself: the two with instructions, the one about the game and the settings; each
 * leads back to the menu.
 */
function SideScreen({ kind, settings, onSettings, onBack, focusOnEntry }: SideProps) {
  if (kind === "settings") {
    return <SettingsScreen settings={settings} onSettings={onSettings} onBack={onBack} focusOnEntry={focusOnEntry} />;
  }
  if (kind === "install") return <InstallScreen onBack={onBack} focusOnEntry={focusOnEntry} />;
  if (kind === "about") return <AboutScreen onBack={onBack} focusOnEntry={focusOnEntry} />;
  // The instructions speak of the steering in use: on a touch screen, a finger or the tilt of the phone.
  return (
    <HowToScreen
      tilt={settings.leanControl === "tilt" && tiltSupported()}
      onBack={onBack}
      focusOnEntry={focusOnEntry}
    />
  );
}

/** The screen shown, and how to show another one. */
function useScreens(): { screen: Screen; navigated: boolean; show: (next: Screen) => void } {
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  // The first screen leaves the focus where the browser put it; every later one takes it (see useEntryFocus).
  const [navigated, setNavigated] = useState(false);
  const show = (next: Screen) => {
    setNavigated(true);
    setScreen(next);
  };
  // What follows the screen: the title of the page, and the scroll position. A new screen starts at its top; the
  // page would otherwise keep the scroll position of the screen before it, so a screen opened from the end of a
  // long one would show its middle. Before the paint, so the old position never shows.
  useLayoutEffect(() => {
    document.title = screenTitle(screen.kind === "contest-jump" ? { kind: "jump", hill: screen.hill } : screen);
    window.scrollTo(0, 0);
  }, [screen]);
  return { screen, navigated, show };
}

/** Marks when the first screen reaches the display, for whoever measures the start of the game. */
function useFirstScreenMark(): void {
  useEffect(() => {
    const raf = requestAnimationFrame(() => markOnce(MARK_FIRST_SCREEN));
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** The player's game files and the hills read from them, kept for the next visit where the browser allows it. */
function useGameFiles() {
  const [originalHills, setOriginalHills] = useState<HillChoice[]>([]);
  const [gameFiles, setGameFiles] = useState<GameFiles>({});
  const [filesStore] = useState<GameFilesStore>(detectGameFilesStore);
  const [filesStoreName, setFilesStoreName] = useState(filesStore.name);

  // Game files kept from an earlier visit bring their hills back without asking again.
  useEffect(() => {
    let cancelled = false;
    void filesStore.load().then((files) => {
      setFilesStoreName(filesStore.name);
      if (cancelled || !files.exe) return;
      try {
        setOriginalHills(originalHillChoices(readOriginalHills(files.exe, files.dat)));
        setGameFiles(files);
      } catch {
        void filesStore.clear();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filesStore]);

  const onGameFiles = (files: GameFiles) => {
    setGameFiles(files);
    void filesStore.save(files).then(() => setFilesStoreName(filesStore.name));
  };
  const onForgetFiles = () => {
    setGameFiles({});
    setOriginalHills([]);
    void filesStore.clear();
  };
  return { originalHills, setOriginalHills, gameFiles, filesStoreName, onGameFiles, onForgetFiles };
}

/**
 * The save: read once, then changed through `update`, which stores every change. A write is merged with what
 * another window stored meanwhile (see mergedSave), and what it stored comes back into this window; what other
 * windows store comes in too (see saveSync).
 */
function useStoredSave() {
  const [save, setSave] = useState<SaveData>(emptySave);
  const [backend] = useState<StorageBackend>(detectBackend);
  const [saveFailed, setSaveFailed] = useState(false);
  const [sync] = useState(() => saveSync(backend, setSave));

  useEffect(() => {
    let cancelled = false;
    void loadSave(backend).then((loaded) => {
      if (!cancelled) setSave(loaded);
    });
    const disconnect = sync.connect();
    return () => {
      cancelled = true;
      disconnect();
    };
  }, [backend, sync]);

  const update = (next: (current: SaveData) => SaveData) =>
    setSave((prev) => {
      const changed = next(prev);
      if (changed !== prev) {
        const done = sync.saving();
        saveSave(backend, changed).then(
          (stored) => {
            done(true);
            setSave((current) => mergedSave(stored, current));
          },
          () => {
            done(false);
            setSaveFailed(true);
          },
        );
      }
      return changed;
    });
  return { save, persistent: backend.name !== "memory" && !saveFailed, update };
}

interface ContestContext {
  contest: ReturnType<typeof useCompetition>;
  save: SaveData;
  onSettings: (change: Partial<Settings>) => void;
  onFinished: (hill: HillChoice, result: JumpResult, recording: JumpRecording) => void;
  keepJump: (hill: HillChoice, jump: FinishedJump) => KeepOutcome;
  hills: readonly HillChoice[];
  navigated: boolean;
  diagnostics: boolean;
  offline: OfflineState | null;
  show: (next: Screen) => void;
}

/** The screens of a competition: its setup, the board between its jumps, and its jumps; null for other screens. */
function contestScreen(screen: Screen, c: ContestContext): ReactElement | null {
  if (screen.kind === "contest-jump" && c.contest.jump) {
    const hill = screen.hill;
    return (
      <JumpScreen
        key={c.contest.jump.key}
        hill={hill}
        record={c.save.records[hill.id]}
        settings={c.save.settings}
        onSettings={c.onSettings}
        onFinished={(result, recording) => {
          // A player's competition jump counts for the hill record as a training jump does; a computer's never.
          if (c.contest.jump?.contest.cpu !== null) return;
          c.contest.onPlayerResult(result);
          c.onFinished(hill, result, recording);
        }}
        onKeepJump={(jump) => c.keepJump(hill, jump)}
        hills={c.hills}
        records={c.save.records}
        onPickHill={() => undefined}
        onExit={c.contest.abandon}
        onOpenReplays={() => undefined}
        focusOnEntry={c.navigated}
        diagnostics={c.diagnostics}
        openingReplay={null}
        recordGhost={null}
        offline={c.offline}
        contest={c.contest.jump.contest}
      />
    );
  }
  if (screen.kind === "contest" && c.contest.run) {
    return (
      <CompetitionScreen
        key={`${c.contest.run.state.round}-${c.contest.run.state.position}-${c.contest.run.log.length}`}
        run={c.contest.run}
        onNext={c.contest.next}
        onAgain={c.contest.again}
        onMenu={c.contest.abandon}
        focusOnEntry={c.navigated}
      />
    );
  }
  if (screen.kind === "contest-setup") {
    return (
      <CompetitionSetupScreen
        hills={c.hills}
        settings={c.save.settings.competition}
        onChange={(competition) => c.onSettings({ competition })}
        onStart={(hill) => c.contest.start(hill, c.save.settings.competition)}
        onBack={() => c.show({ kind: "menu" })}
        focusOnEntry={c.navigated}
      />
    );
  }

  return null;
}

interface AppProps {
  /** Whether the address of the page asked for the diagnostics of the jump loop. */
  diagnostics: boolean;
}

export function App({ diagnostics }: AppProps) {
  const { screen, navigated, show } = useScreens();
  useFirstScreenMark();
  const offline = useOfflineState();
  const { originalHills, setOriginalHills, gameFiles, filesStoreName, onGameFiles, onForgetFiles } = useGameFiles();
  const { save, persistent, update } = useStoredSave();
  const replays = useReplayShelf(save.settings.replays);
  const ghost = useRecordGhost(replays.shelf, screen.kind === "jump" ? screen.hill : null, save.settings.recordGhost);
  const onFinished = (hill: HillChoice, result: JumpResult, recording: JumpRecording) => {
    replays.onJumpFinished(hill, { recording, result }, beatsRecord(result, save.records[hill.id]));
    update((prev) => withJump(prev, hill.id, result, new Date()));
  };

  const onSettings = (change: Partial<Settings>) => {
    update((prev) => withSettings(prev, change));
  };
  const allHills = [...OWN_HILLS, ...originalHills];
  const contest = useCompetition(show, save.settings.outfit);

  const contestShown = contestScreen(screen, {
    contest,
    save,
    onSettings,
    onFinished,
    keepJump: replays.keepJump,
    hills: allHills,
    navigated,
    diagnostics,
    offline: offline.state,
    show,
  });
  if (contestShown) return contestShown;
  if (screen.kind === "jump") {
    const hill = screen.hill;
    return (
      <JumpScreen
        // A replay opens a screen of its own, even on the hill being jumped.
        key={screen.replay ? `${hill.id}-replay` : hill.id}
        hill={hill}
        record={save.records[hill.id]}
        settings={save.settings}
        onSettings={onSettings}
        onFinished={(result, recording) => onFinished(hill, result, recording)}
        onKeepJump={(jump) => replays.keepJump(hill, jump)}
        hills={[...OWN_HILLS, ...originalHills]}
        records={save.records}
        onPickHill={(picked) => show({ kind: "jump", hill: picked })}
        onExit={() => show({ kind: "menu" })}
        onOpenReplays={() => show({ kind: "replays" })}
        focusOnEntry={navigated}
        diagnostics={diagnostics}
        openingReplay={screen.replay ?? null}
        recordGhost={ghost}
        offline={offline.state}
      />
    );
  }
  const side = { settings: save.settings, onSettings, onBack: () => show({ kind: "menu" }), focusOnEntry: navigated };
  if (screen.kind === "replays") {
    return (
      <ReplaysScreen
        shelf={replays.shelf}
        hills={[...OWN_HILLS, ...originalHills]}
        onChangeShelf={replays.change}
        storeName={replays.storeName}
        originalHills={originalHills}
        onPlay={(hill, replay) => show({ kind: "jump", hill, replay })}
        {...side}
      />
    );
  }
  if (screen.kind === "howto" || screen.kind === "install" || screen.kind === "about" || screen.kind === "settings") {
    return <SideScreen kind={screen.kind} {...side} />;
  }
  if (screen.kind === "outfit") {
    return (
      <OutfitScreen
        outfit={save.settings.outfit}
        onChange={(outfit) => onSettings({ outfit })}
        onBack={() => show({ kind: "menu" })}
        focusOnEntry={navigated}
      />
    );
  }
  if (screen.kind === "hills") {
    return (
      <HillScreen
        hills={[...OWN_HILLS, ...originalHills]}
        records={save.records}
        onPick={(hill) => show({ kind: "jump", hill })}
        recordReplays={{
          hillIds: replays.recordHillIds,
          onWatch: (hill) => {
            const replay = replays.recordReplay(hill);
            if (replay) show({ kind: "jump", hill, replay });
            return replay ? null : typeset(UI_TEXT.replays.notTrue);
          },
        }}
        onBack={() => show({ kind: "menu" })}
        focusOnEntry={navigated}
      />
    );
  }
  return (
    <MenuScreen
      originalCount={originalHills.length}
      gameFiles={gameFiles}
      filesRemembered={filesStoreName !== "memory"}
      onGameFiles={onGameFiles}
      onForgetFiles={onForgetFiles}
      persistent={persistent}
      replaysNotStored={replays.notStored}
      offline={offline}
      onOpen={(kind) => show({ kind })}
      focusOnEntry={navigated}
      onOriginalHills={setOriginalHills}
    />
  );
}
