# Release, offline mode and deployment

The game is a set of static files: there is no application server, no accounts and no analytics, and the
player's data stays in the browser. This document describes what a release consists of, how the game works
without a network and how it updates for the player, how a release reaches the hosting (Cloudflare Workers with
static assets) and how to roll it back.

## Package

`pnpm build` ends with the release step (`scripts/write-release.mjs`) and leaves in `dist/` exactly what is
deployed:

| File | Role |
|---|---|
| `index.html`, `assets/*.js`, `assets/*.css` | the page and the bundles with a content hash in the name; the fonts are in the style sheet |
| `manifest.webmanifest`, `icons/*.png` | installation on the home screen; the icons are drawn by the game's renderer (`scripts/make-icons.mjs`) |
| `licenses/silkscreen-ofl.txt` | licence of the fonts distributed in the style sheet |
| `release.json` | version (`version`), source commit (`sourceSha`) and content identifier (`contentId`) |
| `sw.js` | service worker with the list of the release's files and their SHA-256 hashes |
| `_headers` | response headers for the hosting; the host does not serve this file |

Next to it `dist.sha256` is made: the hashes of all files of the package in the `sha256sum --check` format.

Order of the release step: the bundler's output and the files from `public/` are the input; from them the
`contentId` is made (the hashes and paths of the input files and the worker's source), then `release.json`, then
the file list for the worker, and finally `sw.js`. Nothing depends on the time of the run: the same source gives
the same bytes. A commit that does not change the game (documentation, tests) gives the same `contentId`.

## Version

The version number has a single source: the field `version` in `package.json`, in the form of three numbers
(`0.4.2`). The build writes it into the game (`vite.config.ts`, `src/game/version.ts`), where it is visible in the
header of the main menu, in the jump menu and in the `?diag` overlay, and into `release.json`. Publication marks
the published commit with the tag `v<version>` and creates a GitHub release with the list of PRs since the previous
one (the `release` job).

A PR that changes the game raises the number by the step its title indicates (Conventional Commits): `feat` the
middle number, every other type the last one, a breaking change (`!`) the first one, and before 1.0 the middle
one. A PR that does not change the game (documentation, tests, workflow, tools) leaves the number alone. The game
is changed by the files the package is made from: `src/` (without tests), `public/`, `index.html`, the Vite and
TypeScript configuration, `package.json` apart from the number itself, the lockfile, `deploy/wrangler.jsonc` and
the release step (`scripts/lib/version-rules.mjs`).

```sh
pnpm version:bump "feat(ui): PR title"   # sets the number relative to origin/master; running it again changes nothing
```

Two checks enforce this: `hygiene` in the PR (`scripts/check-version.mjs`: the number agrees with the title and
the changed files) and `deploy` before publication (`scripts/compare-release.mjs`: a changed game must have a
number higher than the deployed one, otherwise nothing is published). Two PRs that change the game, merged one
after the other without refreshing the second, can carry the same number; then the second check stops the
publication and the number has to be raised in a new PR.

`pnpm check:dist` (`scripts/lib/dist-rules.mjs`) requires that `dist/` holds all the files from the list and
nothing else, no files of the original game, within the size budgets (bundles, worker, icons). The single-file
preview (`pnpm build:single`) goes to `dist-single/` and is not part of the package: it has no manifest, icons or
worker.

## Service worker

Source: `scripts/lib/service-worker-template.js`; the release step writes the file list into it. Rules:

- **Installation** fetches every file of the release, compares its SHA-256 with the list and only then writes
  everything into its own cache (`telemark-shell-<id>`). A missing file, different content, a redirect or lack of
  space ends the installation with an error and leaves no part of the release; the release that worked before
  stays untouched.
- **A new release waits.** The worker does not call `skipWaiting()` on its own, nor ever `clients.claim()`, and
  the page does not reload without the player asking. The page always gets the document and the scripts from one
  release, and a jump is not interrupted. The new release takes over the page at the next start after all game
  windows are closed or after "Zainstaluj teraz" (below). The jump menu then shows in a box "Jest nowa wersja
  gry: <numer>. Zamknij grę całkowicie [...] i uruchom ją ponownie", the main menu (at the top) a shorter box with
  a button; the number is given by the waiting worker (`version` in the release data and in the answer to the
  page's question about the release), a worker from before 0.10 does not know it and then the message has no
  number. The message appears only after 1.5 s of waiting: at the first start after an update the browser can for
  a moment report the new release as waiting before it takes over the page, and a message for that moment would
  flash.
- **Check and installation on demand.** The main menu has right after the version number (kept together with it
  when wrapping) an icon of an arrow in a circle (7 by 7 game pixels, a 24 px area): a borderless button in dimmed
  yellow, named "Szukaj aktualizacji" for the screen reader and in the tooltip, with a border in the high contrast
  theme, turning in quarter turns while checking (no motion with `prefers-reduced-motion`)
  (`registration.update()`); the result appears under the version in an `aria-live="polite"` region, in small
  print: "Sprawdzam...", "Masz najnowszą wersję.", "Jest nowa wersja gry. Pobieram ją.", "Gra jeszcze się
  zapisuje." (first visit, the first release is still being stored) or "Brak połączenia: nie można sprawdzić."
  (the browser does not tell a missing network from a missing server response). When a found release could not be
  stored (the worker was rejected before storing), the line changes to "Nie udało się pobrać nowej wersji: spróbuj
  później.". Further presses during the check do nothing. Without a worker (single-file preview, development
  server, insecure address) there is no button: there is nothing to check. In the main menu the box of the waiting
  release is short: "Jest nowa wersja gry: <numer>.", the button "Zainstaluj teraz" and under it "Albo zamknij
  wszystkie okna gry i uruchom ją ponownie."; the line next to the check button then stops speaking of a new
  version. After "Zainstaluj teraz" is pressed the page says "Instaluję..." (until then the button does nothing),
  sends the message `telemark:take-over` to the waiting worker, the worker calls `skipWaiting()`, and the page
  reloads once when that worker is active (tracked by its own state, not by a change of the page's controller, so
  it also works on a page loaded bypassing the worker, e.g. after Ctrl+Shift+R). When the waiting worker is
  rejected (a newer release replaced it) or the installation cannot start, the page says "Nie udało się
  zainstalować: spróbuj ponownie." and the button works again. The jump menu has no button: a reload would
  interrupt the jump. Other open game windows are not reloaded: they pass to the new worker and keep running on the
  code they started with; instead of the box of the waiting release they show "Gra zaktualizowała się w innym
  oknie: przeładuj, żeby jej używać.", in the main menu with the button "Przeładuj" (in the jump menu without it).
  A window recognises this by the release having waited while the page was served by an older worker, and this
  page not having asked for the installation. The start page of the new release removes the cache of the previous
  one at that point; a window of the old release has all its code loaded (the game does not load modules later),
  and a file the new release does not have it would get from the network.
- **The previous release stays stored until the page of the new one starts.** A takeover by the new worker removes
  nothing. The caches of other releases (only with the game's prefix) disappear when the worker serves its own
  start page from its own cache, unless a newer release is just being stored or waiting: its cache must stay. The
  player's save (localStorage, IndexedDB) is never read or changed by the worker.
- **Request handling:** only GET from the own address; `/` and `/index.html` give the start page, query parameters
  are ignored. A file from the release's list comes from its cache. A file outside the list, while another release
  is still stored, comes from that release, and when it is not there, from the network; the page (navigation)
  never comes from another release. When only the own release is stored, the worker leaves requests outside the
  list to the browser. An unknown path does not get the page as a substitute.
- **Registration** (`src/pwa/`, `src/ui/use-offline-state.ts`): only in the production build, at a secure address
  and when the page has the marker `<meta name="telemark-offline">`. The single-file preview does not have it. The
  menu shows "Gotowe do gry bez internetu." only when the active worker confirms the complete set of files.
- The first page of the first visit is not taken over by the worker; the game starts without a network from the
  next start.
- A start right after the last window is closed can once more get the page of the old release, and the browser
  switches the worker under it (observed in Chromium). The script of that page is then served by the new worker
  from the still stored old release, because the server no longer has it; the new release works from the next
  start. The game loads nothing later, so the releases do not mix; if the code is split into parts loaded during
  the game, this has to be revisited. Known gap: two windows started at the same moment, of which the first got
  the old page and the second already the new one; the start of the second removes the old release and the first
  may not get its script (the text with a reload link then stays).

When the game's script cannot be fetched (the page from one release, the script already from the next), the static
text from `index.html` with a reload link stays. The page does not reload by itself.

## Headers

A single source: `public/_headers` (the Cloudflare static assets format). The test server
(`scripts/serve-dist.mjs`) applies the same file, so the browser tests run under the production policy.

- All responses: `Content-Security-Policy` (own address only, no scripts or styles inlined in the page, fonts only
  as `data:`), `Permissions-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- `/assets/*`: `Cache-Control: no-cache`, like the other files. The long cache (`immutable`) was removed: the host
  also attaches the header to 404 responses, and for a few seconds after a deployment a file of the new release
  can be unavailable on the server that happens to answer (observed); the browser would keep such a response for
  a year. After the first visit these files are served by the service worker anyway.
- The page, `sw.js`, `release.json`, manifest, icons, licence: `Cache-Control: no-cache`.
- Rules matching the same path add up, and the same header from two rules would be joined with a comma, so no two
  rules set the same header for one path (a test enforces this).

Hosting configuration (`deploy/wrangler.jsonc`): static assets only, `html_handling: "auto-trailing-slash"`
(`/` returns the page, `/index.html` redirects to `/`; in mode `"none"` the host does not return the page at `/`),
`not_found_handling: "none"` (an unknown path is a 404), version preview addresses disabled.

## Deployment from CI

Workflow `CI` (`.github/workflows/ci.yml`), job `deploy`:

1. It runs after a `push` to `master` or after a manual run of the workflow on `master`, only when the repository
   variable `DEPLOY_ENABLED` has the value `true`, and only after a green `web`, `tools` and `hygiene` of the same
   run. PRs and the schedule never deploy.
2. The `build` job builds the package once, checks it and stores it as the artifact `telemark-dist-<commit>`
   together with `dist.sha256`. The jobs of the `browser` matrix (browser engines and the measurement mode) test
   this artifact in parallel, next to them the `checks` job runs the code checks and the unit tests, and the
   aggregate `web` is green only when all of them passed. `deploy` downloads the same artifact, checks the hashes,
   the complete set of files and the commit in `release.json`; it builds nothing.
3. If `master` already has a newer commit, the run ends without publication. If the deployed content has the same
   `contentId`, there is no publication (players do not download the game a second time), and the HTTP check
   checks what is deployed. A changed game with a number not higher than the deployed one ends the job with an
   error and no publication.
4. Wrangler, pinned in `deploy/` (its own lockfile, installed in frozen mode), publishes. Its output does not go to
   the log directly (`scripts/run-wrangler.mjs`): after success only the version identifier, after an error the
   text without account identifiers.
5. HTTP check (`scripts/check-deployment.mjs`): every file of the package responds with the same bytes, with the
   type and the headers from `_headers`; the bundles are compressed; `release.json` points to this commit and this
   version; `/index.html` redirects to `/`; unknown paths and `_headers` give 404; the HTTP address redirects to
   HTTPS. Exception: an address in a top-level domain that browsers open only over HTTPS (the HSTS preload list,
   e.g. `.dev`) may respond over HTTP without a redirect. `workers.dev` does this, and has no setting that forces
   the redirect; the check then records it in the report as a note.
6. The job summary gives the commit, the `contentId`, the hash of the `dist.sha256` list and the version
   identifier for a rollback.
7. After publication a separate `release` job (write access to the repository, no hosting credentials) creates the
   tag `v<version>` on the published commit and a GitHub release. A tag already on this commit stays; a tag on
   another commit (republication after a rollback) gives a warning without a new release.

Repository settings the workflow uses:

| Name | Kind | Purpose |
|---|---|---|
| `DEPLOY_ENABLED` | repository variable | `true` enables automatic publication; any other value suspends it |
| `PRODUCTION_URL` | repository variable | the public address of the game, without a path |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secrets of the `production` environment | publication and rollback; the environment is restricted to the `master` branch |

A pull request that changes `deploy/` or the workflow checks the tool without credentials: installation from the
lockfile and `wrangler deploy --dry-run` on the built package.

## Rolling back a release

Workflow `Rollback` (`.github/workflows/rollback.yml`), run manually on `master`:

1. Suspend automatic publication: `DEPLOY_ENABLED` set to a value other than `true`. The workflow refuses to work
   when publication is enabled, because the next push would deploy the newer release again.
2. Run the workflow with the version identifier (from the summary of its deployment) and the commit it was made
   from. The host restores a version it already has; nothing is rebuilt.
3. The HTTP check checks the deployment against the release recorded in the served `sw.js`: every file from its
   list responds with bytes of the given hash, and `release.json` points to the given commit.
4. Enabling publication again is a separate, deliberate step, when `master` contains a release to publish.

Checked by a trial on 2026-10-13 (a rollback by one version and back, each about 30 s): the host restores a
version together with its static files. After the rollback `/release.json` gave the commit and the content of the
earlier release, and the page pointed to its script, which responded with code 200.

Effects for players: the save is not touched. A player who already has the newer release gets the older one as
the next update, after closing all game windows. A rollback does not remove copies already running offline. The
releases before and after must read the same save; a rollback across a change of the save schema needs a separate
test.

## Monitor

The workflow `Monitor` (`.github/workflows/monitor.yml`) checks the published game from outside the hosting four
times a day (01:23, 07:23, 13:23 and 19:23 UTC) and on demand. It runs `scripts/monitor-deployment.mjs`, which only
reads:

1. `release.json` at the game's address gives the commit. It must be a commit from the history of `master`; a
   release restored by a rollback also meets this condition. The report gives how many commits `master` has after
   it. If the release gives a version, the tag `v<version>` must point to this commit (the tag is created about a
   minute after publication, so a run within that minute reports it missing); releases from before version
   numbers do not have it.
2. HTTP check against the release recorded in the served `sw.js` (the same as after a rollback), with the file
   `public/_headers` from the release's commit: the bytes of each file, the type, the compression of the bundles
   and the headers, also for `sw.js`; unknown paths give 404, `/index.html` redirects to `/`. A deployment in
   progress: the check waits up to 120 s, and when the release changes in the meantime, it starts over once.
3. The certificate is trusted, issued for the host name and has at least 14 days until it expires.
4. The start page responds in time: the median of 5 attempts up to 1500 ms.

A failed run is an alarm. GitHub notifies the person who last changed the schedule in the workflow file (for a
manual run: the person who started it), according to their Actions notification settings. Testing the alarm
without touching the game: `gh workflow run monitor.yml -f address=https://example.com`.

Limitations:

- Scheduled runs start with a delay, and in a public repository GitHub disables them after 60 days without
  activity in the repository.
- The monitor asks from a data centre and without a service worker: it does not see what a player with the
  installed game sees.
- The content is compared with the release the address itself gives, not with a package built anew; the agreement
  of the package with the commit is checked by the `deploy` job at publication.
- The thresholds (14 days, 1500 ms) are in `scripts/lib/monitor-rules.mjs`; the time threshold is set with a
  margin for an address that barely responds, not for a slower day.

## Locally

```sh
pnpm build                              # package in dist/ and dist.sha256
pnpm check:dist
node scripts/serve-dist.mjs             # dist/ at http://127.0.0.1:4317, with the headers from _headers
node scripts/check-deployment.mjs http://127.0.0.1:4317   # the same check as after a deployment
node scripts/monitor-deployment.mjs <game address>        # what the Monitor workflow does; reads only
node scripts/make-icons.mjs             # icons anew, after a change of the picture (src/pwa/icon-picture.ts)
node scripts/export-screen-glyphs.mjs glyphs.json   # screen font anew, after a change of src/render/pixel-font.ts,
python tools/font/make_screen_font.py glyphs.json src/ui/fonts/telemark-screen.woff2   # then this step
```

## What automation does not check

- Installation on the home screen, starting from the icon, the mode without the browser bar and real screen
  insets: no engine in the tests has these; the manual acceptance list is in `docs/testing.md`.
- The behaviour of the host, which the test server only imitates. The HTTP check after a deployment is the
  evidence for the real host; it also prints as a note which `Cache-Control` a 404 response under `/assets/` gets.
- How a rollback reaches a player with a newer release installed on a real phone (in the tests `offline.spec.ts`
  does this), and a rollback by more than one version.
