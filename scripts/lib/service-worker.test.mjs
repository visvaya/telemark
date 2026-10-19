// Runs the generated service worker against stand-ins for the browser's cache storage and network, so every
// branch of its life cycle is checked without a browser: what is stored, what is refused, what is left behind.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compileFunction } from "node:vm";

import { CACHE_PREFIX, cacheIdOf, precacheOf, renderServiceWorker, sha256Hex } from "./release-rules.mjs";

const TEMPLATE = readFileSync(new URL("./service-worker-template.js", import.meta.url), "utf8");
const ORIGIN = "https://game.example";
const POLICY = "default-src 'self'";

const RELEASE_A = {
  "/": "<html>a</html>",
  "/assets/index-AAAAAAAA.js": "console.log('a')",
  "/assets/index-AAAAAAAA.css": "body{}",
  "/manifest.webmanifest": "{}",
  "/release.json": '{"sourceSha":"a"}',
};
const RELEASE_B = {
  "/": "<html>b</html>",
  "/assets/index-BBBBBBBB.js": "console.log('b')",
  "/assets/index-AAAAAAAA.css": "body{}",
  "/manifest.webmanifest": "{}",
  "/release.json": '{"sourceSha":"b"}',
};

function precacheFor(release) {
  const files = Object.entries(release).map(([url, body]) => ({
    path: url === "/" ? "index.html" : url.slice(1),
    sha256: sha256Hex(body),
  }));
  return precacheOf(files);
}

const sorted = (names) => [...names].toSorted((a, b) => a.localeCompare(b));

const cacheNameOf = (release) => `${CACHE_PREFIX}${cacheIdOf(precacheFor(release))}`;

// Cache storage as the worker uses it. `failPutAt` makes the n-th write fail, as a full disk would;
// `dropAtPut` removes every cache at the n-th write, as another worker of the game does when it tidies up.
function makeCacheStorage({ failPutAt = Infinity, dropAtPut = Infinity } = {}) {
  const stores = new Map();
  let puts = 0;
  const cacheOf = (name) => ({
    match: (url) => Promise.resolve(stores.get(name)?.get(url)?.clone()),
    put(url, response) {
      puts += 1;
      if (puts >= failPutAt) return Promise.reject(new DOMException("no room", "QuotaExceededError"));
      if (puts === dropAtPut) stores.clear();
      stores.get(name)?.set(url, response);
      return Promise.resolve();
    },
  });
  return {
    stores,
    has: (name) => Promise.resolve(stores.has(name)),
    open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return Promise.resolve(cacheOf(name));
    },
    delete: (name) => Promise.resolve(stores.delete(name)),
    keys: () => Promise.resolve([...stores.keys()]),
    match: (url, options) => Promise.resolve(stores.get(options.cacheName)?.get(url)?.clone()),
  };
}

function basicResponse(body, init) {
  const response = new Response(body, init);
  Object.defineProperty(response, "type", { value: init.type ?? "basic" });
  return response;
}

// The network: `served` maps a path to its body, or to { body, status, type, redirect } to misbehave.
function makeNetwork(served) {
  const calls = [];
  const network = {
    calls,
    served: { ...served },
    offline: false,
    fetch(input, init = {}) {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      calls.push({ path: url.pathname, init });
      if (network.offline) return Promise.reject(new TypeError("Failed to fetch"));
      const entry = network.served[url.pathname];
      if (entry === undefined) return Promise.resolve(basicResponse("", { status: 404 }));
      const described = typeof entry === "string" ? { body: entry } : entry;
      if (described.redirect === true && init.redirect === "error") {
        return Promise.reject(new TypeError("redirected"));
      }
      return Promise.resolve(
        basicResponse(described.body, {
          status: described.status ?? 200,
          type: described.type,
          headers: {
            "Content-Type": "text/plain",
            "Content-Security-Policy": POLICY,
            "Content-Encoding": "gzip",
            "Content-Length": "123",
            Vary: "Accept-Encoding",
          },
        }),
      );
    },
  };
  return network;
}

