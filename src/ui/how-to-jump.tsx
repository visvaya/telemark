import { useRef } from "react";
import { UI_TEXT } from "../text/ui-text";
import { howToJump, type Steering } from "./how-to-jump-text";
import { useEntryFocus } from "./use-entry-focus";
import { TOUCH_QUERY, useMediaQuery } from "./use-media-query";

/** The steps of a jump in the words of one way of steering. */
export function HowToJump({ steering }: { steering: Steering }) {
  return (
    <dl className="how-to">
      {howToJump(steering).map((step) => (
        <div key={step.title} className="how-to-step">
          <dt>{step.title}</dt>
          <dd>{step.text}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Props {
  /** Whether a touch screen is steered by tilting the phone rather than with the zones. */
  tilt: boolean;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

/** The instructions as a screen of their own, opened from the main menu. */
export function HowToScreen({ tilt, onBack, focusOnEntry }: Props) {
  // The instructions speak of what the player has in hand.
  const touch = useMediaQuery(TOUCH_QUERY);
  const steering: Steering = touch ? (tilt ? "tilt" : "touch") : "mouse";
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEntryFocus(headingRef, focusOnEntry);
  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {UI_TEXT.howTo.title}
      </h1>
      <p className="note">{UI_TEXT.howTo.steering(UI_TEXT.howTo.steeringName[steering])}</p>
      <HowToJump steering={steering} />
      <h2 className="hill-section-title">{UI_TEXT.howTo.competitionTitle}</h2>
      <dl className="how-to">
        {UI_TEXT.howTo.competition.map((rule) => (
          <div key={rule.title} className="how-to-step">
            <dt>{rule.title}</dt>
            <dd>{rule.text}</dd>
          </div>
        ))}
      </dl>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
