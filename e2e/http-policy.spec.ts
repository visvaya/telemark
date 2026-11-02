import { execFile } from "node:child_process";
import { join } from "node:path";
import { DIST_DIR, PROJECT_ROOT } from "./releases/paths";
import { expect, test } from "./support/fixtures";

// What the server answers does not depend on the browser, so one project checks it.
const PROJECT = "desktop-chromium";
test.skip(({ traits }) => traits.project !== PROJECT, `the answers of the server are checked on ${PROJECT}`);

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src data:; " +
  "connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'";

function runDeploymentCheck(address: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const script = join(PROJECT_ROOT, "scripts", "check-deployment.mjs");
    execFile(
      process.execPath,
      [script, address, "--dist", DIST_DIR],
      { cwd: PROJECT_ROOT },
      (error, stdout, stderr) => {
        resolve({ code: error === null ? 0 : 1, output: `${stdout}${stderr}` });
      },
    );
  });
}

// The same check that runs against the deployed game after a release, here against the server of the tests:
// bytes, types, cache rules and security headers of every file, 404 for everything else.
test("the server of the tests passes the check made of a deployment", async ({ baseURL }) => {
  const result = await runDeploymentCheck(baseURL ?? "");
  expect(result.output).toContain("no problems");
  expect(result.code).toBe(0);
});

test("the page is served under the policy the game is written for", async ({ request }) => {
  const page = await request.get("/");
  expect(page.status()).toBe(200);
  expect(page.headers()["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
  expect(page.headers()["permissions-policy"]).toBe(
    "accelerometer=(self), gyroscope=(self), fullscreen=(self), camera=(), microphone=(), geolocation=()",
  );
  expect(page.headers()["cache-control"]).toBe("no-cache");
});

test("the worker, the manifest and the licence have the types and cache rules a browser needs", async ({ request }) => {
  const worker = await request.get("/sw.js");
  expect(worker.headers()["content-type"]).toMatch(/^text\/javascript\b/);
  expect(worker.headers()["cache-control"]).toBe("no-cache");

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.headers()["content-type"]).toBe("application/manifest+json");
  expect(manifest.headers()["cache-control"]).toBe("no-cache");

  const licence = await request.get("/licenses/silkscreen-ofl.txt");
  expect(licence.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(await licence.text()).toContain("SIL OPEN FONT LICENSE");
});

test("the page allows zooming and reaches under the cut-outs of the screen", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("viewport-fit=cover");
  expect(viewport).not.toMatch(/user-scalable|maximum-scale/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#000000");
});

test("Chromium finds nothing that keeps the game from being installed", async ({ page }) => {
  await page.goto("/");
  const session = await page.context().newCDPSession(page);
  // The manifest and its icons are fetched after the page: until then the check reports them missing. Every context
  // of the tests is a private one, which no browser installs from, so that one reason is left out.
  await expect
    .poll(async () => {
      const { installabilityErrors } = await session.send("Page.getInstallabilityErrors");
      return installabilityErrors.map((error) => error.errorId).filter((id) => id !== "in-incognito");
    })
    .toEqual([]);
});