// Loads the worker of `release` and returns the means to send it events. `registration` is what the worker
// sees of the workers beside it: one that is being stored, one that waits for its turn.
function startWorker(release, { caches, network, registration = { installing: null, waiting: null } }) {
  const handlers = new Map();
  const forbidden = [];
  const scope = {
    location: { origin: ORIGIN },
    registration,
    addEventListener: (type, handler) => handlers.set(type, handler),
    skipWaiting: () => {
      forbidden.push("skipWaiting");
      return Promise.resolve();
    },
    clients: { claim: () => forbidden.push("clients.claim") },
  };
  const source = renderServiceWorker(TEMPLATE, {
    sourceSha: "a".repeat(40),
    contentId: "c".repeat(64),
    precache: precacheFor(release),
  });
  compileFunction(source, ["self", "caches", "fetch"])(scope, caches, network.fetch);

  const lifecycle = async (type) => {
    const pending = [];
    // A worker without a listener for the event has nothing to do at that point.
    handlers.get(type)?.({ waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  };
  return {
    forbidden,
    install: () => lifecycle("install"),
    activate: () => lifecycle("activate"),
    // The response the worker answers with, or null when it leaves the request to the browser; returned once
    // everything the worker started for the request has finished.
    async fetch(path, { method = "GET", mode = "cors", origin = ORIGIN } = {}) {
      let answer = null;
      const pending = [];
      const request = { method, mode, url: `${origin}${path}` };
      handlers.get("fetch")({
        request,
        respondWith: (promise) => {
          answer = promise;
        },
        waitUntil: (promise) => pending.push(promise),
      });
      const response = await Promise.resolve(answer);
      await Promise.all(pending);
      return response;
    },
    async message(data, { withPort = true } = {}) {
      const pending = [];
      let reply = null;
      const port = {
        postMessage: (message) => {
          reply = message;
        },
      };
      handlers.get("message")({ data, ports: withPort ? [port] : [], waitUntil: (promise) => pending.push(promise) });
      await Promise.all(pending);
      return reply;
    },
  };
}

async function installed(release, world) {
  const worker = startWorker(release, world);
  await worker.install();
  return worker;
}

test("install stores every file of the release after checking it", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  await installed(RELEASE_A, world);
  const stored = world.caches.stores.get(cacheNameOf(RELEASE_A));
  assert.deepEqual(sorted(stored.keys()), sorted(Object.keys(RELEASE_A)));
  assert.equal(await stored.get("/").text(), RELEASE_A["/"]);
});

test("install asks the server for every file and accepts no redirect", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  await installed(RELEASE_A, world);
  assert.equal(world.network.calls.length, Object.keys(RELEASE_A).length);
  for (const call of world.network.calls) {
    assert.equal(call.init.cache, "no-cache", call.path);
    assert.equal(call.init.redirect, "error", call.path);
  }
});

test("a stored copy keeps the policy and the type, not the headers of the transfer", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  await installed(RELEASE_A, world);
  const page = world.caches.stores.get(cacheNameOf(RELEASE_A)).get("/");
  assert.equal(page.headers.get("content-security-policy"), POLICY);
  assert.equal(page.headers.get("content-type"), "text/plain");
  for (const name of ["content-encoding", "content-length", "vary"]) assert.equal(page.headers.get(name), null, name);
});

const BROKEN_ANSWERS = [
  { name: "a missing file", answer: undefined, message: /HTTP 404/ },
  { name: "a server error", answer: { body: "oops", status: 500 }, message: /HTTP 500/ },
  { name: "a page in place of the script", answer: "<html>not found</html>", message: /not the file of this release/ },
  {
    name: "a file with one byte more",
    answer: `${RELEASE_A["/assets/index-AAAAAAAA.js"]} `,
    message: /not the file of this release/,
  },
  {
    name: "an answer from another origin",
    answer: { body: RELEASE_A["/assets/index-AAAAAAAA.js"], type: "opaque" },
    message: /same-origin/,
  },
  {
    name: "a redirect",
    answer: { body: RELEASE_A["/assets/index-AAAAAAAA.js"], redirect: true },
    message: /redirected/,
  },
];

for (const { name, answer, message } of BROKEN_ANSWERS) {
  test(`install fails on ${name} and leaves no part of the release`, async () => {
    const network = makeNetwork(RELEASE_A);
    if (answer === undefined) delete network.served["/assets/index-AAAAAAAA.js"];
    else network.served["/assets/index-AAAAAAAA.js"] = answer;
    const world = { caches: makeCacheStorage(), network };
    await assert.rejects(installed(RELEASE_A, world), message);
    assert.deepEqual([...world.caches.stores.keys()], []);
  });
}

