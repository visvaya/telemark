import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { startStaticServer, type StaticServer } from "../scripts/lib/static-server.mjs";
import { RELEASE_A, RELEASE_B } from "./releases/paths";
import {
  BUILT_IN_HILL_ID,
  builtInHill,
  button,
  leaveJumpForHills,
  openHillList,
  openJump,
  openJumpControls,
  storedSave,
  TEXT,
} from "./support/app";
import { expect, test } from "./support/fixtures";
import { playUntilLanded } from "./support/jump";
import {
  cacheNames,
  checkForUpdate,
  controlled,
  fileSeenBy,
  OFFLINE_NOTE,
  openFileUntil,
  openGame,
  PLANTED_DATA,
  plantPlayerData,
  playerData,
  relaunchUntil,
  requireServiceWorkers,
  scriptOf,
  scriptPathOf,
  sourceShaSeenBy,
  statusSeenBy,
  UPDATE_CHECK,
  workerStates,
} from "./support/pwa";

// Playing without a network, updates and rollbacks. Every test has a server of its own, so it can take the
// network away or put another release under the same address without touching the other tests. A browser
// context is one profile: closing a page and opening another in it is closing the game and launching it again.
//
// The service worker is the same code on every device profile of an engine, so the desktop profiles of the
// three engines cover it.
test.skip(({ traits }) => !traits.desktop, "the service worker is checked once per engine, on the desktop profiles");

// Started for the tests that run; a skipped test has none.
let started: StaticServer | undefined;

test.beforeEach(async () => {
  started = await startStaticServer({ root: RELEASE_A.dir });
});

test.afterEach(async () => {
  await started?.close();
  started = undefined;
});

function testServer(): StaticServer {
  if (!started) throw new Error("The server of the test has not been started");
  return started;
}

const GAME_CACHE = /^telemark-shell-[0-9a-f]{16}$/;
/**
 * What an engine logs when a request gets no answer because the test has taken the network away: the check
 * for a new worker, or the page itself. Only tests that do take it away expect this.
 */
const NO_NETWORK =
  /Failed to load resource: (?:Connection terminated unexpectedly|The network connection was lost|net::ERR_\w+)/;
/** Each engine words the refusal to register a worker whose script is not there in its own way. */
const NO_WORKER_SCRIPT = /bad HTTP response code \(404\)|Failed to load resource.*404|sw\.js/;
const either = (...patterns: RegExp[]): RegExp => new RegExp(patterns.map((pattern) => pattern.source).join("|"));
const gameCaches = (names: readonly string[]): string[] => names.filter((name) => GAME_CACHE.test(name));
/** The releases of the game the browser has stored; the one before goes a moment after a new page has started. */
const storedReleases = async (page: Page): Promise<string[]> => gameCaches(await cacheNames(page));
/** A file of the game that is not its start page. */
const LICENCE_PATH = "/licenses/silkscreen-ofl.txt";

test.describe("without a network", () => {
  test.use({ expectedProblems: NO_NETWORK });

  test("after one visit the game starts and is played without a network", async ({ page, context, traits }) => {
    const server = testServer();
    // A whole jump in real time, perhaps repeated after a fall, on top of two launches of the game.
    test.slow();
    await openGame(page, server.origin);
    await requireServiceWorkers(page);
    await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
    // The page that was open during the first install is not taken over: it keeps the files it started with.
    expect(await controlled(page)).toBe(false);
    await page.close();

    server.setOffline(true);
    const launched = await context.newPage();
    // A query string, as a launch from the home screen may add: the browser's own cache has no such address.
    await openGame(launched, server.origin, "?source=homescreen");
    expect(await controlled(launched)).toBe(true);
    expect(await sourceShaSeenBy(launched)).toBe(RELEASE_A.sourceSha);
    await expect(launched.getByText(OFFLINE_NOTE.ready)).toBeVisible();
    for (const path of ["/manifest.webmanifest", "/icons/icon-192.png", "/licenses/silkscreen-ofl.txt"]) {
      expect(await statusSeenBy(launched, path), path).toBe(200);
    }

    await openHillList(launched, traits);
    await openJump(launched, traits);
    const outcomes = await playUntilLanded(launched, traits);
    expect(outcomes.at(-1)?.kind).toBe("landed");
    await leaveJumpForHills(launched, traits);
    await expect(builtInHill(launched)).toContainText("rekord");

    await launched.reload();
    await expect(launched.getByRole("heading", { name: "Główne menu" })).toBeVisible();
    await openHillList(launched, traits);
    await expect(builtInHill(launched)).toContainText("rekord");
    expect(await storedSave(launched)).toMatchObject({
      records: { [BUILT_IN_HILL_ID]: { distanceM: expect.any(Number) } },
    });
  });

  test("a check for a new release without a network says it could not check", async ({ page, context }) => {
    const server = testServer();
    await openGame(page, server.origin);
    await requireServiceWorkers(page);
    await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
    await page.close();
    const running = await relaunchUntil(context, server.origin, RELEASE_A);

    server.setOffline(true);
    await button(running, UPDATE_CHECK.button).click();
    await expect(running.getByText(UPDATE_CHECK.unreachable)).toBeVisible();
    // Pressed again once the network is back, the check answers.
    server.setOffline(false);
    await button(running, UPDATE_CHECK.button).click();
    await expect(running.getByText(UPDATE_CHECK.latest)).toBeVisible();
  });

  test("a first visit without a network gets no game", async ({ page }) => {
    const server = testServer();
    server.setOffline(true);
    await expect(page.goto(`${server.origin}/`)).rejects.toThrow();
    // The browser asked and got no answer; nothing but the page itself was ever asked for.
    expect(server.requests.every((request) => request.path === "/")).toBe(true);
  });
});

