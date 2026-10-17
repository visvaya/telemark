import { useRef, useState } from "react";
import { currentJumper, standings } from "../game/competition";
import { roundJustEnded, type CompetitionRun } from "../game/competition-run";
import { UI_TEXT } from "../text/ui-text";
import { competitorCountry, competitorName, jumpText } from "./competition-names";
import { AbandonQuestion } from "./abandon-question";
import { FlagIcon } from "./flag-icon";
import { formatDecimal } from "./number-text";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.competition;

interface Props {
  run: CompetitionRun;
  /** Goes on: the next jump, or the next round. */
  onNext: () => void;
  onAgain: () => void;
  onMenu: () => void;
  focusOnEntry: boolean;
}

/** The classification so far: place, competitor, the jumps of each round and the total. */
function Standings({ run, title }: { run: CompetitionRun; title: string }) {
  const rows = standings(run.state);
  return (
    <section className="contest-section" aria-labelledby="contest-standings">
      <h2 className="hill-section-title" id="contest-standings">
        {title}
      </h2>
      <ol className="contest-table">
        {rows.map((row) => {
          const c = run.state.competitors[row.competitor];
          return (
            <li key={row.competitor} className="contest-row">
              <span className="contest-place">{T.place(row.place)}</span>
              <span className="contest-name">
                {c?.kind === "cpu" && <FlagIcon country={competitorCountry(c)} />}
                {competitorName(c)}
              </span>
              <span className="contest-total">{T.total(formatDecimal(row.totalPoints, 1))}</span>
              <span className="contest-jumps">
                {row.scores.map((s, i) =>
                  s === null ? null : (
                    // oxlint-disable-next-line react/no-array-index-key -- one entry per round, in round order
                    <span key={i} className="contest-jump">
                      {`${T.columns.jump(i + 1)}: ${jumpText(s)}`}
                    </span>
                  ),
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The jumps since the board was last shown: who, how far, the points and the place after the jump. */
function LastJumps({ run }: { run: CompetitionRun }) {
  if (run.log.length === 0) return null;
  return (
    <section className="contest-section" aria-labelledby="contest-last">
      <h2 className="hill-section-title" id="contest-last">
        {T.lastJumps}
      </h2>
      <ul className="contest-log">
        {run.log.map((j) => (
          <li key={`${j.round}-${j.competitor}`}>
            {T.jumpLine(competitorName(run.state.competitors[j.competitor]), jumpText(j.score), j.place)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The board between the jumps of a competition, the results after a round and the final classification. */
export function CompetitionScreen({ run, onNext, onAgain, onMenu, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const [asking, setAsking] = useState(false);
  const { state, hill } = run;
  const next = currentJumper(state);
  const ended = roundJustEnded(run);
  const shownRound = ended && !state.finished ? state.round - 1 : state.round;
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {state.finished ? T.finalTitle : T.boardTitle}
      </h1>
      <p className="note">
        {UI_TEXT.hillLabel(hill.name, hill.kPointM)}
        {state.finished ? "" : ` · ${T.round(shownRound)}`}
      </p>
      <hr className="rule" />
      <LastJumps run={run} />
      {ended && <Standings run={run} title={state.finished ? T.finalTitle : T.afterRound(shownRound)} />}
      <div className="menu">
        {state.finished ? (
          <>
            <button type="button" className="pixel-button" onClick={onAgain}>
              {T.again}
            </button>
            <button type="button" className="pixel-button" onClick={onMenu}>
              {T.menu}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="pixel-button" onClick={onNext}>
              {ended ? T.nextRound(state.round) : T.next(competitorName(state.competitors[next ?? -1]))}
            </button>
            {asking ? (
              <AbandonQuestion onAnswer={(yes) => (yes ? onMenu() : setAsking(false))} />
            ) : (
              <button type="button" className="pixel-button" onClick={() => setAsking(true)}>
                {T.abandon}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
