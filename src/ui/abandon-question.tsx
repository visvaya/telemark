import { useEffect, useRef, useState } from "react";
import { UI_TEXT } from "../text/ui-text";

const T = UI_TEXT.competition;

interface Props {
  label: string;
  /** Goes to the menu; the competition stays kept, to be resumed. */
  onLeave: () => void;
  /** Ends the competition: it is no longer kept. */
  onEnd: () => void;
}

/**
 * The way out of a competition: a button, and in its place the question before leaving: to the menu with the
 * competition kept, or the competition ended. The question takes the focus on its safe answer (back), so a key
 * pressed by habit changes nothing; answered so, the focus returns to the button, never to the page's body.
 */
export function AbandonChoice({ label, onLeave, onEnd }: Props) {
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
      <button type="button" className="pixel-button" onClick={onLeave}>
        {T.abandonLeave}
      </button>
      <button type="button" className="pixel-button" onClick={onEnd}>
        {T.abandonEnd}
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
        {T.abandonBack}
      </button>
    </div>
  );
}
