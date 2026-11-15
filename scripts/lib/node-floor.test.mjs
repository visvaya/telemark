import assert from "node:assert/strict";
import { test } from "node:test";

import { nodeFloorProblem } from "./node-floor.mjs";

test("a Node at or above the floor passes", () => {
  assert.equal(nodeFloorProblem("v26.12.1", ">=26.12.1"), null);
  assert.equal(nodeFloorProblem("v26.13.0", ">=26.12.1"), null);
  assert.equal(nodeFloorProblem("v27.0.0", ">=26.12.1"), null);
});

test("a Node below the floor is named with the floor", () => {
  assert.equal(nodeFloorProblem("v26.12.0", ">=26.12.1"), "Node 26.12.0 is older than the required >=26.12.1");
  assert.equal(nodeFloorProblem("v24.22.2", ">=26.12.1"), "Node 24.22.2 is older than the required >=26.12.1");
});

test("a range other than one floor is refused, so a changed engines field cannot pass unread", () => {
  assert.throws(() => nodeFloorProblem("v26.13.0", "^26.12.1"), /only ">=x.y.z"/);
});
