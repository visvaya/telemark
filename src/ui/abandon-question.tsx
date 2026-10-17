import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.competition;

/** Asks before a competition is left: what it has so far is not kept. */
export function AbandonQuestion({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  return (
    <div className="tilt-question" role="group" aria-labelledby="abandon-question-text">
      <p className="note" id="abandon-question-text">
        {T.abandonQuestion}
      </p>
      <button type="button" className="pixel-button" onClick={() => onAnswer(true)}>
        {T.abandonYes}
      </button>
      <button type="button" className="pixel-button" onClick={() => onAnswer(false)}>
        {T.abandonNo}
      </button>
    </div>
  );
}
