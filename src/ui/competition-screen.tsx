import { useRef } from "react";
import { currentJumper, isDisqualified, placeOf, type Competitor, type JumpScore } from "../game/competition";
import { boardRows } from "../game/competition-board";
import { competitionOf, isCup, roundJustEnded, type CompetitionRun } from "../game/competition-run";
import { keptOf } from "../game/contest-save";
import { cupPhase } from "../game/cup";
import type { HillRecord } from "../storage/save-data";
import { UI_TEXT } from "../text/ui-text";
import { competitorCountry, competitorName, competitorShortName } from "./competition-names";
import { AbandonChoice } from "./abandon-question";
import { ContestFileButton } from "./contest-file-button";
import { FlagIcon } from "./flag-icon";
import { formatDecimal } from "./number-text";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.competition;
/** The table's caption, which describes the board's way on. */
const CAPTION_ID = "contest-caption";
/** From this many competitors places take two digits, and their column is wider. */
const MANY_COMPETITORS = 10;

interface Props {
  run: CompetitionRun;
  /** The hill's record, as kept by the game; absent when the hill has none. */
  record: HillRecord | undefined;
  /** Goes on: the next jump, or the next round. */
  onNext: () => void;
  onAgain: () => void;
  /** After a competition of a cup with more to come: the cup standings. */
  onStandings: () => void;
  /** After the last competition of a cup: the end screen. */
  onEnd: () => void;
  /** After the competitions are over: to the menu, with nothing kept any more. */
  onMenu: () => void;
  /** Out of a competition under way: to the menu with it kept, or ended. */
  onLeave: () => void;
  onFinish: () => void;
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

/** The next jumper's mark under the name; a shorter word where the table has least room. */
function Mark({ long, short }: { long: string; short: string }) {
  return (
    <span className="contest-mark">
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

/** A disqualification where a value would stand: a short word in red, read out in full. */
function Disqualified() {
  return (
    <span className="contest-distance contest-dq-word">
      <span aria-hidden="true">{T.disqualifiedShort}</span>
      <span className="sr-only">{T.disqualified}</span>
    </span>
  );
}

/**
 * A jump in its round's cell: the distance over the points, two lines. A fall sets the distance in slanted letters
 * and is read out as a word; a disqualified jump (no distance) says so in place of the distance, in the red the jump
 * view writes it in, over the points it costs where they count (the original's rule) and alone where it puts the
 * jumper out.
 */
function JumpCell({ score, penalty }: { score: JumpScore | null; penalty: boolean }) {
  if (score === null) return <td className="contest-jump">{T.noJump}</td>;
  const disqualified = isDisqualified(score);
  const fell = score.fell && !disqualified;
  return (
    <td className={fell ? "contest-jump contest-fell" : "contest-jump"}>
      {disqualified ? (
        <Disqualified />
      ) : (
        <span className="contest-distance">{T.distance(formatDecimal(score.distanceM, 1))}</span>
      )}
      {(!disqualified || penalty) && (
        <span className="contest-points">
          <Points points={score.points} />
          {fell && <span className="sr-only">{`, ${T.fell}`}</span>}
        </span>
      )}
    </td>
  );
}

/** The competitor's name: the full one, and the short one that takes its place on a narrow screen. */
function NameCell({ competitor, next }: { competitor: Competitor | undefined; next: boolean }) {
  const full = competitorName(competitor);
  const short = competitorShortName(competitor);
  return (
    <th scope="row" className="contest-name">
      {/* Narrow, the name may end in an ellipsis; its full form stays in the row's name for screen readers. */}
      <span className="contest-who" data-ellipsis="">
        {competitor?.kind === "cpu" && <FlagIcon country={competitorCountry(competitor)} />}
        {short === full ? <span>{full}</span> : <Fitted long={full} short={short} />}
      </span>
      {next && <Mark long={T.nextJumper} short={T.nextJumperShort} />}
    </th>
  );
}

/** What the table is: the start list, the results during or after a round, or the final classification. */
function captionOf(run: CompetitionRun): string {
  const state = competitionOf(run);
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
  const state = competitionOf(run);
  const next = currentJumper(state);
  const rows = boardRows(state);
  return (
    <table className={state.competitors.length >= MANY_COMPETITORS ? "contest-table contest-many" : "contest-table"}>
      <caption id={CAPTION_ID}>{captionOf(run)}</caption>
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
          const classes = ["contest-row", c?.kind === "player" && "contest-player"];
          return (
            <tr key={row.competitor} className={classes.filter(Boolean).join(" ")}>
              <td className="contest-place">{row.place === null ? "" : T.place(row.place)}</td>
              <NameCell competitor={c} next={row.competitor === next} />
              {row.scores.map((s, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- one cell per round, in round order
                <JumpCell key={i} score={s} penalty={state.disqualification === "original"} />
              ))}
              <td className="contest-total">
                {row.out ? <Disqualified /> : row.totalPoints === null ? T.noJump : <Points points={row.totalPoints} />}
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
  const state = competitionOf(run);
  if (roundJustEnded(run)) return T.nextRound(state.round);
  const next = currentJumper(state);
  const name = competitorName(state.competitors[next ?? -1]);
  const place = state.round > 1 && next !== null ? placeOf(state, next) : null;
  return place === null ? T.next(name) : T.nextWithPlace(name, place);
}

/**
 * The board between the jumps of a competition, the results after a round and the final classification. The focus
 * goes to the way on (the next jump or round, or a new competition at the end), so the keyboard goes through a
 * competition with Enter alone; the button is described by the table's caption, which a screen reader says with it.
 */
export function CompetitionScreen({
  run,
  record,
  onNext,
  onAgain,
  onStandings,
  onEnd,
  onMenu,
  onLeave,
  onFinish,
  focusOnEntry,
}: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEntryFocus(primaryRef, focusOnEntry);
  const { hill, cup } = run;
  const state = competitionOf(run);
  const cupNext = cupPhase(cup) === "standings";
  return (
    <main className="screen">
      <header className="contest-header">
        <h1 className="screen-title">{T.boardTitle}</h1>
        <p className="note">{UI_TEXT.hillLabel(hill.name, hill.kPointM)}</p>
        {isCup(run) && <p className="note">{T.competitionOf(cup.index + 1, cup.schedule.length)}</p>}
      </header>
      <hr className="rule" />
      <section className="contest-section">
        <Board run={run} />
        <p className="note contest-record">
          {record === undefined ? T.noHillRecord : T.hillRecord(formatDecimal(record.distanceM, 2), record.holder)}
        </p>
      </section>
      <div className="menu">
        {state.finished && isCup(run) ? (
          <>
            <button
              type="button"
              className="pixel-button"
              onClick={cupNext ? onStandings : onEnd}
              ref={primaryRef}
              aria-describedby={CAPTION_ID}
            >
              {cupNext ? T.toCupStandings : T.toCupEnd}
            </button>
            {/* After the last competition nothing is left to abandon: the way on is the end screen. */}
            {cupNext && <AbandonChoice label={T.abandon} onLeave={onLeave} onEnd={onFinish} />}
          </>
        ) : state.finished ? (
          <>
            <button
              type="button"
              className="pixel-button"
              onClick={onAgain}
              ref={primaryRef}
              aria-describedby={CAPTION_ID}
            >
              {T.repeat}
            </button>
            <button type="button" className="pixel-button" onClick={onMenu}>
              {T.menu}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="pixel-button"
              onClick={onNext}
              ref={primaryRef}
              aria-describedby={CAPTION_ID}
            >
              {nextLabel(run)}
            </button>
            <AbandonChoice label={T.abandon} onLeave={onLeave} onEnd={onFinish} />
          </>
        )}
        <ContestFileButton contest={keptOf(run, "board")} />
      </div>
    </main>
  );
}
