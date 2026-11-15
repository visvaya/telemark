import assert from "node:assert/strict";
import { test } from "node:test";

import { DIST_BUDGETS, REQUIRED_PATHS, findDistProblems, formatDistSummary, measureDist } from "./dist-rules.mjs";

const TEXT_HEAD = Uint8Array.from([0x3c, 0x21]);
const MZ_HEAD = Uint8Array.from([0x4d, 0x5a]);

function file(path, gzipBytes = 100, head = TEXT_HEAD, bytes = gzipBytes * 3) {
  return { path, bytes, gzipBytes, head };
}

const BUNDLES = [file("assets/index-DpkSeCJQ.js", 100_000), file("assets/index-DPSjZmzN.css", 8_000)];
const CLEAN_LISTING = [...REQUIRED_PATHS.map((path) => file(path)), ...BUNDLES];
const GENEROUS = {
  JS_GZIP_BUDGET_BYTES: 1_000_000,
  CSS_GZIP_BUDGET_BYTES: 1_000_000,
  SERVICE_WORKER_GZIP_BUDGET_BYTES: 1_000_000,
  ICONS_BUDGET_BYTES: 1_000_000,
};

const without = (path) => CLEAN_LISTING.filter((entry) => entry.path !== path);

test("a clean listing passes", () => {
  assert.deepEqual(findDistProblems(CLEAN_LISTING, DIST_BUDGETS), []);
});

test("an unexpected file is named", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/notes.txt")], DIST_BUDGETS);
  assert.deepEqual(problems, ["not on the allow-list: assets/notes.txt"]);
});

test("a font file is unexpected, because the fonts belong inside the stylesheet", () => {
  const problems = findDistProblems(
    [...CLEAN_LISTING, file("assets/silkscreen-latin-400-normal-CtPo2yA5.woff2")],
    DIST_BUDGETS,
  );
  assert.deepEqual(problems, ["not on the allow-list: assets/silkscreen-latin-400-normal-CtPo2yA5.woff2"]);
});

test("the single-file page does not belong in the package that is deployed", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("telemark.html")], DIST_BUDGETS);
  assert.deepEqual(problems, ["not on the allow-list: telemark.html"]);
});

test("an allowed kind of file outside its place is unexpected", () => {
  const strays = ["extra.js", "assets/plain.js", "data.json", "icons/extra.png", "icon-192.png", "licenses/notes.txt"];
  const problems = findDistProblems([...CLEAN_LISTING, ...strays.map((path) => file(path))], DIST_BUDGETS);
  assert.deepEqual(
    problems,
    strays.map((path) => `not on the allow-list: ${path}`),
  );
});

test("a file with an allowed name in another folder is unexpected", () => {
  const strays = ["assets/sw.js", "icons/manifest.webmanifest", "old/index.html", "assets/_headers"];
  const problems = findDistProblems([...CLEAN_LISTING, ...strays.map((path) => file(path))], DIST_BUDGETS);
  assert.deepEqual(
    problems,
    strays.map((path) => `not on the allow-list: ${path}`),
  );
});

test("every required file is missed by name", () => {
  for (const path of REQUIRED_PATHS) {
    assert.deepEqual(findDistProblems(without(path), GENEROUS), [`missing: ${path}`], path);
  }
});

test("a package without a script or a stylesheet bundle is incomplete", () => {
  assert.deepEqual(findDistProblems(without("assets/index-DpkSeCJQ.js"), GENEROUS), [
    "missing: a hashed .js bundle under assets/",
  ]);
  assert.deepEqual(findDistProblems(without("assets/index-DPSjZmzN.css"), GENEROUS), [
    "missing: a hashed .css bundle under assets/",
  ]);
});

test("a game file in a subdirectory is named", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/deep/down/hill.rpl")], DIST_BUDGETS);
  assert.ok(problems.some((problem) => /game file extension: assets\/deep\/down\/hill\.rpl/.test(problem)));
});

test("every game file extension is refused in any letter case", () => {
  for (const name of [
    "Dsj.EXE",
    "Dsj.Dat",
    "jump.RPL",
    "jump.Trace",
    "k120.HILLTRACE",
    "dsj.exe",
    "jump.trace.gz",
    "hills.hilltrace.GZ",
  ]) {
    const problems = findDistProblems([...CLEAN_LISTING, file(`assets/${name}`)], DIST_BUDGETS);
    assert.equal(problems.includes(`game file extension: assets/${name}`), true, `${name} was not refused`);
  }
});

