import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import type { TestRelease } from "../releases/paths";
import { TEXT } from "./app";
import { expect, test } from "./fixtures";
import { asSet, setPatternSource } from "./typeset-text";

/** What the menu says about playing without a network and about a waiting release (src/text/ui-text.ts). */
export const OFFLINE_NOTE = {
  ready: "Gotowe do gry bez internetu.",
  unavailable: "Gra bez internetu nie jest jeszcze gotowa.",
  /** Part of the stored release is missing, and the button that installs the game again. */
  incomplete: /^Części plików gry brakuje w pamięci przeglądarki/,
  reinstall: "Zainstaluj grę od nowa",
  reinstallExplanation: "Strona przeładuje się. Zapis, rekordy, powtórki i pliki gry zostaną.",
  /**
   * With the version the waiting worker names: both test releases are built with one. The main menu says it
   * short, beside its install button; the menu of a jump says it with the way to get it.
   */
  updateWaiting: new RegExp(
    `^Jest nowa wersja gry: \\d+\\.\\d+\\.\\d+\\.(?: ${setPatternSource("Zamknij grę całkowicie")}|$)`,
  ),
} as const;

/** The check for a new release in the main menu, what it says, and the button that installs a waiting one. */
export const UPDATE_CHECK = {
  button: "Szukaj aktualizacji",
  latest: "Masz najnowszą wersję.",
  found: "Jest nowa wersja gry. Pobieram ją.",
  unreachable: "Brak połączenia: nie można sprawdzić.",
  install: "Zainstaluj teraz",
  slowWay: asSet("Albo zamknij wszystkie okna gry i uruchom ją ponownie."),
  elsewhere: asSet("Gra zaktualizowała się w innym oknie: przeładuj, żeby jej używać."),
  reload: "Przeładuj",
} as const;

const SAVE_KEY = "telemark.save";
/** A cache that is not the game's: an update or a rollback must leave it alone. */
const FOREIGN_CACHE = "someone-elses-cache";
const FOREIGN_KEY = "someone-elses-key";
/** Where the game keeps the player's files (src/storage/game-files-store.ts), and a record of the test's own. */
const FILES_DB = "telemark";
const FILES_STORE = "files";
const FILES_TEST_KEY = "test-record";
const REOPEN_LIMIT = 15;
const REOPEN_WAIT_MS = 200;

/**
 * A save as the game writes it, with a record on the built-in hill and settings that differ from the defaults.
 * The tests of updates plant it and compare it afterwards, character for character.
 */
const PLANTED_SAVE = JSON.stringify({
  schemaVersion: 2,
  records: { "own-3": { distanceM: 87.5, points: 101.5, dateIso: "2026-01-01T12:00:00.000Z" } },
  settings: { leanControl: "drag", vibration: false, scenery: "night", sound: false },
});

/** Opens the game at a server of the test's own and waits for the menu. */
export async function openGame(page: Page, origin: string, query = ""): Promise<void> {
  await page.goto(`${origin}/${query}`);
  await expect(page.getByRole("heading", { name: TEXT.menuHeading })).toBeVisible();
}

/**
 * Skips the test where the browser has no service workers at all; the skip names the reason in the report.
 * Not in CI: every engine there is expected to have them, and an engine that silently dropped out of these
 * tests would look like one that passed them.
 */
export async function requireServiceWorkers(page: Page): Promise<void> {
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  if (process.env["CI"] !== undefined) expect(supported, "the browser has service workers").toBe(true);
  test.skip(!supported, "this browser build has no service workers");
}

/** Whether a service worker answers for the page. The first page of a first visit is never taken over. */
export const controlled = (page: Page): Promise<boolean> =>
  page.evaluate(() => navigator.serviceWorker.controller !== null);

/** The commit of the release the page gets its files from: the worker's when one answers, else the server's. */
export function sourceShaSeenBy(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch("/release.json", { cache: "no-store" });
    const release: unknown = await response.json();
    const sourceSha: unknown = typeof release === "object" && release !== null ? Reflect.get(release, "sourceSha") : "";
    return typeof sourceSha === "string" ? sourceSha : "";
  });
}

/** What the page gets for a path: the HTTP status and the body as text, or null when the request fails. */
export function fileSeenBy(page: Page, path: string): Promise<{ status: number; body: string } | null> {
  return page.evaluate(
    (target) =>
      fetch(target).then(
        async (response) => ({ status: response.status, body: await response.text() }),
        () => null,
      ),
    path,
  );
}

/** The HTTP status the page gets for a path, or null when the request fails altogether. */
export function statusSeenBy(page: Page, path: string): Promise<number | null> {
  return page.evaluate(
    (target) =>
      fetch(target).then(
        (response) => response.status,
        () => null,
      ),
    path,
  );
}

export interface WorkerStates {
  installing: boolean;
  waiting: boolean;
  active: boolean;
}

export function workerStates(page: Page): Promise<WorkerStates> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      installing: Boolean(registration?.installing),
      waiting: Boolean(registration?.waiting),
      active: Boolean(registration?.active),
    };
  });
}

/**
 * Makes the browser look for a new release and waits for what becomes of it: "installed" when it is stored
 * and waiting, "redundant" when it could not be stored, "none" when the server has nothing new.
 */
export function checkForUpdate(page: Page): Promise<"installed" | "redundant" | "none"> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error("The page has no service worker registration");
    // Engines differ in whether the new worker is announced before or after the check itself reports back.
    const announced = new Promise<ServiceWorker | null>((resolve) => {
      registration.addEventListener("updatefound", () => resolve(registration.installing), { once: true });
    });
    const quiet = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 1000);
    });
    await registration.update();
    const worker = registration.installing ?? (await Promise.race([announced, quiet]));
    if (worker === null) return "none";
    return new Promise<"installed" | "redundant">((resolve) => {
      const settle = () => {
        if (worker.state === "installed" || worker.state === "redundant") resolve(worker.state);
      };
      worker.addEventListener("statechange", settle);
      settle();
    });
  });
}

