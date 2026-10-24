import { useEffect, useLayoutEffect, useState, type ReactElement } from "react";
import { OWN_HILLS, originalHillChoices, type HillChoice } from "../game/hill-choice";
import { MARK_FIRST_SCREEN, markOnce } from "../game/performance-marks";
import { tiltSupported } from "../game/tilt-input";
import {
  beatsRecord,
  emptySave,
  mergedSave,
  withContest,
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
import { recordSaveOf, type RecordWrite } from "./record-save";
import type { RecordSave } from "../render/jump-view";
import { CompetitionSetupScreen } from "./competition-setup-screen";
import { CompetitionScreen } from "./competition-screen";
import { CupEndScreen, CupStandingsScreen } from "./cup-screens";
import { contestDescription, missingHillsMessage } from "./contest-description";
import type { ChosenContest } from "./competition-setup-screen";
import { CONTEST_FILE_MAX_BYTES, readContestFile } from "../storage/contest-file";

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
  | { kind: "contest-jump"; hill: HillChoice }
  /** The cup standings between two competitions of a world cup. */
  | { kind: "cup-standings" }
  /** The end of a world cup: the podium and the final standings. */
  | { kind: "cup-end" };

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

  /** Stores the change; `onStored` hears how the write went, or that the change left the save as it was. */
  const update = (next: (current: SaveData) => SaveData, onStored?: (write: RecordWrite) => void) =>
    setSave((prev) => {
      const changed = next(prev);
      if (changed === prev) {
        // Told after this update, never inside it.
        if (onStored) void Promise.resolve().then(() => onStored("unchanged"));
        return prev;
      }
      const done = sync.saving();
      saveSave(backend, changed).then(
        (stored) => {
          done(true);
          setSave((current) => mergedSave(stored, current));
          onStored?.("stored");
        },
        () => {
          done(false);
          setSaveFailed(true);
          onStored?.("failed");
        },
      );
      return changed;
    });
  return { save, persistent: backend.name !== "memory" && !saveFailed, kept: backend.name !== "memory", update };
}

interface ContestContext {
  contest: ReturnType<typeof useCompetition>;
  save: SaveData;
  recordSave: RecordSave;
  onSettings: (change: Partial<Settings>) => void;
  onFinished: (hill: HillChoice, result: JumpResult, recording: JumpRecording, holder?: string) => void;
  keepJump: (hill: HillChoice, jump: FinishedJump) => KeepOutcome;
  hills: readonly HillChoice[];
  navigated: boolean;
  diagnostics: boolean;
  offline: OfflineState | null;
  show: (next: Screen) => void;
  /** The line that tells the kept competition; null when none is kept. */
  kept: string | null;
  readContest: (file: File) => Promise<ChosenContest>;
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
        recordSave={c.recordSave}
        settings={c.save.settings}
        onSettings={c.onSettings}
        onFinished={(result, recording) => {
          // A player's competition jump counts for the hill record as a training jump does; a computer's never.
          const jump = c.contest.jump;
          if (jump === null || jump.contest.cpu !== null) return;
          c.contest.onPlayerResult(result);
          c.onFinished(hill, result, recording, jump.contest.holder);
        }}
        onKeepJump={(jump) => c.keepJump(hill, jump)}
        hills={c.hills}
        records={c.save.records}
        onPickHill={() => undefined}
        onExit={c.contest.leave}
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
  const run = c.contest.run;
  if (screen.kind === "cup-standings" && run) {
    return (
      <CupStandingsScreen
        run={run}
        onNext={c.contest.nextCompetition}
        onLeave={c.contest.leave}
        onFinish={c.contest.finish}
        focusOnEntry={c.navigated}
      />
    );
  }
  if (screen.kind === "cup-end" && run) {
    return <CupEndScreen run={run} onAgain={c.contest.again} onMenu={c.contest.finish} focusOnEntry={c.navigated} />;
  }
  if (screen.kind === "contest" && run) {
    const state = run.cup.competition;
    return (
      <CompetitionScreen
        key={`${run.cup.index}-${state.round}-${state.position}-${run.log.length}`}
        run={run}
        record={c.save.records[run.hill.id]}
        onNext={c.contest.next}
        onAgain={c.contest.again}
        onStandings={c.contest.standings}
        onEnd={c.contest.end}
        onMenu={c.contest.finish}
        onLeave={c.contest.leave}
        onFinish={c.contest.finish}
        focusOnEntry={c.navigated}
      />
    );
  }
  if (screen.kind === "contest-setup") {
    return (
      <CompetitionSetupScreen
        hills={c.hills}
        records={c.save.records}
        settings={c.save.settings.competition}
        onChange={(competition) => c.onSettings({ competition })}
        onStart={(hills) => c.contest.start(hills, c.save.settings.competition)}
        onBack={() => c.show({ kind: "menu" })}
        focusOnEntry={c.navigated}
        kept={c.kept}
        onReadFile={c.readContest}
      />
    );
  }

