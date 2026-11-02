import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bumpOfTitle,
  changesTheGame,
  compareVersions,
  findPublishProblems,
  findVersionProblems,
  nextVersion,
  parseVersion,
} from "./version-rules.mjs";

test("a version is three numbers and nothing else", () => {
  assert.deepEqual(parseVersion("0.12.3"), { major: 0, minor: 12, patch: 3 });
  for (const wrong of ["1.2", "1.2.3.4", "v1.2.3", "1.2.3-beta", "01.2.3", "", " 1.2.3"]) {
    assert.throws(() => parseVersion(wrong), /not a version/, wrong);
  }
});

test("versions are compared number by number, not as text", () => {
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
});

test("the title of a pull request says how far the version moves", () => {
  assert.equal(bumpOfTitle("feat(ui): show the version"), "minor");
  assert.equal(bumpOfTitle("feat: a feature without a scope"), "minor");
  assert.equal(bumpOfTitle("fix(audio): create the context earlier"), "patch");
  assert.equal(bumpOfTitle("perf(render): draw less"), "patch");
  assert.equal(bumpOfTitle("build(deps): bump vite"), "patch");
  assert.equal(bumpOfTitle("refactor!: change the save format"), "major");
  assert.equal(bumpOfTitle("feat(storage)!: drop old saves"), "major");
  assert.throws(() => bumpOfTitle("Update things"), /Conventional Commits/);
});

test("before 1.0 a breaking change moves the middle number, after it the first", () => {
  assert.equal(nextVersion("0.4.2", "minor"), "0.5.0");
  assert.equal(nextVersion("0.4.2", "patch"), "0.4.3");
  assert.equal(nextVersion("0.4.2", "major"), "0.5.0");
  assert.equal(nextVersion("1.4.2", "major"), "2.0.0");
  assert.equal(nextVersion("0.0.0", "minor"), "0.1.0");
  assert.equal(nextVersion("0.9.0", "minor"), "0.10.0");
});

test("only the files the game is built from change the game", () => {
  const same = { name: "telemark", version: "0.1.0", scripts: { a: "x" } };
  const changed = (paths, head = same) => changesTheGame(paths, same, head);
  assert.equal(changed(["src/ui/menu-screen.tsx"]), true);
  assert.equal(changed(["public/icon.svg"]), true);
  assert.equal(changed(["index.html"]), true);
  assert.equal(changed(["vite.config.ts"]), true);
  assert.equal(changed(["pnpm-lock.yaml"]), true);
  assert.equal(changed(["deploy/wrangler.jsonc"]), true);
  assert.equal(changed(["scripts/lib/service-worker-template.js"]), true);
  assert.equal(changed(["scripts/lib/release-rules.mjs"]), true);
  assert.equal(changed(["src/sim/step.test.ts"]), false, "a test is not built into the game");
  assert.equal(changed(["src/game/__snapshots__/step.test.ts.snap"]), false, "nor is the snapshot of a test");
  assert.equal(changed(["src/game/step.snap"]), true, "a file named .snap that no test keeps may be built");
  assert.equal(changed(["docs/testing.md", "README.md", "e2e/menu.spec.ts", ".github/workflows/ci.yml"]), false);
  assert.equal(changed(["scripts/monitor-deployment.mjs"]), false);
  // package.json counts unless only its version moved.
  assert.equal(changed(["package.json"], { ...same, version: "0.2.0" }), false);
  assert.equal(changed(["package.json"], { ...same, scripts: { a: "y" } }), true);
});

test("a pull request that changes the game moves the version by the step its title names", () => {
  const base = { name: "telemark", version: "0.3.1" };
  const check = (title, paths, headVersion) =>
    findVersionProblems({
      title,
      changedPaths: paths,
      basePackage: base,
      headPackage: { ...base, version: headVersion },
    });
  assert.deepEqual(check("feat(ui): x", ["src/a.ts", "package.json"], "0.4.0"), []);
  assert.deepEqual(check("fix(ui): x", ["src/a.ts", "package.json"], "0.3.2"), []);
  assert.deepEqual(check("docs: x", ["docs/a.md"], "0.3.1"), []);
  assert.deepEqual(check("feat(ui): x", ["src/a.ts"], "0.3.1"), [
    "the pull request changes the game, so package.json must say 0.4.0 (feat after 0.3.1), not 0.3.1: run `pnpm version:bump`",
  ]);
  assert.deepEqual(check("fix(ui): x", ["src/a.ts", "package.json"], "0.4.0"), [
    "the pull request changes the game, so package.json must say 0.3.2 (fix after 0.3.1), not 0.4.0: run `pnpm version:bump`",
  ]);
  assert.deepEqual(check("docs: x", ["docs/a.md", "package.json"], "0.3.2"), [
    "the pull request does not change the game, so package.json must keep 0.3.1, not 0.3.2",
  ]);
  assert.deepEqual(check("feat(ui): x", ["src/a.ts", "package.json"], "0.4"), ['package.json: not a version: "0.4"']);
});

test("a changed game is published only under a version above the deployed one", () => {
  assert.deepEqual(findPublishProblems({ localVersion: "0.4.0", servedVersion: "0.3.2", sameContent: false }), []);
  assert.deepEqual(findPublishProblems({ localVersion: "0.4.0", servedVersion: "0.4.0", sameContent: true }), []);
  // A release from before the versions, or nothing served yet.
  assert.deepEqual(findPublishProblems({ localVersion: "0.1.0", servedVersion: undefined, sameContent: false }), []);
  assert.deepEqual(findPublishProblems({ localVersion: "0.4.0", servedVersion: "0.4.0", sameContent: false }), [
    "the game changed but its version 0.4.0 is not above the deployed 0.4.0; nothing is published",
  ]);
  assert.deepEqual(findPublishProblems({ localVersion: "0.4.0", servedVersion: "0.5.0", sameContent: false }), [
    "the game changed but its version 0.4.0 is not above the deployed 0.5.0; nothing is published",
  ]);
});
