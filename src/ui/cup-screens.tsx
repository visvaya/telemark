import { useRef } from "react";
import type { Competitor } from "../game/competition";
import type { CompetitionRun } from "../game/competition-run";
import { cupStandings, type CupStandingRow } from "../game/cup";
import { cupPodium, cupRest } from "../game/cup-podium";
import { UI_TEXT } from "../text/ui-text";
import { AbandonChoice } from "./abandon-question";
import { competitorCountry, competitorName, competitorShortName } from "./competition-names";
import { FlagIcon } from "./flag-icon";
import { useEntryFocus } from "./use-entry-focus";

const T = UI_TEXT.competition;
/** The standings table's caption, which describes the way on. */
const STANDINGS_CAPTION_ID = "cup-caption";
/** From this many entrants places take two digits, and their column is wider. */
const MANY_ENTRANTS = 10;

const tableClass = (count: number): string => (count >= MANY_ENTRANTS ? "contest-table contest-many" : "contest-table");

/** A competitor's name with the flag of a computer jumper; the short name where room is short. */
function Who({ competitor, short = false }: { competitor: Competitor | undefined; short?: boolean }) {
  return (
    <span className="contest-who" data-ellipsis="">
      {competitor?.kind === "cpu" && <FlagIcon country={competitorCountry(competitor)} />}
      <span>{short ? competitorShortName(competitor) : competitorName(competitor)}</span>
    </span>
  );
}

const rowClass = (competitor: Competitor | undefined): string =>
  competitor?.kind === "player" ? "contest-row contest-player" : "contest-row";

/** The place on the first row of a tie only, as the original shows shared places. */
function shownPlace(rows: readonly CupStandingRow[], at: number): string {
  const row = rows[at];
  if (row === undefined) return "";
  return rows[at - 1]?.place === row.place ? "" : T.place(row.place);
}

interface StandingsProps {
  run: CompetitionRun;
  onNext: () => void;
  onMenu: () => void;
  focusOnEntry: boolean;
}

/**
 * The cup standings between two competitions: place, competitor, the cup points so far and those of the last
 * competition. The way on starts the next competition; the focus waits on it, so Enter goes through a cup.
 */
