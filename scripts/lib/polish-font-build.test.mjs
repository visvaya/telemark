import assert from "node:assert/strict";
import { test } from "node:test";

import { readBuildRecord } from "./font-build-record.mjs";

const BASE_FONT = "node_modules/@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2";

test("the committed font of Polish letters was built from the Silkscreen, the script and the font tools of today", () => {
  const { written, today } = readBuildRecord("src/ui/fonts/telemark-polish.build.sha256", {});
  assert.deepEqual(Object.keys(written), [
    BASE_FONT,
    "tools/font/make_polish_font.py",
    "src/ui/fonts/telemark-polish.woff2",
    "tools/font/requirements.txt",
  ]);
  assert.deepEqual(
    today,
    written,
    `src/ui/fonts/telemark-polish.woff2 is out of date: run tools/font/make_polish_font.py with ${BASE_FONT} ` +
      "(see the header of that script)",
  );
});
