// What a release of the game consists of, as pure functions over a listing of the build output.
// A listing entry is { path, sha256 }: the path relative to dist/ with forward slashes and the SHA-256 of
// the file as lowercase hex.
//
// Order of the build (scripts/write-release.mjs): the bundler's output and the files copied next to it are
// the input; from them comes the content identifier, then release.json, then the list of files the service
// worker keeps, then the worker itself. Nothing takes the time of the build, so the same source gives the
// same bytes.
import { createHash } from "node:crypto";

import { parseVersion } from "./version-rules.mjs";

export const RELEASE_FILES = {
  RELEASE_JSON: "release.json",
  SERVICE_WORKER: "sw.js",
  HEADERS: "_headers",
  START_PAGE: "index.html",
  ROBOTS: "robots.txt",
};

// Written by the release step itself, so they are not part of what identifies the content.
const GENERATED_PATHS = new Set([RELEASE_FILES.RELEASE_JSON, RELEASE_FILES.SERVICE_WORKER]);
// Not kept by the service worker: the host never serves `_headers`, a worker does not cache itself, and only
// crawlers read robots.txt, from the network.
const NOT_PRECACHED_PATHS = new Set([RELEASE_FILES.HEADERS, RELEASE_FILES.SERVICE_WORKER, RELEASE_FILES.ROBOTS]);

// The one place in the worker's source that the release is written into.
export const RELEASE_PLACEHOLDER = "self.TELEMARK_RELEASE_PLACEHOLDER";
export const CACHE_PREFIX = "telemark-shell-";
const CACHE_ID_LENGTH_CHARS = 16;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function sha256Hex(content) {
  return createHash("sha256").update(content).digest("hex");
}

function byPath(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

// Identifies what the player gets: the built files, the headers they are served with, the worker's source
// and the configuration of the host, which decides how the files are answered. The commit is not part of it,
// so a commit that changes none of these keeps the identifier.
export function contentIdOf(files, workerTemplate, hostConfiguration) {
  const lines = files
    .filter((file) => !GENERATED_PATHS.has(file.path))
    .toSorted(byPath)
    .map((file) => `${file.sha256}  ${file.path}\n`);
  return sha256Hex(
    [
      ...lines,
      `${sha256Hex(workerTemplate)}  <service worker source>\n`,
      `${sha256Hex(hostConfiguration)}  <host configuration>\n`,
    ].join(""),
  );
}

// The public record of a release. `sourceSha` is the full commit hash the build was made from.
export function releaseJsonText({ version, sourceSha, contentId }) {
  parseVersion(version);
  if (!SOURCE_SHA_PATTERN.test(sourceSha)) throw new Error(`not a full commit hash: "${sourceSha}"`);
  return `${JSON.stringify({ name: "telemark", version, sourceSha, contentId }, null, 2)}\n`;
}

// The address a file is fetched from: the start page is served at the root, and its own name redirects there.
export function urlOfPath(path) {
  return path === RELEASE_FILES.START_PAGE ? "/" : `/${path}`;
}

// The file behind an address, the other way round.
export function pathOfUrl(url) {
  return url === "/" ? RELEASE_FILES.START_PAGE : url.slice(1);
}

// What the service worker keeps: every file the browser can ask for, release.json among them.
export function precacheOf(files) {
  return files
    .filter((file) => !NOT_PRECACHED_PATHS.has(file.path))
    .toSorted(byPath)
    .map((file) => ({ url: urlOfPath(file.path), sha256: file.sha256 }));
}

// Names the worker's cache. It follows the kept files, release.json included, so two releases never share one.
export function cacheIdOf(precache) {
  return sha256Hex(JSON.stringify(precache)).slice(0, CACHE_ID_LENGTH_CHARS);
}

// The worker for one release: its source with the release written into the placeholder.
// The worker of a release, with what it keeps and, when given, the version of the game it holds (the page asks a
// waiting worker for it, to name the release that is about to come).
export function renderServiceWorker(template, { version, sourceSha, contentId, precache }) {
  const parts = template.split(RELEASE_PLACEHOLDER);
  if (parts.length !== 2) {
    throw new Error(`the worker's source must name ${RELEASE_PLACEHOLDER} exactly once, found ${parts.length - 1}`);
  }
  const release = {
    cachePrefix: CACHE_PREFIX,
    cacheId: cacheIdOf(precache),
    ...(version === undefined ? {} : { version }),
    sourceSha,
    contentId,
    precache,
  };
  return parts.join(JSON.stringify(release, null, 2));
}

// Checksums of every file of the package in the format of `sha256sum --check`, `_headers` and the worker included.
export function checksumText(files, directory) {
  return files
    .toSorted(byPath)
    .map((file) => `${file.sha256}  ${directory}/${file.path}\n`)
    .join("");
}
