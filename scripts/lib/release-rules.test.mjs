import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CACHE_PREFIX,
  RELEASE_PLACEHOLDER,
  cacheIdOf,
  checksumText,
  contentIdOf,
  precacheOf,
  releaseJsonText,
  renderServiceWorker,
  sha256Hex,
  urlOfPath,
} from "./release-rules.mjs";

const file = (path, content) => ({ path, sha256: sha256Hex(content) });

const INPUT = [
  file("index.html", "<html>"),
  file("assets/index-AAAAAAAA.js", "js"),
  file("assets/index-BBBBBBBB.css", "css"),
  file("_headers", "/*\n  X-A: b\n"),
  file("manifest.webmanifest", "{}"),
  file("icons/icon-192.png", "png"),
];
const TEMPLATE = `const RELEASE = ${RELEASE_PLACEHOLDER};\n`;
const HOST = '{ "name": "game" }\n';
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

test("the SHA-256 helper gives lowercase hex", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("the content identifier does not depend on the order of the listing", () => {
  assert.equal(contentIdOf(INPUT, TEMPLATE, HOST), contentIdOf(INPUT.toReversed(), TEMPLATE, HOST));
  assert.match(contentIdOf(INPUT, TEMPLATE, HOST), /^[0-9a-f]{64}$/);
});

test("the content identifier follows every input: a file, a name, the headers, the worker, the host", () => {
  const base = contentIdOf(INPUT, TEMPLATE, HOST);
  const changedFile = INPUT.map((entry) => (entry.path === "index.html" ? file("index.html", "<html> ") : entry));
  const renamed = INPUT.map((entry) =>
    entry.path === "assets/index-AAAAAAAA.js" ? { ...entry, path: "assets/index-CCCCCCCC.js" } : entry,
  );
  const changedHeaders = INPUT.map((entry) => (entry.path === "_headers" ? file("_headers", "/*\n  X-A: c\n") : entry));
  assert.notEqual(contentIdOf(changedFile, TEMPLATE, HOST), base);
  assert.notEqual(contentIdOf(renamed, TEMPLATE, HOST), base);
  assert.notEqual(contentIdOf(changedHeaders, TEMPLATE, HOST), base);
  assert.notEqual(contentIdOf(INPUT, `${TEMPLATE}// changed\n`, HOST), base);
  // A change of the host's configuration alone has to be published too.
  assert.notEqual(contentIdOf(INPUT, TEMPLATE, '{ "name": "game", "preview_urls": true }\n'), base);
});

test("the content identifier ignores the files the release step writes itself", () => {
  const withGenerated = [...INPUT, file("release.json", "{}"), file("sw.js", "worker")];
  assert.equal(contentIdOf(withGenerated, TEMPLATE, HOST), contentIdOf(INPUT, TEMPLATE, HOST));
});

test("release.json names the game, its version, the commit and the content", () => {
  const text = releaseJsonText({ version: "0.1.0", sourceSha: SHA_A, contentId: "c".repeat(64) });
  assert.deepEqual(JSON.parse(text), {
    name: "telemark",
    version: "0.1.0",
    sourceSha: SHA_A,
    contentId: "c".repeat(64),
  });
  assert.equal(text.endsWith("}\n"), true);
});

test("release.json refuses anything but a version of three numbers", () => {
  for (const version of [undefined, "", "0.1", "v0.1.0"]) {
    assert.throws(() => releaseJsonText({ version, sourceSha: SHA_A, contentId: "c".repeat(64) }), /not a version/);
  }
});

test("release.json refuses anything but a full commit hash", () => {
  for (const sourceSha of ["", "abc1234", "unknown", "A".repeat(40), `${"a".repeat(40)}\n`]) {
    assert.throws(
      () => releaseJsonText({ version: "0.1.0", sourceSha, contentId: "c".repeat(64) }),
      /not a full commit hash/,
    );
  }
});

test("the start page is fetched from the root, every other file from its own path", () => {
  assert.equal(urlOfPath("index.html"), "/");
  assert.equal(urlOfPath("assets/index-AAAAAAAA.js"), "/assets/index-AAAAAAAA.js");
  assert.equal(urlOfPath("icons/index.html"), "/icons/index.html");
});

test("the worker keeps every file the game can ask for, and not the headers file, robots.txt or itself", () => {
  const files = [...INPUT, file("release.json", "{}"), file("sw.js", "worker"), file("robots.txt", "User-agent: *")];
  assert.deepEqual(
    precacheOf(files).map((entry) => entry.url),
    [
      "/assets/index-AAAAAAAA.js",
      "/assets/index-BBBBBBBB.css",
      "/icons/icon-192.png",
      "/",
      "/manifest.webmanifest",
      "/release.json",
    ],
  );
  assert.equal(precacheOf(files).find((entry) => entry.url === "/")?.sha256, sha256Hex("<html>"));
});

test("the cache identifier changes with any kept file, release.json included", () => {
  const precacheA = precacheOf([...INPUT, file("release.json", SHA_A)]);
  const precacheB = precacheOf([...INPUT, file("release.json", SHA_B)]);
  assert.match(cacheIdOf(precacheA), /^[0-9a-f]{16}$/);
  assert.notEqual(cacheIdOf(precacheA), cacheIdOf(precacheB));
  assert.equal(cacheIdOf(precacheA), cacheIdOf(precacheOf([file("release.json", SHA_A), ...INPUT.toReversed()])));
});

test("the worker is its source with the release written in, and nothing about the worker itself", () => {
  const precache = precacheOf([...INPUT, file("release.json", SHA_A)]);
  const worker = renderServiceWorker(TEMPLATE, { sourceSha: SHA_A, contentId: "c".repeat(64), precache });
  assert.equal(worker.includes(RELEASE_PLACEHOLDER), false);
  const release = JSON.parse(worker.slice(worker.indexOf("{"), worker.lastIndexOf("}") + 1));
  assert.deepEqual(release, {
    cachePrefix: CACHE_PREFIX,
    cacheId: cacheIdOf(precache),
    sourceSha: SHA_A,
    contentId: "c".repeat(64),
    precache,
  });
  assert.equal(
    precache.some((entry) => entry.url === "/sw.js"),
    false,
  );
});

test("the same input gives the same worker, byte for byte", () => {
  const precache = precacheOf([...INPUT, file("release.json", SHA_A)]);
  const release = { sourceSha: SHA_A, contentId: "c".repeat(64), precache };
  assert.equal(renderServiceWorker(TEMPLATE, release), renderServiceWorker(TEMPLATE, release));
  // The version of the game goes in when it is given, for a waiting worker to tell the page.
  assert.match(renderServiceWorker(TEMPLATE, { ...release, version: "0.10.0" }), /"version": "0\.10\.0"/);
  assert.doesNotMatch(renderServiceWorker(TEMPLATE, release), /"version"/);
});

test("a source without the placeholder, or with two, is refused", () => {
  const release = { sourceSha: SHA_A, contentId: "c".repeat(64), precache: [] };
  assert.throws(() => renderServiceWorker("const RELEASE = null;\n", release), /exactly once, found 0/);
  assert.throws(() => renderServiceWorker(`${TEMPLATE}${TEMPLATE}`, release), /exactly once, found 2/);
});

test("the checksum list covers every file, sorted, in the format of sha256sum", () => {
  const files = [file("sw.js", "worker"), file("_headers", "h"), file("index.html", "<html>")];
  assert.equal(
    checksumText(files, "dist"),
    `${sha256Hex("h")}  dist/_headers\n${sha256Hex("<html>")}  dist/index.html\n${sha256Hex("worker")}  dist/sw.js\n`,
  );
});
