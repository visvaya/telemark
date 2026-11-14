import assert from "node:assert/strict";
import { test } from "node:test";

import { findDocLinkProblems } from "./doc-link-rules.mjs";

const TREE = new Set(["README.md", "docs/testing.md", "docs/screenshot.png", "src/sim", "src/sim/replay.ts", "e2e"]);
const ROOTS = ["docs", "e2e", "scripts", "src"];
const exists = (path) => TREE.has(path);
const check = (file, text) => findDocLinkProblems([{ file, text }], { exists, roots: ROOTS });

test("paths and links that exist pass", () => {
  const text = [
    "The replay is read by `src/sim/replay.ts` and tested in `e2e` and `src/sim`.",
    "See [testing](docs/testing.md) and ![screenshot](docs/screenshot.png).",
  ].join("\n");
  assert.deepEqual(check("README.md", text), []);
});

test("a missing backticked path is named with its file and line", () => {
  assert.deepEqual(check("docs/testing.md", "intro\nThe step lives in `src/sim/jump-step.ts`."), [
    "docs/testing.md:2: `src/sim/jump-step.ts` does not exist",
  ]);
});

test("a link resolves from the directory of the document", () => {
  assert.deepEqual(check("docs/testing.md", "[shot](screenshot.png) and [readme](../README.md)"), []);
  assert.deepEqual(check("docs/testing.md", "[spec](physics-spec.md)"), [
    "docs/testing.md:1: link `physics-spec.md` does not exist",
  ]);
});

test("addresses, anchors, queries and encoded names are handled", () => {
  const text = "[site](https://example.com/x) [mail](mailto:a@b.c) [top](#status) [part](testing.md#lokalnie)";
  assert.deepEqual(check("docs/testing.md", text), []);
  assert.deepEqual(check("README.md", "[gone](docs/old%20name.md?raw=1#top)"), [
    "README.md:1: link `docs/old%20name.md?raw=1#top` does not exist",
  ]);
});

test("a line number or trailing punctuation after a path is not part of it", () => {
  assert.deepEqual(check("README.md", "`src/sim/replay.ts:12`, `src/sim/replay.ts:3-9`; (`src/sim`)."), []);
});

test("tokens outside the repository directories, with spaces or placeholders are not paths", () => {
  const text = [
    "`pnpm build` `dist/` `node_modules/x` `index.html` `src/**/*.test.ts` `e2e/<name>.spec.ts`",
    "`telemark-dist-${sha}` `src/{a,b}.ts` `docs/[id].md`",
  ].join("\n");
  assert.deepEqual(check("README.md", text), []);
});

test("fenced code blocks are skipped", () => {
  const text = ["```sh", "node scripts/missing.mjs `src/missing.ts`", "```", "~~~", "[x](gone.md)", "~~~"].join("\n");
  assert.deepEqual(check("README.md", text), []);
});

test("a fence closes only on a fence of the same character at least as long as the opening one", () => {
  const text = ["````md", "```", "[x](gone.md)", "~~~", "```", "````", "[y](gone.md)"].join("\n");
  assert.deepEqual(check("README.md", text), ["README.md:7: link `gone.md` does not exist"]);
});

test("a link with a title is still checked", () => {
  const text = ['[a](docs/testing.md "T") [b](docs/gone.md "T")', "[c](docs/gone.md 'T') [d](docs/gone.md (T))"];
  assert.deepEqual(check("README.md", text.join("\n")), [
    "README.md:1: link `docs/gone.md` does not exist",
    "README.md:2: link `docs/gone.md` does not exist",
    "README.md:2: link `docs/gone.md` does not exist",
  ]);
  assert.deepEqual(check("README.md", String.raw`[x](docs/gone.md "say \"hi\"") [y](docs/gone.md (a \) b))`), [
    "README.md:1: link `docs/gone.md` does not exist",
    "README.md:1: link `docs/gone.md` does not exist",
  ]);
});

test("a link to a directory may end with a slash", () => {
  assert.deepEqual(check("README.md", "[sim](src/sim/) and [tests](./e2e/)"), []);
  assert.deepEqual(check("README.md", "[scripts](scripts/)"), ["README.md:1: link `scripts/` does not exist"]);
});

test("a link written inside inline code is an example, not a link", () => {
  assert.deepEqual(check("README.md", "Write `[x](missing.md)` for a link."), []);
  assert.deepEqual(check("README.md", "[x]`a`(missing.md)"), []);
  assert.deepEqual(check("README.md", "``a ` [x](missing.md)``"), []);
});

test("backticks without a closing run of the same length are text, and a link after them is checked", () => {
  assert.deepEqual(check("README.md", "` note [x](missing.md) ``"), ["README.md:1: link `missing.md` does not exist"]);
});

test("an escaped backtick opens no code span, a backtick after an escaped backslash does", () => {
  assert.deepEqual(check("README.md", "\\` [x](missing.md) \\`"), ["README.md:1: link `missing.md` does not exist"]);
  assert.deepEqual(check("README.md", "\\\\`[x](missing.md)`"), []);
});

test("problems of several documents keep their order", () => {
  const docs = [
    { file: "README.md", text: "`src/a.ts`" },
    { file: "docs/testing.md", text: "[b](b.md)" },
  ];
  assert.deepEqual(findDocLinkProblems(docs, { exists, roots: ROOTS }), [
    "README.md:1: `src/a.ts` does not exist",
    "docs/testing.md:1: link `b.md` does not exist",
  ]);
});
