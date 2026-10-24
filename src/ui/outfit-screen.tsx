import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { OWN_HILLS } from "../game/hill-choice";
import { OUTFIT_PARTS, type Outfit } from "../game/outfit";
import { previewFlightState } from "../game/outfit-preview";
import { FrameBuffer } from "../render/frame-buffer";
import { drawJumperPreview } from "../render/jump-view";
import { OUTFIT_SWATCHES } from "../render/palette";
import { UI_TEXT } from "../text/ui-text";
import { previewStacked } from "./outfit-layout";
import { useEntryFocus } from "./use-entry-focus";

interface Props {
  outfit: Outfit;
  onChange: (outfit: Outfit) => void;
  onBack: () => void;
  /** Whether the heading takes the keyboard focus when the screen appears. */
  focusOnEntry: boolean;
}

const PREVIEW_WIDTH_PX = 84;
const PREVIEW_HEIGHT_PX = 48;

/**
 * The swatches in two halves that each stay in one row: the colours fill one row when it has room for all of
 * them, and two even rows when not, never leaving a lone swatch in a row of its own.
 */
const SWATCH_HALF = Math.ceil(OUTFIT_SWATCHES.length / 2);
const SWATCHES = OUTFIT_SWATCHES.map((rgb, i) => ({ rgb, i }));
const SWATCH_HALVES = [SWATCHES.slice(0, SWATCH_HALF), SWATCHES.slice(SWATCH_HALF)];

function css([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r} ${g} ${b})`;
}

/**
 * Whether the preview has a line of its own because it does not fit beside the colours. The flex layout decides
 * that from the sizes of both, so it is read from the page after each change of the editor's size, before the
 * browser paints, and the preview never shows in the wrong place.
 */
function usePreviewStacked(
  editorRef: RefObject<HTMLDivElement | null>,
  rowsRef: RefObject<HTMLDivElement | null>,
  previewRef: RefObject<HTMLCanvasElement | null>,
): boolean {
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const rows = rowsRef.current?.getBoundingClientRect();
      const preview = previewRef.current?.getBoundingClientRect();
      if (rows && preview) setStacked(previewStacked(rows, preview));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (editorRef.current) observer.observe(editorRef.current);
    return () => observer.disconnect();
  }, [editorRef, rowsRef, previewRef]);
  return stacked;
}

export function OutfitScreen({ outfit, onChange, onBack, focusOnEntry }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const stacked = usePreviewStacked(editorRef, rowsRef, canvasRef);
  useEntryFocus(headingRef, focusOnEntry);
  const hill = OWN_HILLS[0];
  const flight = useMemo(() => (hill ? previewFlightState(hill) : null), [hill]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !hill || !flight) return;
    const fb = new FrameBuffer(PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX);
    drawJumperPreview(fb, { hill, state: flight, outfit });
    ctx.putImageData(new ImageData(fb.bytes, PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX), 0, 0);
  }, [hill, flight, outfit]);

  return (
    <main className="screen">
      <h1 className="screen-title" tabIndex={-1} ref={headingRef}>
        {UI_TEXT.outfit.title}
      </h1>
      <hr className="rule" />
      <div className={stacked ? "outfit-editor stacked" : "outfit-editor"} ref={editorRef}>
        <div className="outfit-rows" ref={rowsRef}>
          {OUTFIT_PARTS.map((part) => (
            <fieldset key={part} className="outfit-row">
              <legend>{UI_TEXT.outfit.part[part]}</legend>
              <div className="swatches">
                {SWATCH_HALVES.map((half) => (
                  <div key={half[0]?.i} className="swatch-half">
                    {half.map(({ rgb, i }) => {
                      return (
                        <label key={css(rgb)} className="swatch" style={{ background: css(rgb) }}>
                          <input
                            type="radio"
                            className="sr-only"
                            name={`outfit-${part}`}
                            checked={outfit[part] === i}
                            onChange={() => onChange({ ...outfit, [part]: i })}
                          />
                          <span className="sr-only">{UI_TEXT.outfit.swatch[i]}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          className="outfit-preview"
          width={PREVIEW_WIDTH_PX}
          height={PREVIEW_HEIGHT_PX}
          role="img"
          aria-label={UI_TEXT.outfit.preview}
        />
      </div>
      <div>
        <button type="button" className="pixel-button" onClick={onBack}>
          {UI_TEXT.back}
        </button>
      </div>
    </main>
  );
}
