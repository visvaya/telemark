import { useRef, useState } from "react";
import { currentJumper, placeOf, type JumpScore } from "../game/competition";
import { boardRows } from "../game/competition-board";
import { roundJustEnded, type CompetitionRun } from "../game/competition-run";
import type { HillRecord } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { competitorCountry, competitorName } from "./competition-names";
import { AbandonQuestion } from "./abandon-question";
import { FlagIcon } from "./flag-icon";
import { formatDecimal } from "./number-text";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.competition;

interface Props {
  run: CompetitionRun;
  /** The hill's record, as kept by the game; absent when the hill has none. */
  record: HillRecord | undefined;
  /** Goes on: the next jump, or the next round. */
  onNext: () => void;
  onAgain: () => void;
  onMenu: () => void;
  focusOnEntry: boolean;
}

/** A jump in its round's cell: the distance, and under it the points and a fall when there was one. */
function JumpCell({ score }: { score: JumpScore | null }) {
  if (score === null) return <td className="contest-jump">{T.noJump}</td>;
  return (
    <td className="contest-jump">
      <span className="contest-distance">{T.distance(formatDecimal(score.distanceM, 1))}</span>
      <span className="contest-points">
        {T.points(formatDecimal(score.points, 1))}
        {score.fell ? `, ${T.fell}` : ""}
      </span>
    </td>
  );
}

/** What the table is: the start list, the results during or after a round, or the final classification. */
function captionOf(run: CompetitionRun): string {
  const { state } = run;
  if (state.finished) return T.finalTitle;
  if (roundJustEnded(run)) return T.afterRound(state.round - 1);
  const jumped = state.scores.some((round) => round.some((s) => s !== null));
  return jumped ? T.duringRound(state.round) : T.startList;
}

/**
 * Every competitor in one table: place, name, a column per round and the total; those still to jump below with
 * no place. The jumps since the board was last shown and the next jumper are marked in words, not colour alone.
 */
function Board({ run }: { run: CompetitionRun }) {
  const { state } = run;
  const next = currentJumper(state);
  const fresh = new Set(run.log.map((j) => j.competitor));
  return (
    <table className="contest-table">
      <caption className="hill-section-title">{captionOf(run)}</caption>
      <thead>
        <tr>
          <th scope="col" className="contest-place">
            <span aria-hidden="true">{T.columns.placeShort}</span>
            <span className="sr-only">{T.columns.place}</span>
          </th>
          <th scope="col">{T.columns.name}</th>
          <th scope="col" className="contest-jump">
            {T.columns.jump(1)}
          </th>
          <th scope="col" className="contest-jump">
            {T.columns.jump(2)}
          </th>
          <th scope="col" className="contest-total">
            {T.columns.total}
          </th>
        </tr>
      </thead>
      <tbody>
        {boardRows(state).map((row) => {
          const c = state.competitors[row.competitor];
          const isNew = fresh.has(row.competitor);
          const isNext = row.competitor === next;
          const classes = [
            "contest-row",
            c?.kind === "cpu" ? "contest-cpu" : "contest-player",
            isNew && "contest-new",
            isNext && "contest-next",
          ];
          return (
            <tr key={row.competitor} className={classes.filter(Boolean).join(" ")}>
              <td className="contest-place">{row.place === null ? "" : T.place(row.place)}</td>
              <th scope="row" className="contest-name">
                <span className="contest-who">
                  {c?.kind === "cpu" && <FlagIcon country={competitorCountry(c)} />}
                  {competitorName(c)}
                </span>
                {isNew && <span className="contest-mark">{T.newJump}</span>}
                {isNext && <span className="contest-mark">{T.nextJumper}</span>}
              </th>
              {row.scores.map((s, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- one cell per round, in round order
                <JumpCell key={i} score={s} />
              ))}
              <td className="contest-total">
                {row.totalPoints === null ? T.noJump : formatDecimal(row.totalPoints, 1)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The label of the board's button: the next round, or the next jumper with the place in the second round. */
function nextLabel(run: CompetitionRun): string {
  const { state } = run;
  if (roundJustEnded(run)) return T.nextRound(state.round);
  const next = currentJumper(state);
  const name = competitorName(state.competitors[next ?? -1]);
  const place = state.round > 1 && next !== null ? placeOf(state, next) : null;
  return place === null ? T.next(name) : T.nextWithPlace(name, place);
}

/** The board between the jumps of a competition, the results after a round and the final classification. */
export function CompetitionScreen({ run, record, onNext, onAgain, onMenu, focusOnEntry }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  const [asking, setAsking] = useState(false);
  const { state, hill } = run;
  const ended = roundJustEnded(run);
  const shownRound = ended && !state.finished ? state.round - 1 : state.round;
  return (
    <main className="screen">
      <header className="contest-header">
        <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
          {state.finished ? T.finalTitle : T.boardTitle}
        </h1>
        <p className="note">
          {UI_TEXT.hillLabel(hill.name, hill.kPointM)}
          {state.finished ? "" : ` · ${T.round(shownRound)}`}
        </p>
      </header>
      <hr className="rule" />
      <section className="contest-section">
        <Board run={run} />
        <p className="note contest-record">
          {record === undefined ? T.noHillRecord : T.hillRecord(formatDecimal(record.distanceM, 2))}
        </p>
      </section>
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
              {nextLabel(run)}
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