test("install fails without a network and leaves nothing", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  world.network.offline = true;
  await assert.rejects(installed(RELEASE_A, world), /Failed to fetch/);
  assert.deepEqual([...world.caches.stores.keys()], []);
});

test("install fails when the device has no room and leaves no part of the release", async () => {
  const world = { caches: makeCacheStorage({ failPutAt: 3 }), network: makeNetwork(RELEASE_A) };
  await assert.rejects(installed(RELEASE_A, world), /no room/);
  assert.deepEqual([...world.caches.stores.keys()], []);
});

test("install fails when its cache is removed while it is being written", async () => {
  const world = { caches: makeCacheStorage({ dropAtPut: 3 }), network: makeNetwork(RELEASE_A) };
  await assert.rejects(installed(RELEASE_A, world), /removed while it was written/);
  assert.deepEqual([...world.caches.stores.keys()], []);
});

test("a failed install of the next release leaves the active one whole and working", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const active = await installed(RELEASE_A, world);
  await active.activate();

  world.network.served = { ...RELEASE_B };
  delete world.network.served["/assets/index-BBBBBBBB.js"];
  await assert.rejects(installed(RELEASE_B, world), /HTTP 404/);

  assert.deepEqual([...world.caches.stores.keys()], [cacheNameOf(RELEASE_A)]);
  world.network.offline = true;
  const page = await active.fetch("/", { mode: "navigate" });
  assert.equal(await page.text(), RELEASE_A["/"]);
  assert.deepEqual(await active.message({ type: "telemark:release" }), {
    type: "telemark:release",
    // A worker rendered without a version says so; a release always renders it (write-release.mjs).
    version: null,
    sourceSha: "a".repeat(40),
    contentId: "c".repeat(64),
    complete: true,
  });
});

test("the next attempt at the same release succeeds once the server is whole", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  delete world.network.served["/manifest.webmanifest"];
  await assert.rejects(installed(RELEASE_A, world));
  world.network.served = { ...RELEASE_A };
  await installed(RELEASE_A, world);
  assert.equal(world.caches.stores.get(cacheNameOf(RELEASE_A)).size, Object.keys(RELEASE_A).length);
});

test("installing a release that is already stored in full fetches nothing and keeps it", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  await installed(RELEASE_A, world);
  const before = world.caches.stores.get(cacheNameOf(RELEASE_A));
  world.network.calls.length = 0;
  world.network.offline = true;
  await installed(RELEASE_A, world);
  assert.equal(world.network.calls.length, 0);
  assert.equal(world.caches.stores.get(cacheNameOf(RELEASE_A)), before);
});

test("a stored release with a file gone is fetched again", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  await installed(RELEASE_A, world);
  world.caches.stores.get(cacheNameOf(RELEASE_A)).delete("/manifest.webmanifest");
  await installed(RELEASE_A, world);
  assert.equal(world.caches.stores.get(cacheNameOf(RELEASE_A)).has("/manifest.webmanifest"), true);
});

// Release A runs, release B is on the server and stored; the worker of B has taken over.
async function afterTakeover() {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const workerA = await installed(RELEASE_A, world);
  await workerA.activate();
  world.caches.stores.set("someone-elses-cache", new Map());
  world.network.served = { ...RELEASE_B };
  const workerB = await installed(RELEASE_B, world);
  await workerB.activate();
  world.network.calls.length = 0;
  return { world, workerA, workerB };
}

const BOTH_RELEASES = sorted([cacheNameOf(RELEASE_A), cacheNameOf(RELEASE_B), "someone-elses-cache"]);

test("taking over removes nothing: the release before stays stored", async () => {
  const { world } = await afterTakeover();
  assert.deepEqual(sorted(world.caches.stores.keys()), BOTH_RELEASES);
});

// What the browser can do right after an update: one more launch gets the page of the outgoing release, and
// then asks the worker that has taken over for that page's script, which the server no longer has.
test("a page of the release before gets its files from that release, not from the network", async () => {
  const { world, workerB } = await afterTakeover();
  for (const path of ["/assets/index-AAAAAAAA.js", "/assets/index-AAAAAAAA.js?v=2"]) {
    const response = await workerB.fetch(path);
    assert.notEqual(response, null, path);
    assert.equal(await response.text(), RELEASE_A["/assets/index-AAAAAAAA.js"], path);
  }
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(sorted(world.caches.stores.keys()), BOTH_RELEASES);
});

