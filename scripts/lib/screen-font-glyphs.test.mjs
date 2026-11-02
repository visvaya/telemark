import assert from "node:assert/strict";
import { test } from "node:test";

import { readBuildRecord, sha256 } from "./font-build-record.mjs";
import { exportScreenGlyphs, SCREEN_FONT_RECORD_PATH, serializeGlyphs } from "./screen-font-glyphs.mjs";

test("the committed screens' font was built from the glyphs, the script and the font tools of today", async () => {
  const glyphs = sha256(serializeGlyphs(await exportScreenGlyphs()));
  const { written, today } = readBuildRecord(SCREEN_FONT_RECORD_PATH, { glyphs });
  assert.deepEqual(Object.keys(written), [
    "glyphs",
    "tools/font/make_screen_font.py",
    "src/ui/fonts/telemark-screen.woff2",
    "tools/font/requirements.txt",
  ]);
  assert.deepEqual(
    today,
    written,
    "src/ui/fonts/telemark-screen.woff2 is out of date: run scripts/export-screen-glyphs.mjs and " +
      "tools/font/make_screen_font.py (see the header of tools/font/make_screen_font.py)",
  );
});

test("every exported glyph fills the frame and uses only body, shadow and empty pixels", async () => {
  const { frame, glyphs } = await exportScreenGlyphs();
  assert.ok(glyphs.length > 100);
  for (const { char, rows } of glyphs) {
    assert.equal(rows.length, frame.rows, char);
    for (const row of rows) assert.match(row, new RegExp(`^[#o.]{${frame.width}}$`), char);
  }
});
