import { describe, expect, it } from "vitest";
import { previewStacked } from "./outfit-layout";

const rows = { top: 100, bottom: 500 };

describe("previewStacked", () => {
  it("is false while the preview stands beside the colours, also lower than their top", () => {
    expect(previewStacked(rows, { top: 130, bottom: 330 })).toBe(false);
    expect(previewStacked(rows, { top: 100, bottom: 300 })).toBe(false);
  });

  it("is true when the preview has a line of its own, under the colours or above them", () => {
    expect(previewStacked(rows, { top: 524, bottom: 724 })).toBe(true);
    expect(previewStacked(rows, { top: 500, bottom: 700 })).toBe(true);
    expect(previewStacked(rows, { top: -124, bottom: 76 })).toBe(true);
    expect(previewStacked(rows, { top: -100, bottom: 100 })).toBe(true);
  });
});
