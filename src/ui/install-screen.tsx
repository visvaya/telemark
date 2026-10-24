import { useEffect, useRef, useState } from "react";
import { UI_TEXT } from "../text/ui-text";
import { readStorageUsage, storageUsageNote } from "./storage-usage";
import { useEntryFocus } from "./use-entry-focus";

interface Props {
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/** Steps under a heading of their own: the name of each, then what to do. */
function Steps({ steps }: { steps: readonly { title: string; text: string }[] }) {
  return (
    <dl className="how-to">
      {steps.map((step) => (
        <div key={step.title} className="how-to-step">
          <dt>{step.title}</dt>
          <dd>{step.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The bytes the game takes on the device, read once the screen opens; undefined while the browser counts. */
function useStorageUsage(): number | null | undefined {
  const [usage, setUsage] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    // Outside a secure page the browser has no `navigator.storage`, though its type says otherwise.
    const storage = "storage" in navigator ? navigator.storage : null;
    void readStorageUsage(storage).then((bytes) => {
      if (!cancelled) setUsage(bytes);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return usage;
}

/**
 * Installing the game as an application, the room it takes on the device and how to remove it, opened from the
 * main menu.
 */
export function InstallScreen({ onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const usage = useStorageUsage();
  const T = UI_TEXT.install;
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {T.title}
      </h1>
      <p className="note">{T.intro}</p>
      <Steps steps={T.steps} />
      <section className="how-to-section" aria-labelledby="install-storage">
        <h2 id="install-storage">{T.storageTitle}</h2>
        <p className="note" aria-live="polite">
          {usage === undefined ? T.storageChecking : storageUsageNote(usage)}
        </p>
      </section>
      <section className="how-to-section" aria-labelledby="install-removal">
        <h2 id="install-removal">{T.removalTitle}</h2>
        <Steps steps={T.removal} />
      </section>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
