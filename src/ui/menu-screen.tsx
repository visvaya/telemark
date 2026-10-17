import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { originalHillChoices, type HillChoice } from "../game/hill-choice";
import { versionLabel } from "../game/version";
import { readOriginalHills } from "../original/original-hills";
import type { GameFiles } from "../storage/game-files-store";
import { UI_TEXT } from "../text/ui-text";
import { gameFilesOutcome } from "./game-files-choice";
import { OfflineNotice, Subtitle, UpdateCheck, UpdateNotice, useLastingWait } from "./offline-notice";
import { typeset } from "./typeset";
import { useEntryFocus } from "./use-entry-focus";
import { INSTALLED_QUERY, TOUCH_QUERY, useMediaQuery } from "./use-media-query";
import type { OfflineSupportView } from "./use-offline-state";

/** Said when the browser does not let the page close its own window: a framed note. */
const QUIT_REFUSED = typeset(UI_TEXT.menu.quitRefused);
/** A window that closes is gone before this; one that stays gets the note. */
const QUIT_NOTE_AFTER_MS = 300;

interface Props {
  originalCount: number;
  gameFiles: GameFiles;
  /** Whether chosen files are kept for the next visit (false: only until the page closes). */
  filesRemembered: boolean;
  onGameFiles: (files: GameFiles) => void;
  onForgetFiles: () => void;
  persistent: boolean;
  /** Whether replays can be stored only for this visit: the browser store keeps failing. */
  replaysNotStored: boolean;
  /** Whether the game can start without a network, and the means to check for and install a new release. */
  offline: OfflineSupportView;
  /** Opens another screen of the game. */
  onOpen: (
    screen: "hills" | "contest-setup" | "replays" | "outfit" | "settings" | "howto" | "install" | "about",
  ) => void;
  onOriginalHills: (hills: HillChoice[]) => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/** The choices at the top of the menu, in order, with what each opens. */
const FIRST_CHOICES = [
  ["hills", UI_TEXT.menu.training],
  ["contest-setup", UI_TEXT.menu.competition],
  ["replays", UI_TEXT.menu.replays],
  ["outfit", UI_TEXT.menu.outfit],
  ["settings", UI_TEXT.menu.settings],
  ["howto", UI_TEXT.menu.howTo],
] as const;

async function bytesOf(files: FileList, name: string): Promise<Uint8Array | undefined> {
  const file = Array.from(files).find((f) => f.name.toLowerCase() === name);
  return file ? new Uint8Array(await file.arrayBuffer()) : undefined;
}

/**
 * The name of the game, its version with the check for a new one, the game it follows, and the note of a waiting
 * release.
 */
function MenuHeader({
  headingRef,
  offline: { state, updates },
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  offline: OfflineSupportView;
}) {
  // The same moment the note of a waiting release appears: from then on the note alone says it.
  const noteShown = useLastingWait(state?.updateWaiting === true);
  const version = versionLabel();
  return (
    <header>
      <h1 className="title" tabIndex={-1} ref={headingRef}>
        {UI_TEXT.appName}
      </h1>
      {updates ? (
        <UpdateCheck version={version} updates={updates} noteShown={noteShown} failures={state?.updateFailures ?? 0} />
      ) : (
        <Subtitle version={version} />
      )}
      <p className="note homage">{UI_TEXT.menu.homage}</p>
      <UpdateNotice state={state} updates={updates} />
    </header>
  );
}

export function MenuScreen({
  originalCount,
  gameFiles,
  filesRemembered,
  onGameFiles,
  onForgetFiles,
  persistent,
  replaysNotStored,
  offline,
  onOpen,
  onOriginalHills,
  focusOnEntry,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  // Started from its own icon the game is installed already, and the instructions for that are left out.
  const installed = useMediaQuery(INSTALLED_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);
  const [quitRefused, setQuitRefused] = useState(false);
  const quitNoteRef = useRef<HTMLParagraphElement>(null);
  // The note takes the focus, so it is not missed: the eyes are on the button that was just pressed.
  useEffect(() => {
    if (quitRefused) quitNoteRef.current?.focus();
  }, [quitRefused]);
  /**
   * Closes the window of the game. A browser lets a page do that only for a window it has nowhere to go back
   * in (the installed game, a tab opened for it); where it refuses, the player is told how to close the tab.
   */
  const quit = () => {
    window.close();
    window.setTimeout(() => setQuitRefused(true), QUIT_NOTE_AFTER_MS);
  };
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    // Files may come one at a time (some pickers allow only one), so new ones join those chosen before.
    const exe = (await bytesOf(files, "dsj.exe")) ?? gameFiles.exe;
    const dat = (await bytesOf(files, "dsj.dat")) ?? gameFiles.dat;
    const outcome = gameFilesOutcome({ ...(exe ? { exe } : {}), ...(dat ? { dat } : {}) }, (exeBytes, datBytes) =>
      originalHillChoices(readOriginalHills(exeBytes, datBytes)),
    );
    if (outcome.keep) onGameFiles(outcome.keep);
    if (outcome.hills) onOriginalHills(outcome.hills);
    setMessage(outcome.message);
  };

  return (
    <main className="screen">
      <MenuHeader headingRef={headingRef} offline={offline} />
      <hr className="rule" />
      <nav className="menu" aria-label={UI_TEXT.menu.navigation}>
        <h2>{UI_TEXT.menu.navigation}</h2>
        {FIRST_CHOICES.map(([kind, label]) => (
          <button key={kind} type="button" className="pixel-button" onClick={() => onOpen(kind)}>
            {label}
          </button>
        ))}
        {!installed && (
          <button type="button" className="pixel-button" onClick={() => onOpen("install")}>
            {UI_TEXT.menu.install}
          </button>
        )}
        <button type="button" className="pixel-button" onClick={() => onOpen("about")}>
          {UI_TEXT.menu.about}
        </button>
        <label className="pixel-button file-label">
          {UI_TEXT.menu.loadFiles}
          {/* No accept filter: iOS does not know .dat and greys such files out. The names are checked instead. */}
          <input type="file" multiple onChange={(e) => void onFiles(e)} />
        </label>
        {!touch && (
          <button type="button" className="pixel-button" onClick={quit}>
            {UI_TEXT.menu.quit}
          </button>
        )}
        {quitRefused && (
          <p className="note quit-note" role="status" tabIndex={-1} ref={quitNoteRef}>
            {QUIT_REFUSED}
          </p>
        )}
      </nav>
      <p className="note">{UI_TEXT.menu.filesHelp}</p>
      {gameFiles.exe && (
        <div className="files-status">
          <p className="note">
            {UI_TEXT.menu.originalCount(originalCount)}
            {filesRemembered
              ? UI_TEXT.menu.filesRemembered(gameFiles.dat !== undefined)
              : UI_TEXT.menu.filesNotRemembered}
          </p>
          {filesRemembered && (
            <button
              type="button"
              className="pixel-button small-button"
              onClick={() => {
                onForgetFiles();
                setMessage({ text: UI_TEXT.menu.filesForgotten, error: false });
              }}
            >
              {UI_TEXT.menu.forgetFiles}
            </button>
          )}
        </div>
      )}
      {!persistent && <p className="note error">{UI_TEXT.menu.notPersistent}</p>}
      {replaysNotStored && <p className="note error">{UI_TEXT.menu.replaysNotStored}</p>}
      {message && (
        <p className={message.error ? "note error" : "note"} role="status">
          {message.text}
        </p>
      )}
      <OfflineNotice state={offline.state} />
    </main>
  );
}
