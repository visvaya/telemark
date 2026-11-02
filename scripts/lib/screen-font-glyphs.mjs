// The glyphs of the screens' font ("Telemark Screen"), exported from the jump picture's own font
// (src/render/pixel-font.ts), so the menus and the picture share one drawing of every letter.
//
// tools/font/make_screen_font.py builds the web font from this export and writes the record of the build next to
// the font; a test compares it with a fresh export, so the committed font cannot drift from the picture's glyphs
// unnoticed.
import { loadTypeScript } from "./load-typescript.mjs";

export const SCREEN_FONT_RECORD_PATH = "src/ui/fonts/telemark-screen.build.sha256";

// { frame, glyphs: [{ char, rows }] }: `rows` from the frame's top, `#` body, `o` shadow, `.` empty.
export async function exportScreenGlyphs() {
  const { GLYPH_FRAME, fontCharacters, glyphPixels } = await loadTypeScript("src/render/pixel-font.ts");
  return {
    frame: { ...GLYPH_FRAME },
    glyphs: fontCharacters().map((char) => ({ char, rows: glyphPixels(char) })),
  };
}

// The exact text written to the export file, which the record holds the digest of.
export const serializeGlyphs = (glyphs) => `${JSON.stringify(glyphs, null, 2)}\n`;
