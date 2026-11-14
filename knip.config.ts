import type { KnipConfig } from "knip";

/**
 * Unused files, exports and dependencies. Run through `pnpm check:unused`, which sets
 * KNIP_DISABLE_RAW_TRANSFER=1 (knip needs it on Windows).
 *
 * The application entry (src/main.tsx) is found through index.html and the Vite and Vitest configuration
 * files through knip's plugins, so none of them is listed. tools/ is Python and is not analysed.
 */
const config: KnipConfig = {
  entry: [
    // Tests are entry points, so a module used only by tests (src/**/test-support) counts as used.
    "src/**/*.test.ts",
    "scripts/*.mjs",
    "scripts/**/*.test.mjs",
    // Loaded by path from scripts/plan-replays.mjs and scripts/search-falls.mjs (through
    // scripts/lib/load-typescript.mjs).
    "src/original/test-support/hill-plans.ts",
    "src/original/test-support/fall-search.ts",
    // Loaded by path from scripts/train-player.mjs.
    "src/hills/test-support/player-training.ts",
    // Named only in stryker.config.json ("vitest.configFile"), which knip does not follow.
    "vitest.stryker.config.ts",
    // Browser tests (Playwright): the specs, the set-up that bundles the simulation harness, and the page
    // script of that harness, which only Vite's build API is pointed at.
    "e2e/**/*.spec.ts",
    // The measurements, run only by `pnpm test:browser:perf`.
    "e2e/**/*.perf.ts",
    // The README picture, taken only with BROWSER_TESTS_SCREENSHOTS set (playwright.config.ts).
    "e2e/**/*.shot.ts",
    "e2e/**/*.setup.ts",
    "e2e/sim-harness/entry.ts",
  ],
  project: ["src/**/*.{ts,tsx}", "e2e/**/*.ts", "scripts/**/*.mjs", "*.config.ts"],
  // Its font files are named in src/ui/fonts.css, and knip does not read stylesheets.
  ignoreDependencies: ["@fontsource/silkscreen"],
  // The deployment tool belongs to deploy/, a project of its own with its own lockfile; the workflows run it there.
  ignoreBinaries: ["wrangler"],
};

export default config;
