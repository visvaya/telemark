// The lowest Node a local install accepts, read from engines.node in package.json. pnpm's engineStrict would
// enforce it too, but it also refuses the dependency bot, whose updater runs an older Node and so never opened
// an npm update. The install runs this check through the preinstall script instead, which the bot skips.
import { parseVersion } from "./version-rules.mjs";

const FLOOR_PATTERN = /^>=(\S+)$/;

const PARTS = ["major", "minor", "patch"];

function isOlder(a, b) {
  const differing = PARTS.find((part) => a[part] !== b[part]);
  return differing !== undefined && a[differing] < b[differing];
}

/** Null when `nodeVersion` (as `process.version` gives it) meets the floor `range`, else what is wrong. */
export function nodeFloorProblem(nodeVersion, range) {
  const floor = FLOOR_PATTERN.exec(range);
  if (floor === null) throw new Error(`engines.node "${range}": only ">=x.y.z" is supported`);
  const current = nodeVersion.replace(/^v/, "");
  return isOlder(parseVersion(current), parseVersion(floor[1]))
    ? `Node ${current} is older than the required ${range}`
    : null;
}
