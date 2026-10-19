import type { Browser } from "@playwright/test";
import { startStaticServer, type ServedRequest, type StaticServer } from "../scripts/lib/static-server.mjs";
import { DIST_DIR } from "./releases/paths";
import { expect, test } from "./support/fixtures";
import { reportMeasurement } from "./support/measurement-log";
import { OFFLINE_NOTE, openGame, requireServiceWorkers } from "./support/pwa";

// What a browser really fetches on a first visit: how many requests and how many bytes until the first screen
// is there, and until the game is stored for playing without a network. The sizes of the files in dist/ are
// checked elsewhere (scripts/check-dist.mjs); this counts what goes over the wire, and whether anything goes
// twice.
//
// The service worker and the page are the same on every device profile of an engine, so the desktop profiles
// of the three engines cover it.
test.skip(({ traits }) => !traits.desktop, "the first visit is measured once per engine, on the desktop profiles");

/**
 * Measured 2026-10-13: in Microsoft Edge 155 on a laptop and, the same day, in the Chromium, Firefox and WebKit
 * of the browser tests on the CI runner. Chromium gave the same numbers in both places.
 *
 * - Chromium: 4 requests and 127 540 bytes until the first screen (the page, its script, its stylesheet and one
 *   icon); 15 requests and 142 275 bytes until the game is stored, four of them answered 304 without a body,
 *   because the worker asks again for what the page has just fetched and the browser's cache answers.
 * - Firefox: 5 requests (a second icon) and 128 679 bytes; then 16 requests and 142 275 bytes, five answered 304.
 * - WebKit: 4 requests (the manifest instead of an icon) and 126 565 bytes; then 15 requests and 268 840 bytes,
 *   none answered 304. Its cache does not answer the worker, so the page, the manifest, the script and the
 *   stylesheet go out whole a second time: 126 565 bytes more.
 *
 * Measured again 2026-10-15 in Microsoft Edge on the laptop, after the replays (shelf, export to files of the
 * original) had grown the script: Chromium 147 572 bytes until the first screen and 162 317 bytes until the game is
 * stored (145 096 and 159 837 before the last change of that day).
 *
 * Measured again 2026-10-16 in the browser tests on the CI runner, after the jump scene, the font of the screens
 * and tilt steering had grown the script and the stylesheet: Chromium 168 685 bytes until the first screen and
 * 185 229 bytes until the game is stored; Firefox 170 247 bytes until the first screen (its second icon).
 *
 * Measured again 2026-10-19 in the browser tests on the CI runner, after the World Cup and the competitions kept
 * between visits and in a file had grown the script: Chromium 192 695 bytes until the first screen and 209 662
 * bytes until the game is stored; Firefox 194 277 bytes until the first screen (over the limit of then, 194 000).
 *
 * The byte limits are the Chromium values of 2026-10-19 plus 15%; the count until the game is stored is the
 * Chromium value of 2026-10-13 plus 15%.
 */
const FIRST_VISIT_BUDGET = {
  FIRST_SCREEN_BYTES: 222_000,
  READY_REQUESTS: 17,
  READY_BYTES: 242_000,
} as const;

/** Requests until the first screen, as measured in each engine; 15% of four requests is less than one request. */
const FIRST_SCREEN_REQUESTS = { chromium: 4, firefox: 5, webkit: 4 } as const;

/**
 * The engines in which the worker gets whole files again for what the page already has. Seen in the WebKit of
 * the browser tests; whether Safari does the same on a phone has not been measured. There the second copy is
 * allowed, and nothing beyond it.
 */
const FETCHES_AGAIN_FOR_THE_WORKER: ReadonlySet<string> = new Set(["webkit"]);

const HTTP_OK = 200;

interface Stage {
  requests: readonly ServedRequest[];
  count: number;
  bodyBytes: number;
}

function stageOf(requests: readonly ServedRequest[]): Stage {
  return {
    requests,
    count: requests.length,
    bodyBytes: requests.reduce((sum, request) => sum + (request.bodyBytes ?? 0), 0),
  };
}

interface RepeatedDownload {
  path: string;
  /** How many times the whole body was sent. */
  times: number;
  /** Bytes sent beyond the first copy. */
  repeatedBytes: number;
}

/** The paths whose whole body was sent more than once. */
function repeatedDownloads(requests: readonly ServedRequest[]): RepeatedDownload[] {
  const whole = requests.filter((request) => request.status === HTTP_OK && (request.bodyBytes ?? 0) > 0);
  const paths = [...new Set(whole.map((request) => request.path))];
  return paths.flatMap((path) => {
    const copies = whole.filter((request) => request.path === path);
    const repeatedBytes = copies.slice(1).reduce((sum, request) => sum + (request.bodyBytes ?? 0), 0);
    return copies.length > 1 ? [{ path, times: copies.length, repeatedBytes }] : [];
  });
}

/**
 * What the page itself asks for until its first screen stands and the network is quiet. The game registers its
 * worker as soon as that screen is up, and the worker's requests would arrive among the page's own; so this is
 * taken in a profile of its own where no worker can register.
 */
async function firstScreenRequests(browser: Browser, server: StaticServer): Promise<ServedRequest[]> {
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await openGame(page, server.origin);
    await page.waitForLoadState("networkidle");
    return [...server.requests];
  } finally {
    await context.close();
  }
}

test("a first visit fetches each file once and stays within the budget of requests and bytes", async ({
  page,
  browser,
  browserName,
}, testInfo) => {
  const server = await startStaticServer({ root: DIST_DIR });
  try {
    const firstScreen = stageOf(await firstScreenRequests(browser, server));

    // A fresh profile again, now as a player has it: the page, then the worker that stores the release.
    const before = server.requests.length;
    await openGame(page, server.origin);
    await requireServiceWorkers(page);
    await expect(page.getByText(OFFLINE_NOTE.ready)).toBeVisible();
    await page.waitForLoadState("networkidle");
    const ready = stageOf(server.requests.slice(before));
    const repeated = repeatedDownloads(ready.requests);
    const repeatedBytes = repeated.reduce((sum, download) => sum + download.repeatedBytes, 0);

    await reportMeasurement(testInfo, "first-visit", {
      engine: browserName,
      firstScreen,
      ready,
      notModified: ready.requests.filter((request) => request.status === 304).length,
      repeated,
      repeatedBytes,
    });

    expect(firstScreen.count, "requests until the first screen").toBeLessThanOrEqual(
      FIRST_SCREEN_REQUESTS[browserName],
    );
    expect(firstScreen.bodyBytes, "bytes until the first screen").toBeLessThanOrEqual(
      FIRST_VISIT_BUDGET.FIRST_SCREEN_BYTES,
    );
    expect(ready.count, "requests until the game is stored").toBeLessThanOrEqual(FIRST_VISIT_BUDGET.READY_REQUESTS);
    if (FETCHES_AGAIN_FOR_THE_WORKER.has(browserName)) {
      expect(repeatedBytes, "bytes sent a second time").toBeLessThanOrEqual(FIRST_VISIT_BUDGET.FIRST_SCREEN_BYTES);
      expect(ready.bodyBytes, "bytes until the game is stored").toBeLessThanOrEqual(
        FIRST_VISIT_BUDGET.READY_BYTES + FIRST_VISIT_BUDGET.FIRST_SCREEN_BYTES,
      );
    } else {
      expect(repeated, "files whose whole body was sent more than once").toEqual([]);
      expect(ready.bodyBytes, "bytes until the game is stored").toBeLessThanOrEqual(FIRST_VISIT_BUDGET.READY_BYTES);
    }
  } finally {
    await server.close();
  }
});
