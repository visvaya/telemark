import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  CPU_LEVEL_SETTINGS,
  DISQUALIFICATION_RULES,
  participantCount,
  type CompetitionSettings,
  type CpuLevelSetting,
  type DisqualificationRule,
} from "../game/competition";
import { RIVALS } from "../game/competition-rivals";
import { cupSchedule } from "../game/cup";
import type { HillChoice } from "../game/hill-choice";
import type { HillRecord } from "../storage/save-data";
import { formatDecimal } from "../text/decimal";
import { UI_TEXT } from "../text/ui-text";
import { FlagIcon } from "./flag-icon";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.competition;

interface Props {
  hills: readonly HillChoice[];
  /** The hill records kept on this device, by hill id. */
  records: Readonly<Record<string, HillRecord>>;
  settings: CompetitionSettings;
  onChange: (settings: CompetitionSettings) => void;
  /** Starts a competition on each of the hills, in this order. */
  onStart: (hills: HillChoice[]) => void;
  onBack: () => void;
  focusOnEntry: boolean;
  /** The line that tells the competition kept to be resumed; null when none is kept. */
  kept: string | null;
  /** Reads a chosen competition file: why it cannot go on, or the way to go on with it. */
  onReadFile: (file: File) => Promise<ChosenContest>;
}

/** A chosen competition file: refused with the reason, or ready to go on with. */
export type ChosenContest = { kind: "refused"; message: string } | { kind: "ready"; go: () => void };

/**
 * Before a new competition replaces the kept one: the question, with the focus on its safe answer; answered no, the
 * focus goes back to the start button.
 */
function ReplaceQuestion({ kept, onYes, onNo }: { kept: string; onYes: () => void; onNo: () => void }) {
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => noRef.current?.focus(), []);
  return (
    <div className="tilt-question" role="group" aria-labelledby="replace-question-text">
      <p className="note" id="replace-question-text">
        {T.replaceQuestion(kept)}
      </p>
      <button type="button" className="pixel-button" onClick={onYes}>
        {T.replaceYes}
      </button>
      <button type="button" className="pixel-button" ref={noRef} onClick={onNo}>
        {T.replaceNo}
      </button>
    </div>
  );
}

/** The ticked hills' ids in the order of the list; none ticked yet shows the first hill ticked. */
const tickedIds = (hills: readonly HillChoice[], hillIds: readonly string[] | null): string[] =>
  cupSchedule(
    hillIds,
    hills.map((h) => h.id),
    false,
  );

const replaced = <T,>(list: readonly T[], at: number, value: T): T[] => list.map((v, i) => (i === at ? value : v));

/**
 * A box with its text, framed like the boxes of the settings; a note after the text (a hill's record) describes the
 * box without becoming part of its name.
 */