  return null;
}

const refused = (message: string): ChosenContest => ({ kind: "refused", message });

/**
 * The competition being run, and the one kept in the save: the line that tells it, going on with it, and reading
 * a competition file.
 */
function useKeptContest(
  show: (next: Screen) => void,
  save: SaveData,
  update: (next: (current: SaveData) => SaveData) => void,
  allHills: readonly HillChoice[],
) {
  const contest = useCompetition(show, save.settings.outfit, (kept) => update((prev) => withContest(prev, kept)));
  const kept = save.contest === null ? null : contestDescription(save.contest, allHills);
  /** Goes on with the kept competition; a message instead when this device lacks one of its hills. */
  const resumeKept = (): string | null => {
    if (save.contest === null) return null;
    return contest.resume(save.contest, allHills) ? null : missingHillsMessage(save.contest, allHills);
  };
  /** A chosen competition file: refused with the reason, or ready to go on with as a kept one is. */
  const readContest = async (file: File): Promise<ChosenContest> => {
    if (file.size > CONTEST_FILE_MAX_BYTES) return refused(UI_TEXT.competition.fileRefused.notContest);
    const read = readContestFile(await file.text());
    if (!read.ok) return refused(UI_TEXT.competition.fileRefused[read.refusal]);
    const missing = missingHillsMessage(read.contest, allHills);
    if (missing !== null) return refused(missing);
    return { kind: "ready", go: () => contest.resume(read.contest, allHills) };
  };
  return { contest, kept, resumeKept, readContest };
}

/**
 * What becomes of a finished jump: its replay kept, and the hill record taken when it beats it, by `holder`
 * (training: player 1); and how the write of the latest new record went.
 */
function useFinishedJumps(
  { save, kept, update }: ReturnType<typeof useStoredSave>,
  keepReplay: ReturnType<typeof useReplayShelf>["onJumpFinished"],
) {
  const [recordWrite, setRecordWrite] = useState<RecordWrite>("stored");
  const onFinished = (hill: HillChoice, result: JumpResult, recording: JumpRecording, holder?: string) => {
    const beats = beatsRecord(result, save.records[hill.id]);
    keepReplay(hill, { recording, result }, beats);
    const by = holder ?? UI_TEXT.competition.playerName(1);
    if (beats) setRecordWrite("saving");
    update((prev) => withJump(prev, hill.id, result, new Date(), by), beats ? setRecordWrite : undefined);
  };
  return { onFinished, recordSave: recordSaveOf(recordWrite, kept) };
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
  const stored = useStoredSave();
  const { save, persistent, update } = stored;
  const replays = useReplayShelf(save.settings.replays);
  const ghost = useRecordGhost(replays.shelf, screen.kind === "jump" ? screen.hill : null, save.settings.recordGhost);
  const { onFinished, recordSave } = useFinishedJumps(stored, replays.onJumpFinished);

  const onSettings = (change: Partial<Settings>) => {
    update((prev) => withSettings(prev, change));
  };
  const allHills = [...OWN_HILLS, ...originalHills];
  const keptContest = useKeptContest(show, save, update, allHills);

  const contestShown = contestScreen(screen, {
    ...keptContest,
    save,
    recordSave,
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
        recordSave={recordSave}
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
      diagnostics={diagnostics}
      onOpen={(kind) => show({ kind })}
      kept={keptContest.kept}
      onResume={keptContest.resumeKept}
      focusOnEntry={navigated}
      onOriginalHills={setOriginalHills}
    />
  );
}
