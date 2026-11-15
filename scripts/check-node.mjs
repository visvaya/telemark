// Refuses an install on a Node older than engines.node in package.json (run as the preinstall script).
// Usage: node scripts/check-node.mjs [path/to/package.json]   (default: ./package.json)
import { readFileSync } from "node:fs";

import { nodeFloorProblem } from "./lib/node-floor.mjs";

const manifest = JSON.parse(readFileSync(process.argv[2] ?? "package.json", "utf8"));
const problem = nodeFloorProblem(process.version, manifest.engines.node);
if (problem !== null) {
  console.error(`check-node: ${problem}`);
  process.exitCode = 1;
}
