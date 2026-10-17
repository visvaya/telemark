// Rules for the production build output, as pure functions over a listing of dist/.
// A listing entry is { path, bytes, gzipBytes, head }: the path relative to dist/ with forward
// slashes, the size of the file, its gzip size and its first bytes.

// Budgets, about 15% above the sizes measured after `pnpm build`. Tighten them when the package shrinks;
// raise one only together with the change that explains the growth.
//
// JavaScript and CSS are the bundles under assets/, gzip (zlib default level), measured on 2026-10-12:
// JavaScript 102179 bytes, CSS 15170 bytes. The stylesheet carries the fonts: before that it was 8512 bytes
// and the browser fetched a font file of 8404 bytes next to it, so the two together were 16916 bytes.
// JavaScript measured again on 2026-10-14: 119242 bytes, after the replays (watching a jump again, the replays of
// the original, the shelf of kept replays with its screen and settings).
// JavaScript measured again on 2026-10-15: 131172 bytes on master, 140086 bytes with the jump scene drawn as the
// original draws it (its layers in perspective, palette, background, inrun, fences, marks and trees), while the
// outfit preview and the icon still use the earlier drawing; the budget keeps the margin it had (4.4%). Measured
// again the same day at 140468 bytes, with the preview and the icon on the new scene and the earlier drawing gone.
// CSS measured again on 2026-10-16: 22425 bytes, with the screens' font (the jump picture's letters, 4788 bytes
// of woff2, 4763 bytes of the stylesheet's gzip as base64) and the rules that set the screens in it; the same
// stylesheet without that font is 17271 bytes. The budget keeps a margin of about 15%.
// JavaScript measured again on 2026-10-16: 145996 bytes on master (0.15.0), after the night light on the hill, the
// moon and the props kept in place, and the check and install of a new release; the budget keeps a margin of
// about 4%, as before.
// JavaScript measured again on 2026-10-17: 156959 bytes with the single competition (its setup, board and results,
// the computer jumpers' pilot, which the game did not load before, and the competition's state); the budget keeps a
// margin of about 4%.
export const DIST_BUDGETS = {
  JS_GZIP_BUDGET_BYTES: 163_000,
  CSS_GZIP_BUDGET_BYTES: 25_800,
  // Measured on 2026-10-13: the service worker 3890 bytes gzip (3160 before it kept the release before for the
  // pages that still need it), the four icons 9682 bytes.
  SERVICE_WORKER_GZIP_BUDGET_BYTES: 4_500,
  // The icons are PNG, which gzip does not shrink, so their budget is in stored bytes. Measured again on
  // 2026-10-15: 11363 bytes, drawn from the jump scene as the original draws it (a fence and a snowy tree in the
  // picture compress less than the earlier plain backdrop); the budget keeps a margin of about 13%.
  ICONS_BUDGET_BYTES: 12_800,
};

// What the build produces, by exact name: the page, what makes it installable and usable without a network,
// the host's headers file and the licence of the fonts. Fonts themselves are inside the stylesheet, so a font
// file is unexpected. Every one of these must be there.
export const REQUIRED_PATHS = [
  "index.html",
  "_headers",
  "sw.js",
  "release.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "licenses/silkscreen-ofl.txt",
];

// Bundles with a content hash in their name; at least one of each kind must be there.
const BUNDLE_PATTERN = /^assets\/[\w.-]+-[\w-]{8}\.(?:js|css)$/;
const REQUIRED_BUNDLE_EXTENSIONS = [".js", ".css"];

// Files of the original game and data derived from it are never shipped. Traces may be gzip-compressed.
const GAME_FILE_PATTERN = /\.(?:exe|dat|rpl|(?:trace|hilltrace)(?:\.gz)?)$/i;

// "MZ", the first two bytes of a DOS or Windows executable.
const MZ_SIGNATURE = [0x4d, 0x5a];

// The host never serves `_headers`, and it is not a file the browser gets.
const NOT_DOWNLOADED_PATHS = new Set(["_headers"]);
// Already compressed: sent as stored.
const STORED_AS_SENT_PATTERN = /\.png$/;

function isBundle(path) {
  return BUNDLE_PATTERN.test(path);
}

function isAllowedPath(path) {
  return REQUIRED_PATHS.includes(path) || isBundle(path);
}