test("a compressed file that is not a trace is only unexpected", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/index.js.gz")], DIST_BUDGETS);
  assert.deepEqual(problems, ["not on the allow-list: assets/index.js.gz"]);
});

test("an executable with an innocent name is named", () => {
  const problems = findDistProblems([...CLEAN_LISTING, file("assets/index-AAAAAAAA.js", 2, MZ_HEAD)], DIST_BUDGETS);
  assert.deepEqual(problems, ["MZ executable signature: assets/index-AAAAAAAA.js"]);
});

test("an executable under an icon's name is named", () => {
  const listing = [...without("icons/icon-192.png"), file("icons/icon-192.png", 100, MZ_HEAD)];
  assert.deepEqual(findDistProblems(listing, DIST_BUDGETS), ["MZ executable signature: icons/icon-192.png"]);
});

test("a file shorter than the signature is not an executable", () => {
  const shortFile = file("assets/index-AAAAAAAA.css", 1, Uint8Array.of(0x4d));
  const problems = findDistProblems([...CLEAN_LISTING, shortFile], DIST_BUDGETS);
  assert.deepEqual(problems, []);
});

test("JavaScript over its budget is reported with the sum", () => {
  const listing = [...CLEAN_LISTING, file("assets/chunk-BBBBBBBB.js", DIST_BUDGETS.JS_GZIP_BUDGET_BYTES)];
  const problems = findDistProblems(listing, DIST_BUDGETS);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /JavaScript/);
  assert.ok(problems[0].includes(String(100_000 + DIST_BUDGETS.JS_GZIP_BUDGET_BYTES)));
  assert.ok(problems[0].includes(String(DIST_BUDGETS.JS_GZIP_BUDGET_BYTES)));
});

test("CSS over its budget is reported with the sum", () => {
  const problems = findDistProblems(CLEAN_LISTING, { ...GENEROUS, CSS_GZIP_BUDGET_BYTES: 7_999 });
  assert.deepEqual(problems, ["CSS gzip size 8000 bytes exceeds the budget of 7999 bytes"]);
});

test("the service worker has a budget of its own, outside the JavaScript sum", () => {
  const listing = [...without("sw.js"), file("sw.js", 5_000)];
  assert.equal(measureDist(listing).jsGzipBytes, 100_000);
  assert.deepEqual(findDistProblems(listing, { ...GENEROUS, SERVICE_WORKER_GZIP_BUDGET_BYTES: 4_999 }), [
    "Service worker gzip size 5000 bytes exceeds the budget of 4999 bytes",
  ]);
});

test("the icons are budgeted by their stored size", () => {
  const sizes = measureDist(CLEAN_LISTING);
  assert.equal(sizes.iconsBytes, 4 * 300);
  assert.deepEqual(findDistProblems(CLEAN_LISTING, { ...GENEROUS, ICONS_BUDGET_BYTES: 1_199 }), [
    "Icons size 1200 bytes exceeds the budget of 1199 bytes",
  ]);
});

test("a sum equal to its budget passes", () => {
  const sizes = measureDist(CLEAN_LISTING);
  const exact = {
    JS_GZIP_BUDGET_BYTES: sizes.jsGzipBytes,
    CSS_GZIP_BUDGET_BYTES: sizes.cssGzipBytes,
    SERVICE_WORKER_GZIP_BUDGET_BYTES: sizes.serviceWorkerGzipBytes,
    ICONS_BUDGET_BYTES: sizes.iconsBytes,
  };
  assert.deepEqual(findDistProblems(CLEAN_LISTING, exact), []);
});

test("the first visit counts every file the browser gets: text compressed, images as stored", () => {
  const sizes = measureDist(CLEAN_LISTING);
  // Eleven required files of 100 gzip bytes each: the headers file is never served, the four icons count 300 each.
  assert.equal(sizes.offlineTransferBytes, 108_000 + 6 * 100 + 4 * 300);
});

test("the summary gives the file count and every sum against its budget", () => {
  assert.equal(
    formatDistSummary(CLEAN_LISTING, DIST_BUDGETS),
    `13 files; JavaScript gzip 100000 of ${DIST_BUDGETS.JS_GZIP_BUDGET_BYTES} bytes; ` +
      `CSS gzip 8000 of ${DIST_BUDGETS.CSS_GZIP_BUDGET_BYTES} bytes; ` +
      `service worker gzip 100 of ${DIST_BUDGETS.SERVICE_WORKER_GZIP_BUDGET_BYTES} bytes; ` +
      `icons 1200 of ${DIST_BUDGETS.ICONS_BUDGET_BYTES} bytes; first visit transfers 109800 bytes`,
  );
});