test("a file both releases have comes from the release of the worker", async () => {
  const { workerB } = await afterTakeover();
  const response = await workerB.fetch("/release.json");
  assert.equal(await response.text(), RELEASE_B["/release.json"]);
});

test("a path no stored release has goes to the network, and no other owner's cache answers it", async () => {
  const { world, workerB } = await afterTakeover();
  world.caches.stores.get("someone-elses-cache").set("/api/scores", new Response("not the game's"));
  const response = await workerB.fetch("/api/scores");
  assert.equal(response.status, 404);
  assert.deepEqual(
    world.network.calls.map((call) => call.path),
    ["/api/scores"],
  );
});

test("a page is never answered from another release", async () => {
  const { workerB } = await afterTakeover();
  assert.equal(await workerB.fetch("/assets/index-AAAAAAAA.js", { mode: "navigate" }), null);
});

test("the start page of this release removes the other releases and nothing else", async () => {
  const { world, workerB } = await afterTakeover();
  const page = await workerB.fetch("/", { mode: "navigate" });
  assert.equal(await page.text(), RELEASE_B["/"]);
  assert.deepEqual(sorted(world.caches.stores.keys()), sorted([cacheNameOf(RELEASE_B), "someone-elses-cache"]));
  assert.equal(await workerB.fetch("/assets/index-AAAAAAAA.js"), null, "left to the browser from now on");
});

test("only a page that starts removes the other releases, not a request for the same file", async () => {
  const { world, workerB } = await afterTakeover();
  await workerB.fetch("/");
  await workerB.fetch("/manifest.webmanifest", { mode: "navigate" });
  assert.deepEqual(sorted(world.caches.stores.keys()), BOTH_RELEASES);
});

for (const pending of ["installing", "waiting"]) {
  test(`a release that is ${pending} keeps its cache when the running one starts a page`, async () => {
    const registration = { installing: null, waiting: null };
    const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A), registration };
    const workerA = await installed(RELEASE_A, world);
    await workerA.activate();
    world.network.served = { ...RELEASE_B };
    await installed(RELEASE_B, world);
    registration[pending] = {};

    const page = await workerA.fetch("/", { mode: "navigate" });
    assert.equal(await page.text(), RELEASE_A["/"]);
    assert.deepEqual(sorted(world.caches.stores.keys()), sorted([cacheNameOf(RELEASE_A), cacheNameOf(RELEASE_B)]));
  });
}

test("a start page that had to come from the network removes nothing", async () => {
  const { world, workerB } = await afterTakeover();
  world.caches.stores.delete(cacheNameOf(RELEASE_B));
  const page = await workerB.fetch("/", { mode: "navigate" });
  assert.equal(await page.text(), RELEASE_B["/"]);
  assert.deepEqual(sorted(world.caches.stores.keys()), sorted([cacheNameOf(RELEASE_A), "someone-elses-cache"]));
});

test("going back to a release that is still stored fetches nothing and keeps both until its page starts", async () => {
  const { world } = await afterTakeover();
  world.network.served = { ...RELEASE_A };
  world.network.offline = true;
  const back = await installed(RELEASE_A, world);
  await back.activate();
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(sorted(world.caches.stores.keys()), BOTH_RELEASES);
  await back.fetch("/", { mode: "navigate" });
  assert.deepEqual(sorted(world.caches.stores.keys()), sorted([cacheNameOf(RELEASE_A), "someone-elses-cache"]));
});

test("the worker never takes over pages on its own", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  await worker.activate();
  assert.deepEqual(worker.forbidden, []);
});

test("the start page answers the root, its file name and any query, from the stored release", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  world.network.offline = true;
  for (const path of ["/", "/index.html", "/?source=homescreen", "/index.html?x=1"]) {
    const response = await worker.fetch(path, { mode: "navigate" });
    assert.equal(await response.text(), RELEASE_A["/"], path);
  }
});

