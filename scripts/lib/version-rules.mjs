// The version of the game, as pure functions. One number, `version` in package.json, says which game this is:
// the build writes it into the game and into release.json, and publishing tags the commit with it. A pull
// request that changes the game moves the number by the step its title names (Conventional Commits): a new
// feature the middle number, anything else the last one, a breaking change the first one (the middle one
// before 1.0). A pull request that leaves the game as it was leaves the number alone.

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TITLE_PATTERN = /^([a-z]+)(\([a-z0-9.-]+\))?(!)?: /;

// The files the published game is built from. A test next to the source is not built into it.
const GAME_INPUT_PREFIXES = ["src/", "public/"];
const GAME_INPUT_FILES = new Set([
  "index.html",
  "vite.config.ts",
  "tsconfig.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "deploy/wrangler.jsonc",
  "scripts/write-release.mjs",
  "scripts/lib/release-rules.mjs",
  "scripts/lib/service-worker-template.js",
]);
// A test and the snapshot it keeps are not built into the game.
const TEST_FILE_PATTERN = /\.test\.[cm]?[jt]sx?(\.snap)?$/;

export function parseVersion(text) {
  const match = VERSION_PATTERN.exec(text);
  if (match === null) throw new Error(`not a version: "${text}"`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (const part of ["major", "minor", "patch"]) {
    if (x[part] !== y[part]) return x[part] > y[part] ? 1 : -1;
  }
  return 0;
}

// "major", "minor" or "patch", from a title such as "feat(ui): show the version".
export function bumpOfTitle(title) {
  const match = TITLE_PATTERN.exec(title);
  if (match === null) throw new Error(`the title does not follow Conventional Commits: "${title}"`);
  if (match[3] === "!") return "major";
  return match[1] === "feat" ? "minor" : "patch";
}

// Before 1.0 the first number stays at 0: a breaking change moves the middle one.
export function nextVersion(version, bump) {
  const { major, minor, patch } = parseVersion(version);
  if (bump === "major" && major > 0) return `${major + 1}.0.0`;
  if (bump === "major" || bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const withoutVersion = (pkg) => JSON.stringify({ ...pkg, version: undefined });

// Whether a change of these files changes the game. package.json counts unless only its version moved.
export function changesTheGame(changedPaths, basePackage, headPackage) {
  return changedPaths.some((path) => {
    if (path === "package.json") return withoutVersion(basePackage) !== withoutVersion(headPackage);
    if (TEST_FILE_PATTERN.test(path)) return false;
    return GAME_INPUT_FILES.has(path) || GAME_INPUT_PREFIXES.some((prefix) => String(path).startsWith(prefix));
  });
}

// What is wrong with the version of a pull request, as messages; none when it is right.
export function findVersionProblems({ title, changedPaths, basePackage, headPackage }) {
  const base = basePackage.version;
  const head = headPackage.version;
  try {
    parseVersion(head);
  } catch {
    return [`package.json: not a version: "${head}"`];
  }
  if (changesTheGame(changedPaths, basePackage, headPackage) !== true) {
    return head === base
      ? []
      : [`the pull request does not change the game, so package.json must keep ${base}, not ${head}`];
  }
  const expected = nextVersion(base, bumpOfTitle(title));
  if (head === expected) return [];
  const type = TITLE_PATTERN.exec(title)?.[1] ?? "change";
  return [
    `the pull request changes the game, so package.json must say ${expected} (${type} after ${base}), not ${head}: run \`pnpm version:bump\``,
  ];
}

// Whether a package may be published over the deployed one. A changed game under a number that is not above
// the deployed one would show players an old number for a new game. Nothing deployed with a number (a release
// from before the versions) puts no limit.
export function findPublishProblems({ localVersion, servedVersion, sameContent }) {
  if (sameContent === true || servedVersion === undefined) return [];
  if (compareVersions(localVersion, servedVersion) > 0) return [];
  return [
    `the game changed but its version ${localVersion} is not above the deployed ${servedVersion}; nothing is published`,
  ];
}
