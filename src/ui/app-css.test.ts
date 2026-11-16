import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every colour of the screens is a token in the `:root` block of app.css, so a change of the palette is one place.
 * fonts.css is left out: `override-colors` in `@font-palette-values` does not take custom properties.
 */
const STYLESHEET = readFileSync(new URL("app.css", import.meta.url), "utf8");
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/iu;

function outsideRoot(css: string): string {
  const start = css.indexOf(":root {");
  const end = css.indexOf("\n}", start);
  if (start === -1 || end === -1) throw new Error("app.css has no :root block");
  return css.slice(0, start) + css.slice(end);
}

describe("app.css", () => {
  it("names every colour as a token in :root", () => {
    const lines = outsideRoot(STYLESHEET)
      .split("\n")
      .filter((line) => COLOUR_LITERAL.test(line))
      .map((line) => line.trim());
    expect(lines).toEqual([]);
  });
});
