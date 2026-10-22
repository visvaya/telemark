import { useRef, useState, type FocusEvent } from "react";
import type { HillChoice } from "../game/hill-choice";
import type { HillRecord } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { FlagIcon } from "./flag-icon";
import { formatDecimal } from "./number-text";
import { useEntryFocus } from "./use-entry-focus";

interface Props {
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  onPick: (hill: HillChoice) => void;
  /** The hills whose record can be watched again, and what watching one does; it may say why it cannot. */
  recordReplays?: { hillIds: ReadonlySet<string>; onWatch: (hill: HillChoice) => string | null };
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/**
 * Brings a focused button of the list wholly onto the screen. Firefox does not scroll a button that is partly
 * visible when Tab moves the focus to it, so a hill at the bottom edge of the window stayed half hidden.
 */
const revealFocused = (event: FocusEvent<HTMLButtonElement>): void => {
  event.currentTarget.scrollIntoView({ block: "nearest" });
};

type ListProps = Pick<Props, "hills" | "records" | "onPick"> & {
  recordReplays?: { hillIds: ReadonlySet<string>; onWatch: (hill: HillChoice) => void };
};

function HillList({ title, hills, records, onPick, recordReplays }: ListProps & { title: string }) {
  if (hills.length === 0) return null;
  return (
    <section className="hill-section" aria-label={title}>
      <h2 className="hill-section-title">{title}</h2>
      <ul className="hill-grid">
        {hills.map((h) => {
          const record = records[h.id];
          return (
            <li key={h.id} className="hill-row">
              <button type="button" className="hill-item" onClick={() => onPick(h)} onFocus={revealFocused}>
                <FlagIcon country={h.country} />
                <span className="hill-item-name">{h.name}</span>
                <span className="hill-item-k">{UI_TEXT.hills.kPoint(h.kPointM)}</span>
                {record ? (
                  <span className="hill-item-record">{UI_TEXT.hills.record(formatDecimal(record.distanceM, 2))}</span>
                ) : null}
              </button>
              {recordReplays?.hillIds.has(h.id) === true && (
                <button
                  type="button"
                  className="pixel-button small-button hill-replay"
                  aria-label={UI_TEXT.hills.watchRecordLabel(UI_TEXT.hillLabel(h.name, h.kPointM))}
                  onClick={() => recordReplays.onWatch(h)}
                  onFocus={revealFocused}
                >
                  {UI_TEXT.hills.watchRecord}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The hills to choose from: the game's own, then the original's when the player has loaded them. */
export function HillLists({ hills, ...rest }: ListProps) {
  return (
    <>
      <HillList title={UI_TEXT.hills.own} hills={hills.filter((h) => h.source === "own")} {...rest} />
      <HillList title={UI_TEXT.hills.original} hills={hills.filter((h) => h.source === "original")} {...rest} />
    </>
  );
}

export function HillScreen({ hills, records, onPick, recordReplays, onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const [message, setMessage] = useState("");
  // A replay that cannot be watched says why, under the list.
  const watching: Pick<ListProps, "recordReplays"> =
    recordReplays === undefined
      ? {}
      : { recordReplays: { ...recordReplays, onWatch: (hill) => setMessage(recordReplays.onWatch(hill) ?? "") } };
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {UI_TEXT.hills.title}
      </h1>
      <hr className="rule" />
      <HillLists hills={hills} records={records} onPick={onPick} {...watching} />
      <p className={message === "" ? "note" : "note error"} role="status">
        {message}
      </p>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