function Check({
  label,
  note,
  checked,
  onChange,
}: {
  label: ReactNode;
  note?: string | undefined;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  const named = note === undefined ? {} : { "aria-labelledby": `${id}-label`, "aria-describedby": `${id}-note` };
  return (
    <label className="settings-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} {...named} />
      <span id={`${id}-label`}>{label}</span>
      {note !== undefined && (
        <span id={`${id}-note`} className="contest-hill-record">
          {note}
        </span>
      )}
    </label>
  );
}

/** The rule for a disqualified jump: the original's penalty points, or out of the competition. */
function DisqualificationChoice({
  value,
  onChange,
}: {
  value: DisqualificationRule;
  onChange: (rule: DisqualificationRule) => void;
}) {
  return (
    <section className="settings-group" aria-labelledby="contest-dq">
      <h2 className="hill-section-title" id="contest-dq">
        {T.disqualificationRule}
      </h2>
      <select
        className="pixel-select"
        aria-labelledby="contest-dq"
        value={value}
        onChange={(e) => {
          const rule = DISQUALIFICATION_RULES.find((r) => r === e.currentTarget.value);
          if (rule !== undefined) onChange(rule);
        }}
      >
        {DISQUALIFICATION_RULES.map((rule) => (
          <option key={rule} value={rule}>
            {T.disqualificationRules[rule]}
          </option>
        ))}
      </select>
    </section>
  );
}

/** One group of hills, each with its box, under a small heading when there are two groups. */
function HillGroup({
  title,
  hills,
  records,
  ticked,
  onTick,
}: {
  title: string | null;
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  ticked: readonly string[];
  onTick: (id: string, on: boolean) => void;
}) {
  if (hills.length === 0) return null;
  return (
    <div className="contest-hill-group">
      {title !== null && <h3 className="contest-hill-group-title">{title}</h3>}
      {hills.map((h) => {
        const record = records[h.id];
        return (
          <Check
            key={h.id}
            label={UI_TEXT.hillLabel(h.name, h.kPointM)}
            note={record === undefined ? undefined : UI_TEXT.hills.record(formatDecimal(record.distanceM, 2))}
            checked={ticked.includes(h.id)}
            onChange={(on) => onTick(h.id, on)}
          />
        );
      })}
    </div>
  );
}

/** The hills of the competitions, own and original apart, with the buttons for the whole list and the double cup. */
function HillsChoice({
  hills,
  records,
  settings,
  ticked,
  onChange,
}: {
  hills: readonly HillChoice[];
  records: Readonly<Record<string, HillRecord>>;
  settings: CompetitionSettings;
  ticked: readonly string[];
  onChange: (settings: CompetitionSettings) => void;
}) {
  const tick = (id: string, on: boolean) => {
    const next = on ? [...ticked, id] : ticked.filter((t) => t !== id);
    onChange({ ...settings, hillIds: hills.map((h) => h.id).filter((h) => next.includes(h)) });
  };
  const own = hills.filter((h) => h.source === "own");
  const original = hills.filter((h) => h.source === "original");
  const grouped = own.length > 0 && original.length > 0;
  return (
    <section className="settings-group" aria-labelledby="contest-hill">
      <h2 className="hill-section-title" id="contest-hill">
        {T.hills}
      </h2>
      <div className="contest-hill-actions">
        <button
          type="button"
          className="pixel-button"
          onClick={() => onChange({ ...settings, hillIds: hills.map((h) => h.id) })}
        >
          {T.selectAllHills}
        </button>
        <button type="button" className="pixel-button" onClick={() => onChange({ ...settings, hillIds: [] })}>
          {T.clearHills}
        </button>
      </div>
      <HillGroup title={grouped ? T.ownHills : null} hills={own} records={records} ticked={ticked} onTick={tick} />
      <HillGroup
        title={grouped ? T.originalHills : null}
        hills={original}
        records={records}
        ticked={ticked}
        onTick={tick}
      />
      <Check
        label={T.doubleCup}
        checked={settings.doubleCup}
        onChange={(doubleCup) => onChange({ ...settings, doubleCup })}
      />
      <p className="note contest-hill-note">{T.doubleCupNote}</p>
    </section>
  );
}

/** The computer jumpers, each with its box and level, and whether their jumps are watched. */
function RivalsChoice({
  settings,
  onChange,
}: {
  settings: CompetitionSettings;
  onChange: (settings: CompetitionSettings) => void;
}) {
  return (
    <section className="settings-group" aria-labelledby="contest-cpus">
      <h2 className="hill-section-title" id="contest-cpus">
        {T.cpus}
      </h2>
      <ul className="contest-rivals">
        {settings.cpus.map((cpu, i) => {
          const rival = RIVALS[i];
          if (!rival) return null;
          return (
            <li key={rival.name} className={cpu.on ? "contest-rival" : "contest-rival contest-rival-off"}>
              <Check
                label={
                  <>
                    <FlagIcon country={rival.country} /> {rival.name}
                  </>
                }
                checked={cpu.on}
                onChange={(on) => onChange({ ...settings, cpus: replaced(settings.cpus, i, { ...cpu, on }) })}
              />
              <select
                className="pixel-select"
                aria-label={T.levelLabel(rival.name)}
                value={cpu.level}
                onChange={(e) => {
                  const level = CPU_LEVEL_SETTINGS.find((l) => String(l) === e.currentTarget.value);
                  if (level !== undefined)
                    onChange({ ...settings, cpus: replaced(settings.cpus, i, { ...cpu, level }) });
                }}
              >
                {CPU_LEVEL_SETTINGS.map((level: CpuLevelSetting) => (
                  <option key={level} value={level}>
                    {T.levels[level]}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <Check
        label={T.watchCpu}
        checked={settings.watchCpu}
        onChange={(watchCpu) => onChange({ ...settings, watchCpu })}
      />
    </section>
  );
}

/**
 * What starts a competition while another is kept: the question first. Also reads a chosen competition file, which
 * goes on as a kept one does once the question is answered.
 */
function useReplacing(kept: string | null, onReadFile: (file: File) => Promise<ChosenContest>) {
  /** What waits for the answer to the question before the kept competition is replaced. */
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [fileMessage, setFileMessage] = useState("");
  /** Goes on at once without a kept competition, else after the question. */
  const replacing = (go: () => void) => (kept === null ? go() : setPending(() => go));
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const chosen = await onReadFile(file);
    // The same file may be chosen again after a change.
    input.value = "";
    setFileMessage(chosen.kind === "refused" ? chosen.message : "");
    if (chosen.kind === "ready") replacing(chosen.go);
  };
  return { pending, setPending, replacing, fileMessage, onFile };
}

/** The setup of a competition: the hill, who takes part, and whether the computer jumpers are watched. */
export function CompetitionSetupScreen({
  hills,
  records,
  settings,
  onChange,
  onStart,
  onBack,
  focusOnEntry,
  kept,
  onReadFile,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const startRef = useRef<HTMLButtonElement>(null);
  const { pending, setPending, replacing, fileMessage, onFile } = useReplacing(kept, onReadFile);
  const ticked = tickedIds(hills, settings.hillIds);
  const schedule = cupSchedule(
    ticked,
    hills.map((h) => h.id),
    settings.doubleCup,
  );
  const scheduled = schedule.flatMap((id) => hills.filter((h) => h.id === id));
  const nobody = participantCount(settings) === 0;
  const noHill = scheduled.length === 0;
  const ready = !nobody && !noHill;
  const start = ready ? () => replacing(() => onStart(scheduled)) : undefined;
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {T.setupTitle}
      </h1>
      <hr className="rule" />
      <HillsChoice hills={hills} records={records} settings={settings} ticked={ticked} onChange={onChange} />
      <section className="settings-group" aria-labelledby="contest-players">
        <h2 className="hill-section-title" id="contest-players">
          {T.players}
        </h2>
        <div className="contest-slots">
          {settings.players.map((on, i) => (
            <Check
              // oxlint-disable-next-line react/no-array-index-key -- the places are fixed, eight of them
              key={i}
              label={T.playerName(i + 1)}
              checked={on}
              onChange={(next) => onChange({ ...settings, players: replaced(settings.players, i, next) })}
            />
          ))}
        </div>
      </section>
      <RivalsChoice settings={settings} onChange={onChange} />
      <DisqualificationChoice
        value={settings.disqualification}
        onChange={(disqualification) => onChange({ ...settings, disqualification })}
      />
      <div className="menu">
        <button
          type="button"
          className="pixel-button"
          aria-disabled={!ready}
          aria-describedby={noHill ? undefined : "contest-summary"}
          onClick={start}
          ref={startRef}
        >
          {T.start}
        </button>
        {pending !== null && kept !== null && (
          <ReplaceQuestion
            kept={kept}
            onYes={() => {
              setPending(null);
              pending();
            }}
            onNo={() => {
              setPending(null);
              startRef.current?.focus();
            }}
          />
        )}
        {!noHill && (
          <p className="note" id="contest-summary">
            {T.summary(schedule.length)}
          </p>
        )}
        {nobody && <p className="note error">{T.nobody}</p>}
        {noHill && <p className="note error">{T.noHill}</p>}
        <label className="pixel-button file-label">
          {T.loadFromFile}
          <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
        </label>
        <p className="note error" role="status">
          {fileMessage}
        </p>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