export const cacheNames = (page: Page): Promise<string[]> =>
  page.evaluate(async () => (await caches.keys()).toSorted());

/** Puts a save, a record in the game's database and a cache of another owner into the page's storage. */
export async function plantPlayerData(page: Page): Promise<void> {
  await page.evaluate(
    async ({ saveKey, save, cacheName, cacheKey, dbName, storeName, recordKey }) => {
      localStorage.setItem(saveKey, save);
      const cache = await caches.open(cacheName);
      await cache.put(cacheKey, new Response("kept"));
      await new Promise<void>((resolve, reject) => {
        // The game has opened its database by now, so opening it here does not create it without its store.
        const open = indexedDB.open(dbName);
        open.addEventListener("error", () => reject(new Error("The database of the game files did not open")));
        open.addEventListener("success", () => {
          const db = open.result;
          const write = db.transaction(storeName, "readwrite").objectStore(storeName).put("kept", recordKey);
          write.addEventListener("error", () => reject(new Error("The record could not be written")));
          write.addEventListener("success", () => {
            db.close();
            resolve();
          });
        });
      });
    },
    {
      saveKey: SAVE_KEY,
      save: PLANTED_SAVE,
      cacheName: FOREIGN_CACHE,
      cacheKey: FOREIGN_KEY,
      dbName: FILES_DB,
      storeName: FILES_STORE,
      recordKey: FILES_TEST_KEY,
    },
  );
}

export interface PlayerData {
  /** The save exactly as stored. */
  save: string | null;
  /** The test's record in the database of the game files. */
  filesRecord: unknown;
  /** Content of the cache that is not the game's. */
  foreignCache: string | null;
}

export function playerData(page: Page): Promise<PlayerData> {
  return page.evaluate(
    async ({ saveKey, cacheName, cacheKey, dbName, storeName, recordKey }) => {
      const kept = (await caches.has(cacheName)) ? await (await caches.open(cacheName)).match(cacheKey) : undefined;
      const filesRecord = await new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.addEventListener("error", () => reject(new Error("The database of the game files did not open")));
        open.addEventListener("success", () => {
          const db = open.result;
          const read = db.transaction(storeName, "readonly").objectStore(storeName).get(recordKey);
          read.addEventListener("error", () => reject(new Error("The record could not be read")));
          read.addEventListener("success", () => {
            const record: unknown = read.result;
            db.close();
            resolve(record);
          });
        });
      });
      return {
        save: localStorage.getItem(saveKey),
        filesRecord,
        foreignCache: kept ? await kept.text() : null,
      };
    },
    {
      saveKey: SAVE_KEY,
      cacheName: FOREIGN_CACHE,
      cacheKey: FOREIGN_KEY,
      dbName: FILES_DB,
      storeName: FILES_STORE,
      recordKey: FILES_TEST_KEY,
    },
  );
}

/** What `playerData` returns after `plantPlayerData`, as long as nothing has touched the player's storage. */
export const PLANTED_DATA: PlayerData = { save: PLANTED_SAVE, filesRecord: "kept", foreignCache: "kept" };

/** Path of the script the page was started with. */
export const scriptOf = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.querySelector("script[src]")?.getAttribute("src") ?? null);

/** Opens a window, again and again, until `arrived` says the window is the one that was wanted. */
async function reopenUntil(
  context: BrowserContext,
  release: TestRelease,
  arrived: (page: Page) => Promise<boolean>,
): Promise<Page> {
  for (let attempt = 0; attempt < REOPEN_LIMIT; attempt++) {
    const page = await context.newPage();
    if (await arrived(page)) return page;
    await page.close();
    await new Promise((resolve) => {
      setTimeout(resolve, REOPEN_WAIT_MS);
    });
  }
  throw new Error(`The release ${release.sourceSha} did not take over after ${REOPEN_LIMIT} launches`);
}

/**
 * Launches the game again, as a player does after closing every window of it, until the given release is the
 * one that runs: its worker answers and the page itself was started from its files.
 *
 * A waiting worker takes over once no window is left; the browser does that a moment after the last one
 * closes. A launch in that moment may still be started from the old release, even while the new worker is
 * already the one that answers afterwards; such a launch is closed and repeated, as a player's next one is.
 */
export function relaunchUntil(context: BrowserContext, origin: string, release: TestRelease): Promise<Page> {
  return reopenUntil(context, release, async (page) => {
    await openGame(page, origin);
    return (
      (await controlled(page)) &&
      (await sourceShaSeenBy(page)) === release.sourceSha &&
      (await scriptOf(page)) === scriptPathOf(release)
    );
  });
}

/**
 * Opens a file of the game that is not its start page, in a window of its own, until the worker of the given
 * release is the one that answers for that window. No page of the release has started by then: the window
 * stands where a page of the release before stands when the browser switches workers under it.
 */
export function openFileUntil(
  context: BrowserContext,
  origin: string,
  path: string,
  release: TestRelease,
): Promise<Page> {
  return reopenUntil(context, release, async (page) => {
    await page.goto(`${origin}${path}`);
    return (await controlled(page)) && (await sourceShaSeenBy(page)) === release.sourceSha;
  });
}

/** Path of the script the release's page loads, for example "/assets/index-abc.js". */
export function scriptPathOf(release: TestRelease): string {
  const page = readFileSync(join(release.dir, "index.html"), "utf8");
  const path = /src="(\/assets\/[^"]+\.js)"/.exec(page)?.[1];
  if (path === undefined) throw new Error("The page of the release names no script");
  return path;
}
