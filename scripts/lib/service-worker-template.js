// Service worker of the game: keeps one complete release, so the game starts without a network.
//
// This file is the worker's source. The release step (scripts/write-release.mjs) writes the release into the
// placeholder below and saves the result as sw.js; nothing else is changed.
//
// How a release replaces another:
// - install fetches every file of the release, checks each against its SHA-256 and only then stores them, in a
//   cache of its own. One file that is missing, different or redirected fails the whole install and leaves no
//   part of the release behind; the worker that was active before keeps serving its own release.
// - the new worker then waits. It never takes over a page that an older worker serves (no skipWaiting, no
//   clients.claim): a page always gets its document and its scripts from one release, and a jump is never
//   interrupted. The browser activates the new worker once every window of the game is closed, or sooner
//   when the player asks for it from a menu: the page then sends the one message that makes this worker take
//   over (skipWaiting) and reloads itself once it has. Other open windows are switched to this worker
//   without a reload; they keep running the code they started with.
// - the release before stays stored until a page of this release starts. The browser may answer one more
//   launch with the page of the outgoing release and switch workers under it; that page then asks this worker
//   for its script, which the server no longer has, and gets it from the release it belongs to.
// - the start page of this release, answered from its own cache, removes the caches of other releases, unless
//   a newer release is being stored or waits for its turn: that cache is the one it will answer from. Only
//   caches with this game's prefix are touched; the player's records and files live in localStorage and
//   IndexedDB, which the worker never reads or writes.
const RELEASE = self.TELEMARK_RELEASE_PLACEHOLDER;

const CACHE_NAME = `${RELEASE.cachePrefix}${RELEASE.cacheId}`;
const START_URL = "/";
// The start page under its file name too: the host redirects it to the root, the worker answers both alike.
const START_PATHS = new Set(["/", "/index.html"]);
const KEPT_URLS = new Set(RELEASE.precache.map((entry) => entry.url));
const STORED_COPY = { ignoreSearch: true, ignoreVary: true };
const RELEASE_MESSAGE = "telemark:release";
// Sent by a page whose player asked to install a waiting release now.
const TAKE_OVER_MESSAGE = "telemark:take-over";
// Left out of a stored copy: the body is kept decoded, so these would describe bytes that are not there.
const TRANSPORT_HEADERS = ["content-encoding", "content-length", "vary"];

async function sha256Hex(buffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// One file of the release, as it will be stored, or an error that names what was wrong with it.
async function fetchVerified(entry) {
  // "no-cache": the browser's own cache may answer only after asking the server. "error": a redirect is not
  // the file, wherever it leads.
  const response = await fetch(new URL(entry.url, self.location.origin), {
    cache: "no-cache",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`${entry.url}: HTTP ${response.status}`);
  if (response.type !== "basic") throw new Error(`${entry.url}: not a same-origin response`);
  const body = await response.arrayBuffer();
  if ((await sha256Hex(body)) !== entry.sha256) throw new Error(`${entry.url}: not the file of this release`);
  const headers = new Headers(response.headers);
  for (const name of TRANSPORT_HEADERS) headers.delete(name);
  return new Response(body, { status: 200, headers });
}

async function isComplete() {
  if (!(await caches.has(CACHE_NAME))) return false;
  const cache = await caches.open(CACHE_NAME);
  const found = await Promise.all(RELEASE.precache.map((entry) => cache.match(entry.url)));
  return found.every((response) => response !== undefined);
}

async function install() {
  // The same release installed again (after a rollback, or a retry): what is complete is left alone.
  if ((await isComplete()) === true) return;
  try {
    const responses = await Promise.all(RELEASE.precache.map(fetchVerified));
    // Stored only after every file has arrived and matched.
    const cache = await caches.open(CACHE_NAME);
    for (const [index, entry] of RELEASE.precache.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- one write at a time, so a full disk fails at one known file
      await cache.put(entry.url, responses[index]);
    }
    // Another worker of the game, tidying up meanwhile, removes every cache but its own.
    if ((await isComplete()) !== true) throw new Error("the stored release was removed while it was written");
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

// Set once this release is the only one stored: from then on a path it does not have is left to the browser.
let onlyThisReleaseIsStored = false;

async function otherReleaseCaches() {
  const names = await caches.keys();
  return names.filter((name) => name.startsWith(RELEASE.cachePrefix) && name !== CACHE_NAME);
}

async function removeOtherReleases() {
  if (onlyThisReleaseIsStored) return;
  // A release that is being stored, or waits for its turn, answers from its cache once it takes over. Anything
  // but a plain "none" keeps the caches: one release too many is stored then, and nothing is lost.
  const { installing, waiting } = self.registration;
  if (installing !== null || waiting !== null) return;
  const outdated = await otherReleaseCaches();
  await Promise.all(outdated.map((name) => caches.delete(name)));
  onlyThisReleaseIsStored = true;
}

// The path a request asks for, or null when the request is not the worker's business: another origin or
// another method. Query strings are left out, so they make no copies.
function ownPathOf(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  return url.origin === self.location.origin ? url.pathname : null;
}

// The network's answer, or a network error when the network fails (a reload stops the requests of the page it
// leaves; a device loses its network): the worker answers as the network would, rather than failing itself.
function fromNetwork(request) {
  return fetch(request).catch(() => Response.error());
}

// The stored copy of a file of this release. The browser may drop a cache when the device runs out of room;
// there is no copy then, and the game needs the network again.
function fromThisRelease(keptUrl) {
  return caches.match(keptUrl, { ...STORED_COPY, cacheName: CACHE_NAME });
}

// The stored copy of a file this release does not have, from another release that is still stored.
async function fromOtherRelease(path) {
  const names = await otherReleaseCaches();
  if (names.length === 0) onlyThisReleaseIsStored = true;
  const copies = await Promise.all(names.map((name) => caches.match(path, { ...STORED_COPY, cacheName: name })));
  return copies.find((copy) => copy !== undefined);
}

async function describeRelease() {
  return {
    type: RELEASE_MESSAGE,
    version: RELEASE.version ?? null,
    sourceSha: RELEASE.sourceSha,
    contentId: RELEASE.contentId,
    complete: await isComplete(),
  };
}

self.addEventListener("install", (event) => {
  event.waitUntil(install());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const path = ownPathOf(request);
  if (path === null) return;
  const page = request.mode === "navigate";
  if (page && START_PATHS.has(path)) {
    const start = fromThisRelease(START_URL);
    event.respondWith(start.then((kept) => kept ?? fromNetwork(request)));
    // A page of this release starts: the launch that could still get the page of the release before is over.
    // A removal that fails is tried again with the next page; the answer does not wait for it.
    event.waitUntil(
      start.then((kept) => (kept === undefined ? undefined : removeOtherReleases())).catch(() => undefined),
    );
    return;
  }
  if (KEPT_URLS.has(path)) {
    event.respondWith(fromThisRelease(path).then((kept) => kept ?? fromNetwork(request)));
    return;
  }
  // A page always comes from this release or from the network, never from another release.
  if (page || onlyThisReleaseIsStored) return;
  event.respondWith(fromOtherRelease(path).then((kept) => kept ?? fromNetwork(request)));
});

// A page asks which release this worker holds and whether all of it is stored, or asks a waiting worker to
// take over now. For an active worker the request to take over changes nothing.
self.addEventListener("message", (event) => {
  if (event.data?.type === TAKE_OVER_MESSAGE) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  const port = event.ports.at(0);
  if (port === undefined || event.data?.type !== RELEASE_MESSAGE) return;
  event.waitUntil(
    describeRelease().then((description) => {
      port.postMessage(description);
    }),
  );
});
