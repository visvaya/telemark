/** The top and bottom edges of a box on the page, in CSS pixels. */
interface VerticalSpan {
  top: number;
  bottom: number;
}

/**
 * Whether the preview of the outfit has a line of its own instead of standing beside the colours: then it shares
 * no height with them. Beside them it starts a little lower than their top, so the tops alone do not tell.
 */
export function previewStacked(rows: VerticalSpan, preview: VerticalSpan): boolean {
  return preview.top >= rows.bottom || preview.bottom <= rows.top;
}
