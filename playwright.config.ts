import { defineConfig, devices, type PlaywrightTestProject as Project } from "@playwright/test";

/**
 * Browser tests of the production build on desktop, phone and tablet profiles. The build is served the way the
 * host serves it (scripts/serve-dist.mjs): under the headers of public/_headers, the content security policy
 * among them, with a real 404 for an unknown path and with the service worker registering as it does for a
 * player.
 *
 * In CI every project runs with the browsers Playwright installs. With BROWSER_TESTS_EDGE set (the local mode,
 * `pnpm test:browser:edge`) only the Chromium-based projects run, in the Microsoft Edge already on the machine,
 * so nothing has to be downloaded; Firefox and WebKit are then not exercised at all.
 *
 * With BROWSER_TESTS_ENGINE set to chromium, firefox or webkit only the projects of that engine run, with the
 * setup projects they depend on. CI runs the three engines as separate jobs at the same time, each with only its
 * own browser installed; a new project joins the job of its engine without a change to the workflow.
 *
 * With BROWSER_TESTS_PERF set (`pnpm test:browser:perf`) none of the above runs. One project, `perf-chromium`,
 * then runs the measurements in e2e/perf (`*.perf.ts`), one test at a time: they time the game, and a test
 * running beside them would be measured too. They have a report and a results directory of their own, so a run
 * of them leaves the traces of the ordinary run alone. Without the variable those files are not run at all.
 */
const PORT = 4317;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BUILD = "node node_modules/vite/bin/vite.js build && node scripts/write-release.mjs";
const SERVE = `node scripts/serve-dist.mjs --port ${PORT}`;
const inCi = Boolean(process.env["CI"]);
const localEdge = Boolean(process.env["BROWSER_TESTS_EDGE"]);
const measuring = Boolean(process.env["BROWSER_TESTS_PERF"]);
const ENGINES = ["chromium", "firefox", "webkit"] as const;
const engine = process.env["BROWSER_TESTS_ENGINE"] ?? "";
if (engine !== "" && !ENGINES.some((known) => known === engine)) {
  throw new Error(`BROWSER_TESTS_ENGINE must be one of ${ENGINES.join(", ")}, not "${engine}"`);
}

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
/**
 * The Chromium-based projects run in a full browser in its headless mode: Edge locally, Chromium on the runner.
 * Playwright's separate headless shell did not start a jump from a held mouse button on the runner, while the
 * full browser does.
 */
const chromiumChannel = { channel: localEdge ? "msedge" : "chromium" };
/** Builds the simulation harness once; the projects that load it depend on this one. */
const HARNESS_PROJECT = "sim-harness-build";
/** Prepares the releases that the offline and update tests switch between, and the single-file page. */
const RELEASES_PROJECT = "releases-build";
const DESKTOP_SETUP = [HARNESS_PROJECT, RELEASES_PROJECT];

/** The projects the local mode can run: Edge is Chromium-based. */
const chromiumProjects: Project[] = [
  {
    name: "desktop-chromium",
    use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT, ...chromiumChannel },
    dependencies: DESKTOP_SETUP,
  },
  { name: "android-portrait", use: { ...devices["Pixel 7"], ...chromiumChannel } },
  { name: "android-landscape", use: { ...devices["Pixel 7 landscape"], ...chromiumChannel } },
];

const firefoxAndWebkitProjects: Project[] = [
  {
    name: "desktop-firefox",
    use: {
      ...devices["Desktop Firefox"],
      viewport: DESKTOP_VIEWPORT,
      // The automated Firefox does not count a synthesized press as the gesture that lets a page play sound, so the
      // audio context stayed suspended; allowed here, the sound tests check the game's own rules for sound in it.
      launchOptions: {
        firefoxUserPrefs: { "media.autoplay.default": 0, "media.autoplay.block-webaudio": false },
      },
    },
    dependencies: DESKTOP_SETUP,
  },
  {
    name: "desktop-webkit",
    use: { ...devices["Desktop Safari"], viewport: DESKTOP_VIEWPORT },
    dependencies: DESKTOP_SETUP,
  },
  { name: "iphone-portrait", use: { ...devices["iPhone 14"] } },
  { name: "iphone-landscape", use: { ...devices["iPhone 14 landscape"] } },
  { name: "tablet-landscape", use: { ...devices["iPad (gen 7) landscape"] } },
];

const ofEngine = (project: Project): boolean =>
  engine === "" || (project.use?.defaultBrowserType ?? project.use?.browserName) === engine;

const functionalProjects: Project[] = [
  { name: HARNESS_PROJECT, testMatch: "**/sim-harness.setup.ts" },
  { name: RELEASES_PROJECT, testMatch: "**/releases.setup.ts" },
  ...[...chromiumProjects, ...(localEdge ? [] : firefoxAndWebkitProjects)].filter(ofEngine),
];

/** The measurements: Chromium only, because they steer the processor and read the heap through its protocol. */
const measuringProjects: Project[] = [
  {
    name: "perf-chromium",
    testMatch: "**/*.perf.ts",
    use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT, ...chromiumChannel },
  },
];

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  // A jump runs in real time and takes about fifteen seconds; a test may need to repeat one.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  // The game keeps real time, so a crowded machine makes it drop simulation steps: one worker fewer than the
  // runner has processors, two on a developer's machine.
  workers: measuring ? 1 : inCi ? 3 : 2,
  fullyParallel: false,
  outputDir: measuring ? "test-results-perf" : "test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: measuring ? "playwright-report-perf" : "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    colorScheme: "dark",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: measuring ? measuringProjects : functionalProjects,
  // The tests run against the production build. CI has built it in an earlier step and serves exactly the files
  // it has just checked; the local mode builds first, so a stale dist/ is never tested.
  webServer: {
    command: inCi ? SERVE : `${BUILD} && ${SERVE}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