test("a stored release that lost a file is installed again on demand, and the player's data stays", async ({
  page,
  context,
  browserName,
}) => {
  const server = testServer();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();
  const running = await relaunchUntil(context, server.origin, RELEASE_A);
  await plantPlayerData(running);
  // What the browser does to a cache when the device runs short of room: a file of the release is gone.
  const [release] = await storedReleases(running);
  await running.evaluate(
    async ({ name, path }) => {
      await (await caches.open(name)).delete(path);
    },
    { name: release ?? "", path: LICENCE_PATH },
  );
  await running.reload();
  await expect(running.getByText(OFFLINE_NOTE.unavailable)).toBeVisible();
  await expect(running.getByText(OFFLINE_NOTE.incomplete)).toBeVisible();
  await expect(running.getByText(OFFLINE_NOTE.reinstallExplanation)).toBeVisible();

  await button(running, OFFLINE_NOTE.reinstall).click();
  // The page reloads by itself once the release is stored again.
  await expect(running.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await expect(button(running, OFFLINE_NOTE.reinstall)).toHaveCount(0);
  expect(await storedReleases(running)).toHaveLength(1);
  expect(await running.evaluate(async (path) => (await caches.match(path)) !== undefined, LICENCE_PATH)).toBe(true);
  // The save and the game files stay in every engine. A cache that is not the game's stays in Chromium and Firefox;
  // WebKit drops it when the last registration of the origin is removed, though the reinstall deletes only the
  // game's caches (seen in CI, both tries). The game keeps nothing else in the cache storage.
  const expected = browserName === "webkit" ? { ...PLANTED_DATA, foreignCache: null } : PLANTED_DATA;
  expect(await playerData(running)).toEqual(expected);
});

test.describe("when the worker cannot be fetched", () => {
  test.use({ expectedProblems: either(NO_WORKER_SCRIPT, NO_NETWORK) });

  test("the game works online, says so, and the browser's own cache does not make it start offline", async ({
    page,
    context,
  }) => {
    const server = testServer();
    server.setFaults([{ path: "/sw.js", kind: "missing" }]);
    await openGame(page, server.origin);
    await requireServiceWorkers(page);
    await expect(page.getByText(OFFLINE_NOTE.unavailable)).toBeVisible();
    expect(await workerStates(page)).toEqual({ installing: false, waiting: false, active: false });
    await page.close();

    // Every file of the game has been fetched once and sits in the browser's cache; without the worker that
    // is not enough to start.
    server.setOffline(true);
    const launched = await context.newPage();
    await expect(launched.goto(`${server.origin}/`)).rejects.toThrow();
  });
});

test("a new release waits until every window is closed, then takes over and keeps the player's data", async ({
  page,
  context,
}) => {
  const server = testServer();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();

  const first = await relaunchUntil(context, server.origin, RELEASE_A);
  await plantPlayerData(first);
  const second = await context.newPage();
  await openGame(second, server.origin);
  // Set on the page itself: gone if anything reloads it.
  await first.evaluate(() => {
    document.documentElement.dataset["untouched"] = "yes";
  });

  server.setRoot(RELEASE_B.dir);
  expect(await checkForUpdate(first)).toBe("installed");
  for (const window of [first, second]) {
    await expect(window.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
    expect(await sourceShaSeenBy(window)).toBe(RELEASE_A.sourceSha);
  }
  expect(await first.evaluate(() => document.documentElement.dataset["untouched"])).toBe("yes");
  expect(await workerStates(first)).toEqual({ installing: false, waiting: true, active: true });
  expect(gameCaches(await cacheNames(first))).toHaveLength(2);

  // One window closed, the other still open in the background: the old release goes on, also for a new window.
  await first.close();
  const third = await context.newPage();
  await openGame(third, server.origin);
  expect(await sourceShaSeenBy(third)).toBe(RELEASE_A.sourceSha);
  await expect(third.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
  expect(await workerStates(third)).toEqual({ installing: false, waiting: true, active: true });
  // The page that started just now belongs to the running release; the waiting one keeps what it has stored.
  expect(await storedReleases(third)).toHaveLength(2);

  await second.close();
  await third.close();
  const updated = await relaunchUntil(context, server.origin, RELEASE_B);
  await expect(updated.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await expect(updated.getByText(OFFLINE_NOTE.updateWaiting)).toHaveCount(0);
  await expect.poll(() => storedReleases(updated)).toHaveLength(1);
  expect(await playerData(updated)).toEqual(PLANTED_DATA);
});

test("a check with nothing new on the server says the game is up to date", async ({ page, context }) => {
  const server = testServer();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();
  const running = await relaunchUntil(context, server.origin, RELEASE_A);

  // A choice that stands back: a dimmer yellow than the main choices, as bright as they are when pointed at.
  const colourOf = (name: string) => button(running, name).evaluate((element) => getComputedStyle(element).color);
  await running.mouse.move(0, 0);
  expect(await colourOf(UPDATE_CHECK.button)).not.toBe(await colourOf(TEXT.training));
  await button(running, UPDATE_CHECK.button).hover();
  expect(await colourOf(UPDATE_CHECK.button)).toBe(await colourOf(TEXT.training));
  // A sign right after the version, in its line.
  await expect(
    running.locator("p", { hasText: /wersja \d/i }).getByRole("button", { name: UPDATE_CHECK.button }),
  ).toBeVisible();
  await button(running, UPDATE_CHECK.button).click();
  await expect(running.getByText(UPDATE_CHECK.latest)).toBeVisible();
  await expect(running.getByText(OFFLINE_NOTE.updateWaiting)).toHaveCount(0);
  expect(await workerStates(running)).toEqual({ installing: false, waiting: false, active: true });
});

test("a release found on demand installs at once in the window that asks, and other windows go on", async ({
  page,
  context,
  traits,
}) => {
  const server = testServer();
  // Two launches, a check, an install with a reload and a visit to the jump screen.
  test.slow();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();

  const first = await relaunchUntil(context, server.origin, RELEASE_A);
  await plantPlayerData(first);
  const second = await context.newPage();
  await openGame(second, server.origin);
  // Set on the page itself: gone if anything reloads it.
  await second.evaluate(() => {
    document.documentElement.dataset["untouched"] = "yes";
  });

  server.setRoot(RELEASE_B.dir);
  await button(first, UPDATE_CHECK.button).click();
  await expect(first.getByText(UPDATE_CHECK.found)).toBeVisible();
  await expect(first.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
  await expect(first.getByText(UPDATE_CHECK.slowWay)).toBeVisible();
  // Said once: the note says it now, the line beside the button no more.
  await expect(first.getByText(UPDATE_CHECK.found)).toHaveCount(0);
  expect(await workerStates(first)).toEqual({ installing: false, waiting: true, active: true });

  // The menu of a jump says a release waits, but offers no install there: a reload would end the jump.
  await openHillList(second, traits);
  await openJump(second, traits);
  await openJumpControls(second, traits);
  await expect(second.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
  await expect(button(second, UPDATE_CHECK.install)).toHaveCount(0);

  // The page loads again once the new worker is active; nothing is asked of the page while it does.
  const reloaded = first.waitForEvent("load");
  await button(first, UPDATE_CHECK.install).click();
  await reloaded;
  expect(await scriptOf(first)).toBe(scriptPathOf(RELEASE_B));
  await expect(first.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  expect(await controlled(first)).toBe(true);
  expect(await sourceShaSeenBy(first)).toBe(RELEASE_B.sourceSha);
  await expect(first.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await expect(first.getByText(OFFLINE_NOTE.updateWaiting)).toHaveCount(0);
  expect(await playerData(first)).toEqual(PLANTED_DATA);

  // The other window was not reloaded: it still runs the release it started with, now under the new worker,
  // and its jump screen still works. Instead of the waiting release it is told the game was updated elsewhere;
  // the menu of the jump offers no reload, the main menu does.
  expect(await second.evaluate(() => document.documentElement.dataset["untouched"])).toBe("yes");
  expect(await scriptOf(second)).toBe(scriptPathOf(RELEASE_A));
  await expect(second.getByText(OFFLINE_NOTE.updateWaiting)).toHaveCount(0);
  await expect(second.getByText(UPDATE_CHECK.elsewhere)).toBeVisible();
  await expect(button(second, UPDATE_CHECK.reload)).toHaveCount(0);
  await second.getByRole("button", { name: TEXT.toHills }).click();
  await expect(second.getByRole("heading", { name: TEXT.hillListTitle })).toBeVisible();
  await openJump(second, traits);
  await openJumpControls(second, traits);
  await button(second, TEXT.toMainMenu).click();
  await expect(second.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
  await expect(second.getByText(UPDATE_CHECK.elsewhere)).toBeVisible();
  const secondReloaded = second.waitForEvent("load");
  await button(second, UPDATE_CHECK.reload).click();
  await secondReloaded;
  expect(await scriptOf(second)).toBe(scriptPathOf(RELEASE_B));
  await expect(second.getByText(UPDATE_CHECK.elsewhere)).toHaveCount(0);
});

test.describe("when the next release is damaged on the server", () => {
  // The test also takes the network away for a moment, to see the running release start without it.
  test.use({ expectedProblems: NO_NETWORK });

  test("a release that cannot be stored whole leaves the running one as it was", async ({ page, context }) => {
    const server = testServer();
    await openGame(page, server.origin);
    await requireServiceWorkers(page);
    await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
    await page.close();
    const running = await relaunchUntil(context, server.origin, RELEASE_A);
    const cachesBefore = await cacheNames(running);

    server.setRoot(RELEASE_B.dir);
    for (const kind of ["missing", "corrupt"] as const) {
      server.setFaults([{ path: scriptPathOf(RELEASE_B), kind }]);
      expect(await checkForUpdate(running), `a ${kind} script`).toBe("redundant");
      expect(await workerStates(running)).toEqual({ installing: false, waiting: false, active: true });
      expect(await cacheNames(running), "no part of the failed release is kept").toEqual(cachesBefore);
      await expect(running.getByText(OFFLINE_NOTE.updateWaiting)).toHaveCount(0);
      await expect(running.getByText(OFFLINE_NOTE.ready)).toBeVisible();
    }

    // The running release still starts without a network.
    server.setOffline(true);
    await running.reload();
    await expect(running.getByRole("heading", { name: "Główne menu" })).toBeVisible();
    expect(await sourceShaSeenBy(running)).toBe(RELEASE_A.sourceSha);
    server.setOffline(false);

    // The next attempt, with the server whole, stores the release.
    server.setFaults([]);
    expect(await checkForUpdate(running)).toBe("installed");
    await expect(running.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
  });
});

test("a release replaced on the server while it is being stored leaves no part of it", async ({ page, context }) => {
  const server = testServer();
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();
  const running = await relaunchUntil(context, server.origin, RELEASE_A);
  const cachesBefore = await cacheNames(running);

  // The worker of release B arrives; then, at the request for B's script, the server is back on release A,
  // which has no such file.
  server.setRoot(RELEASE_B.dir);
  server.onRequest((request) => {
    if (request.path === scriptPathOf(RELEASE_B)) server.setRoot(RELEASE_A.dir);
  });
  expect(await checkForUpdate(running)).toBe("redundant");
  server.onRequest(null);
  expect(await cacheNames(running)).toEqual(cachesBefore);
  expect(await sourceShaSeenBy(running)).toBe(RELEASE_A.sourceSha);

  // The server settles on release B; the next check stores it.
  server.setRoot(RELEASE_B.dir);
  expect(await checkForUpdate(running)).toBe("installed");
});

test("going back to the earlier release reaches a player who has the newer one, and keeps the data", async ({
  page,
  context,
  browser,
}) => {
  const server = testServer();
  server.setRoot(RELEASE_B.dir);
  await openGame(page, server.origin);
  await requireServiceWorkers(page);
  await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await page.close();
  const newer = await relaunchUntil(context, server.origin, RELEASE_B);
  await plantPlayerData(newer);

  // The host serves release A again. For the player's browser that is one more update.
  server.setRoot(RELEASE_A.dir);
  expect(await checkForUpdate(newer)).toBe("installed");
  await expect(newer.getByText(OFFLINE_NOTE.updateWaiting)).toBeVisible();
  expect(await sourceShaSeenBy(newer)).toBe(RELEASE_B.sourceSha);
  await newer.close();

  const back = await relaunchUntil(context, server.origin, RELEASE_A);
  await expect(back.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  await expect.poll(() => storedReleases(back)).toHaveLength(1);
  expect(await playerData(back)).toEqual(PLANTED_DATA);

  // A player who comes for the first time gets release A too.
  const freshContext = await browser.newContext();
  try {
    const fresh = await freshContext.newPage();
    await openGame(fresh, server.origin);
    expect(await sourceShaSeenBy(fresh)).toBe(RELEASE_A.sourceSha);
  } finally {
    await freshContext.close();
  }
});

test.describe("when a page of the release before is still open", () => {
  // The window that stands in for that page shows a text file. A browser asks for the icon of such a page at
  // /favicon.ico, which the game does not have, and one engine shows the text with a stylesheet of its own,
  // which the policy of the game refuses.
  test.use({ expectedProblems: /Failed to load resource.*404|Refused to apply a stylesheet/ });

  // What a browser can do right after an update: one more launch gets the page of the outgoing release, and the
  // worker of the new release takes over under it. The page then asks that worker for its script, which the
  // server no longer has. Here a window that is not the start page stands in for that page, so the moment does
  // not depend on timing.
  test("after a release has taken over, a page of the one before still gets its files", async ({ page, context }) => {
    const server = testServer();
    server.setRoot(RELEASE_B.dir);
    await openGame(page, server.origin);
    await requireServiceWorkers(page);
    await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
    await page.close();
    const before = await relaunchUntil(context, server.origin, RELEASE_B);

    server.setRoot(RELEASE_A.dir);
    expect(await checkForUpdate(before)).toBe("installed");
    await before.close();

    const script = scriptPathOf(RELEASE_B);
    const askedOfServer = (): number => server.requests.filter((request) => request.path === script).length;
    const aside = await openFileUntil(context, server.origin, LICENCE_PATH, RELEASE_A);
    const askedBefore = askedOfServer();
    const seen = await fileSeenBy(aside, script);
    expect(seen?.status).toBe(200);
    // Compared here, not by the assertion: a mismatch would print both scripts in full.
    const whole = seen?.body === readFileSync(join(RELEASE_B.dir, script), "utf8");
    expect(whole, "the body is the script of the release before").toBe(true);
    expect(askedOfServer(), "the server, which no longer has the file, is not asked").toBe(askedBefore);
    expect(await storedReleases(aside)).toHaveLength(2);

    // A page of the new release starts; the release before is not needed any more.
    const launched = await relaunchUntil(context, server.origin, RELEASE_A);
    await expect.poll(() => storedReleases(launched)).toHaveLength(1);
    await expect(launched.getByText(OFFLINE_NOTE.ready)).toBeVisible();
  });
});

test.describe("when a script of the game cannot be fetched on a first visit", () => {
  // Each engine words the failure of a module script in its own way.
  test.use({ expectedProblems: /Failed to load resource|Loading (?:failed for the )?module|MIME type/ });

  // What a deployment can do to a visitor: the page comes from one release and, a moment later, its script
  // is asked of the next one, which does not have it.
  test("the page says so with a way to load it again, and does not reload itself", async ({ page }) => {
    const server = testServer();
    server.onRequest((request) => {
      if (request.path === scriptPathOf(RELEASE_A)) server.setRoot(RELEASE_B.dir);
    });
    await page.goto(`${server.origin}/`);
    const note = page.getByText(/Telemark: wczytywanie gry\./);
    await expect(note).toBeVisible();
    const again = page.getByRole("link", { name: "wczytaj stronę ponownie" });
    await expect(again).toBeVisible();
    // The note appears after a moment; by then a page that reloaded itself would have asked for itself again.
    expect(server.requests.filter((request) => request.path === "/")).toHaveLength(1);

    await again.click();
    await expect(page.getByRole("heading", { name: "Główne menu" })).toBeVisible();
    await expect(note).toHaveCount(0);
    expect(await sourceShaSeenBy(page)).toBe(RELEASE_B.sourceSha);
  });
});
