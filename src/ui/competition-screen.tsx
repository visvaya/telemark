import { useRef, useState } from "react";
import { currentJumper, placeOf, type Competitor, type JumpScore } from "../game/competition";
import { boardRows, freshCompetitors } from "../game/competition-board";
import { roundJustEnded, type CompetitionRun } from "../game/competition-run";
import type { HillRecord } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { competitorCountry, competitorName, competitorShortName } from "./competition-names";
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

/** Text with a shorter form for a narrow table: the long one is read out, the short one only shown there. */
function Fitted({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className="contest-long">{long}</span>
      <span className="contest-short" aria-hidden="true">
        {short}
      </span>
    </>
  );
}

/** A row's mark under the name, in its colour; a shorter word where the table has least room. */
function Mark({ kind, long, short }: { kind: "new" | "next"; long: string; short: string }) {
  return (
    <span className={`contest-mark contest-mark-${kind}`}>
      <span className="contest-mark-long">{long}</span>
      <span className="contest-mark-short" aria-hidden="true">
        {short}
      </span>
    </span>
  );
}

/** Points with their unit, kept on one line. */
function Points({ points }: { points: number }) {
  return (
    <>
      {`${formatDecimal(points, 1)} `}
      <Fitted long={T.pointsUnit} short={T.pointsUnitShort} />
    </>
  );
}

/**
 * A jump in its round's cell: the distance over the points, two lines. A fall sets the distance in slanted letters
 * and is read out as a word; a disqualified jump (no distance) says so in place of the distance, in the red the jump
 * view writes it in, over the points it costs (the original adds them to the total).
 */
function JumpCell({ score }: { score: JumpScore | null }) {
  if (score === null) return <td className="contest-jump">{T.noJump}</td>;
  const disqualified = score.distanceM === 0;
  const fell = score.fell && !disqualified;
  return (
    <td className={`contest-jump${fell ? " contest-fell" : ""}${disqualified ? " contest-dq" : ""}`}>
      {disqualified ? (
        <span className="contest-distance">
          <span aria-hidden="true">{T.disqualifiedShort}</span>
          <span className="sr-only">{T.disqualified}</span>
        </span>
      ) : (
        <span className="contest-distance">{T.distance(formatDecimal(score.distanceM, 1))}</span>
      )}
      <span className="contest-points">
        <Points points={score.points} />
        {fell && <span className="sr-only">{`, ${T.fell}`}</span>}
      </span>
    </td>
  );
}

/** The competitor's name: the full one, and the short one that takes its place on a narrow screen. */
function NameCell({ competitor, mark }: { competitor: Competitor | undefined; mark: "new" | "next" | null }) {
  const full = competitorName(competitor);
  const short = competitorShortName(competitor);
  return (
    <th scope="row" className="contest-name">
      {/* Narrow, the name may end in an ellipsis; its full form stays in the row's name for screen readers. */}
      <span className="contest-who" data-ellipsis="">
        {competitor?.kind === "cpu" && <FlagIcon country={competitorCountry(competitor)} />}
        {short === full ? <span>{full}</span> : <Fitted long={full} short={short} />}
      </span>
      {mark === "new" && <Mark kind="new" long={T.newJump} short={T.newJumpShort} />}
      {mark === "next" && <Mark kind="next" long={T.nextJumper} short={T.nextJumperShort} />}
    </th>
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
  const rows = boardRows(state);
  const fresh = freshCompetitors(rows, new Set(run.log.map((j) => j.competitor)));
  return (
    <table className="contest-table">
      <caption>{captionOf(run)}</caption>
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
        {rows.map((row) => {
          const c = state.competitors[row.competitor];
          const mark = row.competitor === next ? "next" : fresh.has(row.competitor) ? "new" : null;
          const classes = ["contest-row", c?.kind === "player" && "contest-player", mark === "next" && "contest-next"];
          return (
            <tr key={row.competitor} className={classes.filter(Boolean).join(" ")}>
              <td className="contest-place">{row.place === null ? "" : T.place(row.place)}</td>
              <NameCell competitor={c} mark={mark} />
              {row.scores.map((s, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- one cell per round, in round order
                <JumpCell key={i} score={s} />
              ))}
              <td className="contest-total">
                {row.totalPoints === null ? T.noJump : <Points points={row.totalPoints} />}
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
  return (
    <main className="screen">
      <header className="contest-header">
        <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
          {T.boardTitle}
        </h1>
        <p className="note">{UI_TEXT.hillLabel(hill.name, hill.kPointM)}</p>
      </header>
      <hr className="rule" />
      <section className="contest-section">
        <Board run={run} />
        <p className="note contest-record">
          {record === undefined ? T.noHillRecord : T.hillRecord(formatDecimal(record.distanceM, 2), record.holder)}
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
