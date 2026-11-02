// Writes the glyphs of the jump picture's font as JSON for the screens' font generator.
// Usage: node scripts/export-screen-glyphs.mjs <glyphs.json>
//   then: python tools/font/make_screen_font.py <glyphs.json> src/ui/fonts/telemark-screen.woff2
// Run both after a change to src/render/pixel-font.ts; the font and the record of its build are committed.
import { writeFileSync } from "node:fs";

import { exportScreenGlyphs, serializeGlyphs } from "./lib/screen-font-glyphs.mjs";

const [outPath] = process.argv.slice(2);
if (outPath === undefined) {
  console.error("Usage: node scripts/export-screen-glyphs.mjs <glyphs.json>");
  process.exit(2);
}
const glyphs = await exportScreenGlyphs();
writeFileSync(outPath, serializeGlyphs(glyphs), "utf8");
console.log(`${outPath}: ${glyphs.glyphs.length} glyphs`);