test("a file of the release is answered from the store, whatever its query", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  world.network.offline = true;
  for (const path of ["/assets/index-AAAAAAAA.js", "/assets/index-AAAAAAAA.js?v=2", "/release.json", "/"]) {
    const response = await worker.fetch(path);
    assert.notEqual(response, null, path);
    assert.equal(await response.text(), RELEASE_A[path.split("?")[0]], path);
  }
  assert.equal(world.caches.stores.get(cacheNameOf(RELEASE_A)).size, Object.keys(RELEASE_A).length);
});

test("requests that are not files of the release are left to the browser", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  // The page of the release has started; nothing but this release is stored.
  await worker.fetch("/", { mode: "navigate" });
  const untouched = [
    { path: "/assets/index-BBBBBBBB.js", options: {} },
    { path: "/sw.js", options: {} },
    { path: "/_headers", options: {} },
    { path: "/api/scores", options: {} },
    { path: "/some/page", options: { mode: "navigate" } },
    { path: "/index.html", options: {} },
    { path: "/", options: { method: "POST" } },
    { path: "/assets/index-AAAAAAAA.js", options: { method: "HEAD" } },
    { path: "/assets/index-AAAAAAAA.js", options: { origin: "https://elsewhere.example" } },
  ];
  for (const { path, options } of untouched) {
    assert.equal(await worker.fetch(path, options), null, `${options.method ?? "GET"} ${path}`);
  }
});

test("requests of another origin or another method are never the worker's, whatever is stored", async () => {
  const { world, workerB } = await afterTakeover();
  const untouched = [
    { path: "/assets/index-AAAAAAAA.js", options: { method: "HEAD" } },
    { path: "/assets/index-AAAAAAAA.js", options: { method: "POST" } },
    { path: "/assets/index-AAAAAAAA.js", options: { origin: "https://elsewhere.example" } },
    { path: "/some/page", options: { mode: "navigate" } },
  ];
  for (const { path, options } of untouched) {
    assert.equal(await workerB.fetch(path, options), null, `${options.method ?? "GET"} ${path}`);
  }
  assert.equal(world.network.calls.length, 0);
});

test("when the browser has dropped the store, the network answers", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  world.caches.stores.clear();
  world.network.calls.length = 0;
  const response = await worker.fetch("/", { mode: "navigate" });
  assert.equal(await response.text(), RELEASE_A["/"]);
  assert.equal(world.network.calls.length, 1);
  assert.deepEqual([...world.caches.stores.keys()], [], "answering does not create an empty store");
});

test("a request the network fails is answered with a network error, never a broken promise", async () => {
  // A reload stops the requests of the page it leaves, and a device can lose its network: the worker then says
  // the load failed as the network would, instead of failing itself (Firefox reports that as a worker's error).
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  world.caches.stores.clear();
  world.network.offline = true;
  for (const [path, mode] of [
    ["/", "navigate"],
    ["/assets/index-AAAAAAAA.js", "cors"],
    ["/not-a-release-file.png", "cors"],
  ]) {
    const response = await worker.fetch(path, { mode });
    assert.equal(response?.type, "error", `${path} answered with a network error`);
  }
});

test("a page learns which release the worker holds and whether all of it is stored", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  assert.equal((await worker.message({ type: "telemark:release" })).complete, true);
  world.caches.stores.get(cacheNameOf(RELEASE_A)).delete("/release.json");
  assert.equal((await worker.message({ type: "telemark:release" })).complete, false);
  world.caches.stores.clear();
  assert.equal((await worker.message({ type: "telemark:release" })).complete, false);
  assert.deepEqual([...world.caches.stores.keys()], [], "asking does not create an empty store");
});

test("other messages get no answer", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  for (const data of [null, undefined, "telemark:release", { type: "something else" }]) {
    assert.equal(await worker.message(data), null);
  }
});

test("a waiting worker takes over when a page asks it to, without answering and without claiming pages", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  for (const withPort of [false, true]) {
    worker.forbidden.length = 0;
    assert.equal(await worker.message({ type: "telemark:take-over" }, { withPort }), null);
    assert.deepEqual(worker.forbidden, ["skipWaiting"]);
  }
});

test("only that message makes the worker take over", async () => {
  const world = { caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) };
  const worker = await installed(RELEASE_A, world);
  for (const data of [null, "telemark:take-over", { type: "telemark:release" }, { type: "take-over" }]) {
    await worker.message(data, { withPort: false });
    await worker.message(data);
  }
  assert.deepEqual(worker.forbidden, []);
});
