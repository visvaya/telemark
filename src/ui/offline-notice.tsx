import { useEffect, useReducer, useState, type ReactNode } from "react";
import {
  reduceReadinessRetry,
  reduceReinstall,
  reinstallOffered,
  reduceUpdateCheck,
  type OfflineState,
  type ReadinessOutcome,
} from "../pwa/offline-state";
import { UI_TEXT } from "../text/ui-text";
import { typeset } from "./typeset";
import type { UpdateControls } from "./use-offline-state";

/**
 * Whether the game can be played without a network; when it cannot, why (as far as the page can tell) and a
 * button that checks again. Presses while a check runs make no second check; its answer is said in a live region
 * that stays after the game has become ready. The error behind it shows only with the diagnostics on.
 *
 * When only a new install can mend the stored game (`reinstallOffered`), it also offers that, with the reload it
 * makes said beside it. Presses while it runs do nothing; a failure is said in its live region.
 */
export function OfflineNotice({
  state,
  onRetry,
  onReinstall,
  diagnostics = false,
}: {
  state: OfflineState | null;
  onRetry?: (() => Promise<ReadinessOutcome>) | undefined;
  onReinstall?: (() => Promise<"failed">) | undefined;
  diagnostics?: boolean;
}) {
  const [retry, dispatch] = useReducer(reduceReadinessRetry, "idle");
  const [reinstall, dispatchReinstall] = useReducer(reduceReinstall, "idle");
  if (state === null) return null;
  const reinstalling = reinstall === "reinstalling";
  const onReinstallPress = () => {
    if (reinstalling || !onReinstall) return;
    dispatchReinstall("start");
    void onReinstall().then(dispatchReinstall);
  };
  const checking = retry === "checking";
  const onPress = () => {
    if (checking || !onRetry) return;
    dispatch("start");
    void onRetry().then(dispatch);
  };
  const cause = state.readiness === "unavailable" ? state.unavailable : null;
  const offerReinstall = onReinstall !== undefined && cause !== null && reinstallOffered(cause.cause, retry);
  return (
    <div className="offline-notice">
      <p className="note">{UI_TEXT.offline.readiness[state.readiness]}</p>
      {cause && <p className="note">{UI_TEXT.offline.cause[cause.cause]}</p>}
      {cause && diagnostics && cause.detail !== null && <p className="note">{UI_TEXT.offline.detail(cause.detail)}</p>}
      {onRetry && state.readiness === "unavailable" && (
        <button type="button" className="pixel-button small-button" aria-disabled={checking} onClick={onPress}>
          {UI_TEXT.offline.retry.button}
        </button>
      )}
      {onRetry && (
        <div aria-live="polite">{retry !== "idle" && <p className="note">{UI_TEXT.offline.retry[retry]}</p>}</div>
      )}
      {offerReinstall && (
        <>
          <button
            type="button"
            className="pixel-button small-button"
            aria-disabled={reinstalling}
            onClick={onReinstallPress}
          >
            {UI_TEXT.offline.reinstall.button}
          </button>
          <p className="note">{UI_TEXT.offline.reinstall.explanation}</p>
        </>
      )}
      {onReinstall && (
        <div aria-live="polite">
          {reinstall !== "idle" && <p className="note">{UI_TEXT.offline.reinstall[reinstall]}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * How long a release has to wait before the note about it shows. On the first launch after an update the browser
 * may report the new release as waiting for a moment before it takes over; a note for that moment would flash.
 */
const UPDATE_NOTE_AFTER_MS = 1500;

/** Whether a release has been waiting for a while, not only for the moment of a takeover. */
export function useLastingWait(waiting: boolean): boolean {
  const [lasting, setLasting] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setLasting(true), UPDATE_NOTE_AFTER_MS);
    // Once the release no longer waits, a later one waits its own while again.
    return () => {
      clearTimeout(timer);
      setLasting(false);
    };
  }, [waiting]);
  return waiting && lasting;
}

/** The note of a waiting release in the main menu: the fact, the button that installs it now, the slow way. */
function InstallNote({ version, onInstall }: { version: string | null; onInstall: (onFailed: () => void) => boolean }) {
  const [install, setInstall] = useState<"idle" | "installing" | "failed">("idle");
  const installing = install === "installing";
  const onPress = () => {
    if (installing) return;
    // The page reloads once the release has taken over; until then the player is told it is under way.
    const started = onInstall(() => setInstall("failed"));
    setInstall(started ? "installing" : "failed");
  };
  return (
    <div className="framed-note update-note install-note">
      <p className="note update-fact">{typeset(UI_TEXT.offline.updateFound(version))}</p>
      <button type="button" className="pixel-button small-button" aria-disabled={installing} onClick={onPress}>
        {UI_TEXT.offline.installNow}
      </button>
      <div aria-live="polite">
        {install !== "idle" && (
          <p className="note update-fact">
            {typeset(installing ? UI_TEXT.offline.installing : UI_TEXT.offline.installFailed)}
          </p>
        )}
      </div>
      <p className="note">{typeset(UI_TEXT.offline.slowWay)}</p>
    </div>
  );
}

/** A release has taken over from another window; this page still runs the code it started with. */
function ElsewhereNote({ onReload }: { onReload: (() => void) | undefined }) {
  return (
    <div className="framed-note update-note install-note">
      <p className="note update-fact">{typeset(UI_TEXT.offline.updatedElsewhere)}</p>
      {onReload && (
        <button type="button" className="pixel-button small-button" onClick={onReload}>
          {UI_TEXT.offline.reload}
        </button>
      )}
    </div>
  );
}

/**
 * That a newer release is waiting and how to get it, framed so it is seen: at the top of the main menu and in the
 * menu of the jump screen. It is announced to screen readers when it appears; nothing here takes the focus. The
 * region is empty until then and sits inside a block of its own place, so it leaves no gap in a column of buttons.
 *
 * With `updates` it also offers to install the release at once, or to load a release installed from another
 * window, both by reloading the page. Only the main menu passes it: on the jump screen a reload would end the
 * jump that is paused there, so the note there only says what to do.
 */
export function UpdateNotice({
  state,
  updates,
}: {
  state: OfflineState | null;
  updates?: UpdateControls | null | undefined;
}) {
  const shown = useLastingWait(state?.updateWaiting === true);
  const elsewhere = state?.updatedElsewhere === true && !shown;
  return (
    <div aria-live="polite">
      {shown && state && !updates && (
        <p className="note framed-note update-note">{typeset(UI_TEXT.offline.updateWaiting(state.updateVersion))}</p>
      )}
      {shown && state && updates && <InstallNote version={state.updateVersion} onInstall={updates.installNow} />}
      {elsewhere && <ElsewhereNote onReload={updates?.reloadNow} />}
    </div>
  );
}

/**
 * What the game is and its version, with whatever follows the version (the sign of the check). The version keeps
 * to one line; when it goes to a line of its own, the dot between the two is left out.
 */
export function Subtitle({ version, children }: { version: string; children?: ReactNode }) {
  return (
    <p className="note subtitle">
      <span>{UI_TEXT.menu.tagline}</span>
      <span className="subtitle-version">
        {version}
        {children}
      </span>
    </p>
  );
}

/** The sign of looking for a new release: a circle of the game's pixels turning clockwise, its head at the top. */
const REFRESH_PIXELS = ["..###.#", ".#...##", "#...###", "#......", "#.....#", ".#...#.", "..###.."] as const;

/** The sign's pixels as one path of unit squares. */
const REFRESH_PATH = REFRESH_PIXELS.flatMap((row, y) =>
  Array.from(row).flatMap((cell, x) => (cell === "#" ? [`M${x} ${y}h1v1h-1z`] : [])),
).join("");

function RefreshSign() {
  return (
    <svg viewBox="0 0 7 7" width="14" height="14" shapeRendering="crispEdges" aria-hidden="true">
      <path d={REFRESH_PATH} fill="currentColor" />
    </svg>
  );
}

/**
 * A button that looks for a new release now, and what it found, said in a live region beside it. Presses while
 * a check runs make no second check. A release that is found is stored in the background as any other, and
 * `UpdateNotice` offers it once it waits; from then on the note says it, and the line here says nothing.
 */
export function UpdateCheck({
  version,
  updates,
  noteShown,
  failures,
}: {
  /** The version (`versionLabel()`), which the sign follows on the line of what the game is. */
  version: string;
  updates: UpdateControls;
  noteShown: boolean;
  /** How many newer releases could not be stored so far (`OfflineState.updateFailures`). */
  failures: number;
}) {
  const [check, dispatch] = useReducer(reduceUpdateCheck, "idle");
  // The failures counted when the last check started: one more since then is the release that check found.
  const [failuresAtCheck, setFailuresAtCheck] = useState(failures);
  const checking = check === "checking";
  const onCheck = () => {
    if (checking) return;
    setFailuresAtCheck(failures);
    dispatch("start");
    void updates.checkNow().then(dispatch);
  };
  const line = (() => {
    if (check === "idle") return null;
    if (check !== "found") return UI_TEXT.offline.check[check];
    if (failures > failuresAtCheck) return UI_TEXT.offline.check.downloadFailed;
    // Once the note of the waiting release shows, the note alone says it.
    return noteShown ? null : UI_TEXT.offline.check.found;
  })();
  return (
    <div className="update-check">
      <Subtitle version={version}>
        <button
          type="button"
          className="quiet-button icon-button"
          aria-label={UI_TEXT.offline.check.button}
          title={UI_TEXT.offline.check.button}
          aria-disabled={checking}
          onClick={onCheck}
        >
          <RefreshSign />
        </button>
      </Subtitle>
      {/* A region of its own, there before the first answer so that answer is announced. */}
      <div aria-live="polite">{line !== null && <p className="note">{line}</p>}</div>
    </div>
  );
}
