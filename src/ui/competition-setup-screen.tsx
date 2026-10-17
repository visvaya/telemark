import { useRef, type ReactNode } from "react";
import {
  CPU_LEVEL_SETTINGS,
  participantCount,
  type CompetitionSettings,
  type CpuLevelSetting,
} from "../game/competition";
import { RIVALS } from "../game/competition-rivals";
import type { HillChoice } from "../game/hill-choice";
import { UI_TEXT } from "../text/ui-text";
import { FlagIcon } from "./flag-icon";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.competition;

interface Props {
  hills: readonly HillChoice[];
  settings: CompetitionSettings;
  onChange: (settings: CompetitionSettings) => void;
  onStart: (hill: HillChoice) => void;
  onBack: () => void;
  focusOnEntry: boolean;
}

/** The hill the settings name, or the first on the list when it is not there (the original's files went). */
function chosenHill(hills: readonly HillChoice[], hillId: string | null): HillChoice | undefined {
  return hills.find((h) => h.id === hillId) ?? hills[0];
}

const replaced = <T,>(list: readonly T[], at: number, value: T): T[] => list.map((v, i) => (i === at ? value : v));

/** A box with its text, framed like the boxes of the settings. */
function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="settings-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** The setup of a competition: the hill, who takes part, and whether the computer jumpers are watched. */
export function CompetitionSetupScreen({ hills, settings, onChange, onStart, onBack, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const hill = chosenHill(hills, settings.hillId);
  const start = hill !== undefined && participantCount(settings) > 0 ? () => onStart(hill) : undefined;
  const ready = start !== undefined;
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {T.setupTitle}
      </h1>
      <hr className="rule" />
      <section className="settings-group" aria-labelledby="contest-hill">
        <h2 className="hill-section-title" id="contest-hill">
          {T.hill}
        </h2>
        <select
          className="pixel-select"
          aria-labelledby="contest-hill"
          value={hill?.id ?? ""}
          onChange={(e) => onChange({ ...settings, hillId: e.currentTarget.value })}
        >
          {hills.map((h) => (
            <option key={h.id} value={h.id}>
              {UI_TEXT.hillLabel(h.name, h.kPointM)}
            </option>
          ))}
        </select>
      </section>
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
      <section className="settings-group" aria-labelledby="contest-cpus">
        <h2 className="hill-section-title" id="contest-cpus">
          {T.cpus}
        </h2>
        <ul className="contest-rivals">
          {settings.cpus.map((cpu, i) => {
            const rival = RIVALS[i];
            if (!rival) return null;
            return (
              <li key={rival.name} className="contest-rival">
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
      <div className="menu">
        <button type="button" className="pixel-button" aria-disabled={!ready} onClick={start}>
          {T.start}
        </button>
        {!ready && <p className="note error">{T.nobody}</p>}
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
