import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

/** The version of the game has one source, package.json; the build writes it into the game (src/game/version.ts). */
function packageVersion(): string {
  const pkg: unknown = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
  if (typeof pkg === "object" && pkg !== null && "version" in pkg && typeof pkg.version === "string") {
    return pkg.version;
  }
  throw new Error("package.json names no version");
}

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.GAME_VERSION": JSON.stringify(packageVersion()) },
  build: {
    // The fonts go into the stylesheet instead of separate files: a font fetched on its own arrives after the
    // first screen has been laid out in the fallback font, and moves that screen when it replaces it.
    assetsInlineLimit: (filePath) => (filePath.endsWith(".woff2") ? true : undefined),
  },
  test: {
    include: ["src/**/*.test.ts"],
    // The slow tier of the hill checks (the same verdict on three disjoint seed sets) runs only through
    // `pnpm test:hills-stability`, which sets this variable; every other run leaves it out.
    exclude: [
      ...configDefaults.exclude,
      ...(process.env["HILL_STABILITY"] === "1" ? [] : ["src/hills/hill-play.stability-*.test.ts"]),
    ],
    globals: false,
    // Tests that simulate whole jumps take 1 to 3 s alone; on a laptop shared with other work they passed 5 s and
    // failed at random (2026-10-21: six different tests, each passing alone), while a quiet run never comes close.
    // Three times the default keeps a hung test caught. Time budgets are checked by their own tests, not by this.
    testTimeout: 15_000,
    // Coverage is measured where a wrong value does not crash anything but silently gives wrong results: the
    // simulation, the save with records and replays, and the hill format with its checks. Each directory keeps
    // its own thresholds; tests and test helpers are not counted.
    coverage: {
      provider: "v8",
      include: ["src/sim/**", "src/storage/**", "src/hills/**"],
      exclude: ["src/**/*.test.ts", "src/**/test-support/**", "src/sim/data/**"],
      reporter: ["text-summary", "html"],
      // Two points under the values measured on 2026-10-16 without files of the original game, as in CI, where
      // the golden tests are skipped, rounded down: sim statements 96.41, branches 82.28, functions 98.75, lines
      // 97.19; storage statements 91.14, branches 89.28, functions 88.44, lines 93.18; hills statements 99.03,
      // branches 93.45, functions 100, lines 99.44.
      // Raise them when coverage improves; never lower them to make a run pass.
      thresholds: {
        "src/sim/**": { statements: 94, branches: 80, functions: 96, lines: 95 },
        "src/storage/**": { statements: 89, branches: 87, functions: 86, lines: 91 },
        "src/hills/**": { statements: 97, branches: 91, functions: 98, lines: 97 },
      },
    },
  },
});