function startsWithMzSignature(head) {
  return MZ_SIGNATURE.every((byte, index) => head[index] === byte);
}

function sum(files, sizeOf) {
  return files.reduce((total, file) => total + sizeOf(file), 0);
}

const gzipOf = (file) => file.gzipBytes;
const bytesOf = (file) => file.bytes;

// The sizes the budgets are about, in bytes.
export function measureDist(files) {
  const bundles = files.filter((file) => isBundle(file.path));
  const downloaded = files.filter((file) => !NOT_DOWNLOADED_PATHS.has(file.path));
  return {
    jsGzipBytes: sum(
      bundles.filter((file) => file.path.endsWith(".js")),
      gzipOf,
    ),
    cssGzipBytes: sum(
      bundles.filter((file) => file.path.endsWith(".css")),
      gzipOf,
    ),
    serviceWorkerGzipBytes: sum(
      files.filter((file) => file.path === "sw.js"),
      gzipOf,
    ),
    iconsBytes: sum(
      files.filter((file) => file.path.startsWith("icons/")),
      bytesOf,
    ),
    // What a first visit transfers before the game works without a network: everything, compressed where
    // the host compresses.
    offlineTransferBytes: sum(downloaded, (file) =>
      STORED_AS_SENT_PATTERN.test(file.path) ? file.bytes : file.gzipBytes,
    ),
  };
}

function findBudgetProblems(files, budgets) {
  const sizes = measureDist(files);
  const sums = [
    { label: "JavaScript gzip size", bytes: sizes.jsGzipBytes, budgetBytes: budgets.JS_GZIP_BUDGET_BYTES },
    { label: "CSS gzip size", bytes: sizes.cssGzipBytes, budgetBytes: budgets.CSS_GZIP_BUDGET_BYTES },
    {
      label: "Service worker gzip size",
      bytes: sizes.serviceWorkerGzipBytes,
      budgetBytes: budgets.SERVICE_WORKER_GZIP_BUDGET_BYTES,
    },
    { label: "Icons size", bytes: sizes.iconsBytes, budgetBytes: budgets.ICONS_BUDGET_BYTES },
  ];
  return sums
    .filter((entry) => entry.bytes > entry.budgetBytes)
    .map((entry) => `${entry.label} ${entry.bytes} bytes exceeds the budget of ${entry.budgetBytes} bytes`);
}

function findMissing(files) {
  const present = new Set(files.map((file) => file.path));
  const missingPaths = REQUIRED_PATHS.filter((path) => !present.has(path));
  const missingBundles = REQUIRED_BUNDLE_EXTENSIONS.filter(
    (extension) => files.some((file) => isBundle(file.path) && file.path.endsWith(extension) === true) !== true,
  );
  return [
    ...missingPaths.map((path) => `missing: ${path}`),
    ...missingBundles.map((extension) => `missing: a hashed ${extension} bundle under assets/`),
  ];
}

// Returns one message per problem; an empty list means the build output is acceptable.
export function findDistProblems(files, budgets) {
  const gameFiles = files.filter((file) => GAME_FILE_PATTERN.test(file.path));
  const executables = files.filter((file) => startsWithMzSignature(file.head));
  const unexpected = files.filter((file) => !isAllowedPath(file.path) && !GAME_FILE_PATTERN.test(file.path));
  return [
    ...gameFiles.map((file) => `game file extension: ${file.path}`),
    ...executables.map((file) => `MZ executable signature: ${file.path}`),
    ...unexpected.map((file) => `not on the allow-list: ${file.path}`),
    ...findMissing(files),
    ...findBudgetProblems(files, budgets),
  ];
}

export function formatDistSummary(files, budgets) {
  const sizes = measureDist(files);
  return (
    `${files.length} files; JavaScript gzip ${sizes.jsGzipBytes} of ${budgets.JS_GZIP_BUDGET_BYTES} bytes; ` +
    `CSS gzip ${sizes.cssGzipBytes} of ${budgets.CSS_GZIP_BUDGET_BYTES} bytes; ` +
    `service worker gzip ${sizes.serviceWorkerGzipBytes} of ${budgets.SERVICE_WORKER_GZIP_BUDGET_BYTES} bytes; ` +
    `icons ${sizes.iconsBytes} of ${budgets.ICONS_BUDGET_BYTES} bytes; ` +
    `first visit transfers ${sizes.offlineTransferBytes} bytes`
  );
}
