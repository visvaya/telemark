import { readFile } from "node:fs/promises";
import { REGRESSION_SCENARIOS } from "../src/sim/test-support/regression-scenarios";
import { HARNESS_BUNDLE, HARNESS_RESULTS_ID, REGRESSION_SNAPSHOT } from "./sim-harness/paths";
import { expect, test } from "./support/fixtures";
import { parseVitestSnapshot } from "./support/vitest-snapshot";

/** Title of the regression test in Vitest; the snapshot keys start with it. */
const SUITE = "jump simulation regression on a synthetic hill";
const BLANK_PAGE = '<!doctype html><html lang="en"><head><title>Simulation harness</title></head><body></body></html>';

test.skip(({ traits }) => !traits.desktop, "the simulation is compared once per engine, on the desktop projects");

// The physics must give the same bits on every device. The scenarios of the regression test run here inside
// the page, in the engine's own JavaScript, and are compared with the snapshot that test committed from Node:
// frames, distance, points, notes, fall type and a hash over the state of every frame.
test("the simulation gives the result of the committed snapshot in this engine", async ({ page }) => {
  const snapshot = parseVitestSnapshot(await readFile(REGRESSION_SNAPSHOT, "utf8"));
  const expected = REGRESSION_SCENARIOS.map((scenario) => ({
    name: scenario.name,
    result: snapshot.get(`${SUITE} > ${scenario.name} 1`),
  }));
  // Every scenario has its entry: a renamed test or snapshot must not turn the comparison into nothing.
  expect(expected.filter((entry) => entry.result === undefined)).toEqual([]);
  expect(expected.length).toBeGreaterThanOrEqual(3);

  await page.setContent(BLANK_PAGE);
  await page.addScriptTag({ path: HARNESS_BUNDLE });
  const json = await page.locator(`#${HARNESS_RESULTS_ID}`).textContent();
  const actual: unknown = JSON.parse(json ?? "[]");

  // One comparison of the whole list: a difference names the scenario and the value in the diff.
  expect(actual).toEqual(expected);
});
