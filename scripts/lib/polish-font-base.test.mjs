import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const BASE_FONT = "node_modules/@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2";
const DIGEST = "tools/font/telemark-polish.base.sha256";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url));

test("the committed font of Polish letters was built from the Silkscreen installed now", () => {
  const fresh = createHash("sha256").update(read(BASE_FONT)).digest("hex");
  assert.equal(
    fresh,
    read(DIGEST).toString("utf8").trim(),
    "src/ui/fonts/telemark-polish.woff2 is out of date: run tools/font/make_polish_font.py with " +
      `${BASE_FONT} (see the header of that script)`,
  );
});