export function CupStandingsScreen({ run, onNext, onMenu, focusOnEntry }: StandingsProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEntryFocus(primaryRef, focusOnEntry);
  const { cup } = run;
  const rows = cupStandings(cup);
  const total = cup.schedule.length;
  const nextHill = run.hills[cup.index + 1];
  return (
    <main className="screen">
      <h1 className="screen-title">{T.cupTitle}</h1>
      <hr className="rule" />
      <section className="contest-section">
        <table className={tableClass(rows.length)}>
          <caption id={STANDINGS_CAPTION_ID}>{T.cupAfter(cup.points.length, total)}</caption>
          <thead>
            <tr>
              <th scope="col" className="contest-place">
                <span aria-hidden="true">{T.columns.placeShort}</span>
                <span className="sr-only">{T.columns.place}</span>
              </th>
              <th scope="col">{T.columns.name}</th>
              <th scope="col" className="contest-total">
                {T.cupPoints}
              </th>
              <th scope="col" className="contest-total">
                {T.cupLastPoints}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, at) => {
              const c = cup.entrants[row.entrant];
              return (
                <tr key={row.entrant} className={rowClass(c)}>
                  <td className="contest-place">{shownPlace(rows, at)}</td>
                  <th scope="row" className="contest-name">
                    <Who competitor={c} />
                    {row.place === 1 && <span className="contest-mark">{T.leader}</span>}
                  </th>
                  <td className="contest-total">{row.totalPoints}</td>
                  <td className="contest-total cup-gained">{T.cupGained(row.lastPoints)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="menu">
        <button
          type="button"
          className="pixel-button"
          onClick={onNext}
          ref={primaryRef}
          aria-describedby={STANDINGS_CAPTION_ID}
        >
          {nextHill === undefined
            ? T.toCupStandings
            : T.cupNext(UI_TEXT.hillLabel(nextHill.name, nextHill.kPointM), cup.index + 2, total)}
        </button>
        <AbandonChoice label={T.abandon} onAbandon={onMenu} />
      </div>
    </main>
  );
}

/** The cup drawn in pixels from the gold tokens: a bowl with stepped edges, handles, a stem, a base with a plate. */
function Trophy() {
  return (
    <div className="cup-trophy" aria-hidden="true">
      <span className="cup-trophy-top">
        <span className="cup-trophy-handle" />
        <span className="cup-trophy-bowl" />
        <span className="cup-trophy-handle" />
      </span>
      <span className="cup-trophy-stem" />
      <span className="cup-trophy-base">
        <span className="cup-trophy-plate" />
      </span>
    </div>
  );
}

interface EndProps {
  run: CompetitionRun;
  onAgain: () => void;
  onMenu: () => void;
  focusOnEntry: boolean;
}

/**
 * The end of a cup: the trophy, the podium (laid out 2-1-3, read 1, 2, 3), a band for each player off the podium,
 * the rest of the standings, and a new cup with the same settings or the menu.
 */
export function CupEndScreen({ run, onAgain, onMenu, focusOnEntry }: EndProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEntryFocus(primaryRef, focusOnEntry);
  const { cup } = run;
  const rows = cupStandings(cup);
  const rest = cupRest(rows);
  const players = rest.filter((r) => cup.entrants[r.entrant]?.kind === "player");
  return (
    <main className="screen">
      <header className="contest-header">
        <h1 className="screen-title">{T.cupTitle}</h1>
        <p className="note">{T.cupEndSubtitle(cup.schedule.length)}</p>
      </header>
      <hr className="rule" />
      <Trophy />
      <ol className="cup-podium" aria-label={T.podium}>
        {cupPodium(rows).map((step) => (
          <li key={step.place} className={`cup-step cup-step-${step.place}`}>
            <ul className="cup-step-names">
              {step.rows.map((r) => {
                const c = cup.entrants[r.entrant];
                return (
                  <li key={r.entrant} className={c?.kind === "player" ? "cup-step-who contest-player" : "cup-step-who"}>
                    <span className="sr-only">{T.podiumEntry(step.place, competitorShortName(c), r.totalPoints)}</span>
                    <span aria-hidden="true">
                      <Who competitor={c} short />
                      <span className="cup-step-points">{T.cupPointsText(r.totalPoints)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <span className="cup-step-block" aria-hidden="true">
              {step.place}
            </span>
          </li>
        ))}
      </ol>
      {players.map((r) => (
        <p key={r.entrant} className="cup-player-band">
          <span>{T.playerPlace(competitorName(cup.entrants[r.entrant]), r.place)}</span>
          <span>{T.cupPointsText(r.totalPoints)}</span>
        </p>
      ))}
      {rest.length > 0 && (
        <table className={tableClass(rows.length)}>
          <thead className="sr-only">
            <tr>
              <th scope="col">{T.columns.place}</th>
              <th scope="col">{T.columns.name}</th>
              <th scope="col">{T.cupPoints}</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((r) => {
              const c = cup.entrants[r.entrant];
              return (
                <tr key={r.entrant} className={rowClass(c)}>
                  <td className="contest-place">{shownPlace(rows, rows.indexOf(r))}</td>
                  <th scope="row" className="contest-name">
                    <Who competitor={c} />
                  </th>
                  <td className="contest-total">{T.cupPointsText(r.totalPoints)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="menu">
        <button type="button" className="pixel-button" onClick={onAgain} ref={primaryRef}>
          {T.newCompetitions}
        </button>
        <button type="button" className="pixel-button" onClick={onMenu}>
          {T.menu}
        </button>
      </div>
    </main>
  );
}
