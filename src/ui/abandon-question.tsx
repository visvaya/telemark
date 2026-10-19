import { useEffect, useRef, useState } from "react";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.competition;

/**
 * The way out of a competition: a button, and in its place the question before leaving, as what the competition has
 * so far is not kept. The question takes the focus on its safe answer, so a key pressed by habit does not end the
 * competition; answered no, the focus returns to the button, never to the page's body.
 */
export function AbandonChoice({ label, onAbandon }: { label: string; onAbandon: () => void }) {
  const [asking, setAsking] = useState(false);
  const exitRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const answeredNo = useRef(false);
  useEffect(() => {
    if (asking) noRef.current?.focus();
    else if (answeredNo.current) {
      answeredNo.current = false;
      exitRef.current?.focus();
    }
  }, [asking]);
  if (!asking) {
    return (
      <button type="button" className="pixel-button" onClick={() => setAsking(true)} ref={exitRef}>
        {label}
      </button>
    );
  }
  return (
    <div className="tilt-question" role="group" aria-labelledby="abandon-question-text">
      <p className="note" id="abandon-question-text">
        {T.abandonQuestion}
      </p>
      <button type="button" className="pixel-button" onClick={onAbandon}>
        {T.abandonYes}
      </button>
      <button
        type="button"
        className="pixel-button"
        ref={noRef}
        onClick={() => {
          answeredNo.current = true;
          setAsking(false);
        }}
      >
        {T.abandonNo}
      </button>
    </div>
  );
}
