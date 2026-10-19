# Tests

## Kinds of tests

| File | What it checks | Where it runs |
|---|---|---|
| `src/sim/*.test.ts` | unit tests (generator, hill profile, deterministic functions) | everywhere |
| `src/sim/jump-sim.regression.test.ts` | a full jump on a synthetic hill with scripted input; the results and the state hash of every frame in a snapshot; also checks that the simulation step does not change the state it was given | everywhere, CI included |
| `src/sim/*.golden.test.ts` | frame-by-frame comparison with the original game | only with the game files and traces |
| `src/render/jump-view.pixels.test.ts` | hashes of all pixels of whole frames (14 moments of a jump, times of day, weather, view widths) in a snapshot; each further own hill has a smaller set in it under its own keys | everywhere, CI included |
| `src/render/scene-motion.test.ts` | invariants of the picture's motion throughout a bot's jump on each own hill, by day and at night, at a width of 480 and 356 in square pixels and 320 in the original's pixels. Props and line ends: places from the same functions the drawing uses; the distance from the top of the surface under them (fence, inrun rail, edge of the landing hill), read from the pixels drawn by that surface's function, does not change; the column shows its own table index (320) or a neighbouring index (square pixels); nothing moves back while the camera travels one way; the places do not depend on the picture's width apart from its offset. Birds: with the scrolling of layer 7 (horizontally up to 0.5 px, vertically up to 2 rows of bobbing); moon: one place in the sky per jump (the place depends on the picture's width); the wind box stays in place. These places are computed, not read from pixels | everywhere, CI included |
| `src/render/scene-anchor.guard.test.ts` | the files of `src/render` outside the places module (`scene-anchor.ts`) and the layer primitives do not call the low-level projection (`viewColumn`, `nearestViewColumn`, `layerRows`, `.camX`/`.camY`, `sceneView`, layer scrolling divided by the pixel width); `gatePlace` only for the start gate; `originalColumn` and `rowsAt` only in the files that draw surfaces; the source is read split into comments, strings, templates and regular expressions; exceptions with a justification in the test; in the files that draw surfaces the test cannot tell a surface row from a place computed by hand | everywhere, CI included |
| `src/original/test-support/scripted-jump.test.ts` | replay plan: the input of a scripted player on a synthetic hill comes back from the plan frame for frame | everywhere, CI included |
| `src/storage/original-replay-file.test.ts` | writing an `.rpl` file: the plan's fields at the described offsets, the header, the cipher and the checksum read back by the decoder | everywhere, CI included |
| `src/original/test-support/fall-search.test.ts` | fall search on a synthetic hill: each plan found, reproduced in the port, gives its fall type | everywhere, CI included |
| `src/sim/test-support/dsj-trace.test.ts` | reading and searching traces (plain and gzip) on small, artificial traces | everywhere, CI included |
| `tools/re/test_tools.py` | analysis tools (FPU, replay codec, replay from a plan, trace recording) | everywhere |
| `src/game/touch-landing.test.ts` | a jump with the touch areas stepped as on the jump screen: in flight the L area only leans, the P area starts a telemark, a new touch of L ends its preparation, and both areas at once land on two legs; keyboard and mouse unchanged | everywhere, CI included |
| `src/render/frame-time.budget.test.ts` | the time of the simulation step and of drawing the widest picture against the budget (described in "Performance measurement") | everywhere, CI included |
| `src/hills/*.test.ts` (without `*.local.test.ts`) | the format of own hills (strict data check, each own hill after a round trip through JSON), geometry rules (each rule on a modified copy of the training hill), the geometry fingerprint pinned for each own hill; described in [hills.md](hills.md); the picture tests in `src/render` that concern drawing hills (picture motion, props, scenery, figure, title, time budget, pixel snapshot) go through each own hill ([hills.md](hills.md), "Picture checks") | everywhere, CI included |
| `src/hills/hill-play.stability.test.ts` (`pnpm test:hills-stability`) | the same verdict of the simulation checks of each own hill on three disjoint samples; outside the ordinary run (`vite.config.ts` includes the file only with the variable `HILL_STABILITY=1`); described in [hills.md](hills.md), "Verdict stability" | locally after a change of hills, simulation or game; in CI (`checks`) when a change touches `src/hills/`, `src/sim/`, `src/game/`, the workflow, `package.json` or `vite.config.ts`, and when the changed files cannot be established |
| `src/hills/original-hills.local.test.ts` | own hills against the original's hills: none is too similar to a hill of the original, each plays within the range of the original's hills with a K point within 15 m of its own, the original's hills pass the format check; described in [hills.md](hills.md), "Hill similarity" | only with the game files (`DSJ2_GAME_DIR`), never in CI |
| `src/pwa/*.test.ts` | offline mode state and service worker registration on browser fakes; the icon picture | everywhere, CI included |
| `scripts/**/*.test.mjs` (`pnpm test:scripts`) | package and release rules, the headers file, the test server, the deployment check, icons and manifest, agreement of the screen font with the jump picture's characters; the service worker run on fakes of the cache and the network (installation, refusals, lack of space, activation, request handling) | everywhere, CI included |
| `e2e/*.spec.ts` | the built game in real browsers (Playwright), described below | CI: Chromium, Firefox, WebKit; locally: Edge |
| `e2e/perf/*.perf.ts` (`pnpm test:browser:perf`) | frame time on a slowed-down processor, memory after a series of jumps, start time (described in "Performance measurement") | CI: Chromium; locally: Edge |

The golden tests are skipped only when none of the variables described below is set (that is how CI runs). Once a
variable is set, a missing file it announces ends the test with an error naming the missing file. Traces and game
files do not go into the repository.

Tests that draw many whole frames or step a whole jump have an explicit time limit (30 s or 60 s instead of
Vitest's default 5 s), because on a loaded machine under `test:coverage` they take several seconds each.

A deliberate change of the look requires refreshing the pixel snapshot:
`pnpm test -u src/render/jump-view.pixels.test.ts`. The snapshot diff shows which scenes changed; a change in a
scene the work did not concern is an error.

## Performance measurement

The diagnostic mode is enabled by the key `diag` in the page address (`https://adres-gry/?diag`; the value of the
key does not matter). The address is read once, when the page loads; the mode has no switch in the settings and
stores nothing. Without it the jump loop measures nothing.

In the diagnostic mode an overlay refreshed once a second is visible in the bottom left corner of the picture
area:

| Line | Meaning |
|---|---|
| `60.0 kl./s` | frames per second, computed from the median frame interval |
| `klatka 16.7 / 17.0 / 33.4 ms` | interval between frames according to the browser's frame clock: median / 95th percentile / maximum |
| `sym. 0.1 / 0.2 / 0.6 · rys. 1.2 / 1.6 / 4.0 ms` | the time of all simulation steps in the frame and the time of drawing to the buffer and sending the picture to the canvas, in the same layout |
| `zgubione kroki 0.0 · długie klatki 0` | time the game did not make up (more than 8 steps per frame), converted to steps of 1/70 s, and the number of frames with an interval over 50 ms |

The distributions come from the last 4096 frames, the counters are from entering the jump screen (another jump
does not reset them). Frames of a stopped game (menu open) are not counted, and the first frame after the page
returns from the background is skipped. Browsers round the page clock (to 0.1 ms or to 1 ms), so simulation times
close to zero are approximate. The same numbers are in the overlay's `data-stats` attribute (JSON with the fields
`frames`, `steps`, `droppedSteps`, `cappedFrames`, `longFrames`, `intervalMs`, `simMs`, `drawMs`); the browser
tests read it.

Regardless of the mode the page sets two User Timing marks, each once per page load: `telemark:first-screen` (the
first animation frame after the first screen is shown) and `telemark:first-jump-frame` (the first jump picture sent
to the canvas). Reading in the console: `performance.getEntriesByName("telemark:first-screen")`; they are also
visible in the performance tab of the browser's tools.

`src/render/frame-time.budget.test.ts` measures the median time of the simulation step (jumps on the built-in
hill, batches of 100 steps) and the median time of drawing a 480 x 200 picture (until 2026-10-19: 432 x 200) and
compares them with budgets set to ten times the measurement from the day and the machine given in the file. It is
a tripwire for a regression of an order of magnitude (a loop within a loop, an allocation per pixel), not a
guarantee of smoothness: the time in Node on a computer does not say how many frames the game has on a phone. The
working of the overlay and the marks (not the performance) is checked by `e2e/diagnostics.spec.ts`.

### Measurements in the browser

Two sets measure the built game in the browser and compare the result with a budget.

**First visit** (`e2e/first-visit.spec.ts`, part of the ordinary set, desktop profiles in three engines). The
test sets up its own server on `dist/`; the server records for each request the status and the number of body
bytes actually sent, after compression (304 and HEAD are 0 bytes; a request without a response has no such
fields). Two measurement points:

- first screen: the requests of the page alone until the menu stands and the network has gone quiet. The page
  registers the service worker right after showing the menu and its requests would mix with the page's own, so
  this point is measured in a separate browser profile in which the worker cannot register;
- game ready without a network: all requests of a fresh profile up to the message "Gotowe do gry bez internetu.".

The test also counts the files whose full body the server sent more than once. During installation the worker
fetches every file of the release in `no-cache` mode: the browser's cache may answer only after asking the server.
In Chromium and in Firefox the browser then asks conditionally and gets 304 for what the page has already fetched,
so no file goes twice, and the test enforces this. WebKit in the browser tests does not answer the worker from its
cache: the page, the manifest, the script and the style sheet go in full a second time (measured on 2026-10-13 in
CI: 268 840 bytes until ready without a network instead of 142 275). The test allows that one extra copy there and
nothing beyond it. Whether Safari on a phone does the same has not been measured. Budgets and the measured values
of each engine: `FIRST_VISIT_BUDGET` and the constants next to it in the test file.

**Time and memory** (`e2e/perf/*.perf.ts`, a separate mode, Chromium only). Time tests cannot run alongside other
tests, because a busy machine drops simulation steps; the variable `BROWSER_TESTS_PERF` therefore switches the
configuration to a single project `perf-chromium`, one test at a time, with its own report
(`playwright-report-perf/`) and results directory (`test-results-perf/`). Without this variable the `*.perf.ts`
files are not run.

```sh
pnpm test:browser:perf        # Playwright's browser (this is how CI runs)
pnpm test:browser:perf:edge   # locally: Microsoft Edge from the system
```

| File | What it measures |
|---|---|
| `jump-frames.perf.ts` | one whole jump in `?diag` mode with the processor slowed down 4 times (`Emulation.setCPUThrottlingRate`) and, for comparison in the same log, three jumps without slowdown (the middle one is the measure): dropped steps, long frames, the 95th percentile of the frame interval, of the simulation time and of the drawing time (from `data-stats`) and the number and the longest of the long tasks (`PerformanceObserver`, `longtask`) from the start of the jump |
| `jump-cycles.perf.ts` | after 3 warm-up cycles 20 cycles "new jump from the menu, exit to the main menu, entering the hill again" (in every second one the jump runs for a second); before and after: the heap after a forced garbage collection, the number of event listeners, nodes and documents. Listeners and nodes are a more reliable measure than the heap: their growth is a leak |
| `start-times.perf.ts` | the time from the start of navigation to `telemark:first-screen` on the first visit (processor slowed down 4 times, network like "Slow 4G" in Lighthouse: latency 150 ms, 1.6 Mb/s down, 750 kb/s up) and on a repeat one, when the service worker answers (processor only); the time from pressing a hill on the list to `telemark:first-jump-frame`. 5 attempts each, the median is the measure |

The budgets are in one object `PERF_BUDGET` (`e2e/perf/perf-budget.ts`); next to each number are the date, the
machine and the measured values. Times and counters that depend on load have about three times the median of
three local runs, because the CI machine is different and shared. Counters that were the same in every run (the
growth of listeners and nodes: zero; frames with lost time without slowdown: at most one) have a budget equal to
the measurement.

Each measurement, also in a test that passed, goes to the run's output as one line starting with `PERF ` with a
JSON object (`measure` is the name of the measurement, `project` is the Playwright project, then the raw values,
including all attempts) and as an attachment `<nazwa>.json` in the HTML report. Reading from the log:
`grep '^PERF ' <log>`.

The result from the day the budgets were set (2026-10-13, a laptop with an Intel Core i7-6700HQ, headless Edge
155): with the processor slowed down 4 times the game shows 20 frames per second instead of 60, because drawing a
frame alone then takes 35 to 40 ms (median) with an interval of 16.7 ms, and it drops 20 to 35 simulation steps
per jump. Without slowdown it holds 59.9 frames per second; the only frame that is sometimes late by more than
114 ms and then drops 1 to 5 steps is the one at the first press on the picture (a single task of 85 to 130 ms,
once 187 ms, about 0.2 s after the jump screen opens).

The same set on the CI machine on the same day (one run, Playwright's Chromium on Linux): the machine is about 2.5
times faster than that laptop (drawing 2.4 to 2.7 ms without slowdown), so with the processor slowed down 4 times
the game holds 59.9 frames per second there (drawing 11.4 ms, median) and drops no steps, and the task at the
first press does not occur at all. The budgets set from the laptop are therefore loose in CI: a run in CI catches
a regression of an order of magnitude, and the state "20 frames per second" is visible only on a slower machine.

What these measurements do not tell:

- a slowed-down processor is not a phone: the emulation lengthens the work of the page's main thread, it does not
  imitate the graphics chip, the memory or overheating; smoothness on a device is checked on the device;
- time, memory and long tasks are not measured in Firefox and WebKit (processor control and heap reading go
  through the Chromium protocol); these engines have only the first visit measurement;
- the numbers come from one machine, and a budget with a multiplier of 3 catches a regression of several times,
  not of a dozen or so percent; smaller changes are visible only by comparing the `PERF ` lines of two runs on the
  same machine.

## Tests in browsers

`pnpm test:browser` runs Playwright on the built game, not on the development server. The `dist/` directory is
served by `scripts/serve-dist.mjs` (port 4317) the way the hosting does it: with the headers from `public/_headers`,
including the content security policy, with a real 404 for an unknown path and with a service worker that
registers as it does for a player. Each test starts from a clean browser context and ends with an error when any
page of that context reports an unhandled exception or writes an error to the console. A test that deliberately
breaks something (a missing script, a missing worker file) gives the pattern of the expected message through
`test.use({ expectedProblems })`; other errors still fail it. The environment is fixed in `playwright.config.ts`:
language `pl-PL`, time zone `Europe/Warsaw`, dark colour scheme, reduced motion.

Projects (device profiles):

| Project | Profile | Engine |
|---|---|---|
| `desktop-chromium`, `desktop-firefox`, `desktop-webkit` | 1280x720 window, mouse and keyboard | Chromium, Firefox, WebKit |
| `android-portrait`, `android-landscape` | Pixel 7 | Chromium |
| `iphone-portrait`, `iphone-landscape` | iPhone 14 | WebKit |
| `tablet-landscape` | iPad (7th generation) | WebKit |

What the files in `e2e/` check:

| File | What it checks | Projects |
|---|---|---|
| `smoke.spec.ts` | the page in Polish, menu transitions, the hill list, a jump and back; the picture drawn, the game's square pixels, the picture reaches the edge of its area also in a window, no scrolling on the jump screen | all |
| `jump.spec.ts` | a whole jump with the device's input (mouse buttons or touch areas), the record message together with the distance (before the judges' notes), the record on the hill list and in the save, also after a reload | all |
| `touch-layout.spec.ts` | the L and P areas: at least 44 px, outside the picture, beside the picture in landscape and below it in portrait; the pause button | phones and tablet |
| `tilt-controls.spec.ts` | tilt is the default: there are no L and P areas, the two halves of the screen are buttons and cover the whole screen, the picture is not smaller than with the areas (wider in landscape), the pause button lies above them, a touch of the right half starts the jump (the first thumb is the left button); a sensor without readings hands control to the finger for this visit, with a message, without saving; a browser that asks for permission gets the question above the menu buttons (yes: tilt, no or refusal: finger, saved and not asked again); in portrait a hint to turn the phone | phones and tablet, with a sensor faked in the page (the `motionSensor` option in `e2e/support/fixtures.ts`; without it the tests have no sensor and play with a finger) |
| `keyboard.spec.ts` | the menu, the hill list, the outfit and the jump screen with the keyboard alone: Tab order, visible focus, Enter and space; on the jump screen Esc opens the menu (focus on "Wróć do gry") and closes it (focus returns to the pause button), the manual opens in the menu and takes the focus, the exit to the hill list is a menu item | desktop |
| `a11y.spec.ts` | axe, WCAG 2.2 AA, zero violations on every screen; the test makes sure no screen was skipped | `desktop-chromium`, `android-portrait` |
| `settings.spec.ts` | sound, scenery and the sensitivity of the current control stay after a reload | `desktop-chromium`, `android-portrait` |
| `sim-engines.spec.ts` | the simulation gives in the browser's engine bit for bit the result from the snapshot of `jump-sim.regression.test.ts` (frames, distance, points, judges' notes, fall type, state hash) | desktops |
| `reflow.spec.ts` | the menu, the hill list and the outfit at a width of 320 px and at 200% zoom: no sideways scrolling, no clipped or overlapping elements; text spacing from WCAG 1.4.12; forced colours: controls, swatch colours and focus visible (without WebKit: Playwright imitates them there with a style element that the page's content policy does not allow) | desktops, `android-portrait` |
| `layout-stability.spec.ts` | a change of a setting and opening and closing the pause do not move the picture or the touch areas (the pixel differences go to the report); the first screen is drawn at once with the game's fonts, and the browser does not fetch them separately; the buttons below the picture on a desktop move when a label changes: a known bug, `test.fixme` | all |
| `targets.spec.ts` | every control meets WCAG 2.5.8 (24 by 24 px or spacing) and nothing covers it; with the pause open the keyboard focus does not go under it | all; focus: touch ones |
| `input.spec.ts` | both mouse buttons as a chord in both orders of pressing and releasing; a press shorter than a simulation step; a single Esc leaves the jump | desktops |
| `interruption.spec.ts` | turning the phone during a jump: a correct layout and the jump to the end; hiding the page: the test skips itself, because no engine run by Playwright hides the page | phones; hiding: none |
| `sound.spec.ts` | no audio context runs before the first gesture, one after it; sound switched off is silence at the output, also after a reload (`AudioContext` observed from the test) | all |
| `player-files.spec.ts` | a file that is not the game: a message in Polish, nothing is stored, the built-in hill available | all |
| `page-basics.spec.ts` | a separate page title for each screen; the background set on `html`; a new screen opens at the top, without the scroll position of the previous one | all |
| `version.spec.ts` | the main menu and the jump menu show the version number from `package.json`, and `release.json` gives the same | all |
| `first-visit.spec.ts` | first visit: the number of requests and the bytes up to the first screen and up to being ready without a network against the budget; in Chromium and Firefox no file is fetched in full twice, in WebKit at most once more (described in "Performance measurement") | desktops (three engines) |
| `offline.spec.ts` | after one visit the game starts and can be played without a network (a whole jump, the record after a reload); a first visit without a network gives no game; a new release waits while at least one window is open, then takes over the page, and the save stays; the check on demand says the version is the latest, and without a network that it cannot check; a found release after "Zainstaluj teraz" reloads only this window into the new version with the save kept, the jump menu does not offer the installation, and the second window is not reloaded and keeps working; a release with a missing or damaged file and a release swapped during the download leave no part and do not touch the working one; a rollback to an older release reaches a player with a newer one; after the takeover by the new release the page of the previous one still gets its script, and the previous release disappears only after the page of the new one starts; a missing script on the first visit leaves the text with a link, without a reload loop | desktops (three engines) |
| `http-policy.spec.ts` | the test server passes the same check as the deployment (`scripts/check-deployment.mjs`); the content policy, types and cache rules of the page, the worker, the manifest and the licence; the page does not block zooming | `desktop-chromium` |
| `single-file.spec.ts` | the single-file page fetches nothing beyond itself, does not register a worker also at a secure address, works without a network and in a frame | desktops |
| `safe-area.spec.ts` | with the screen insets set (the values of a phone in landscape) no content lies under a covered edge, on every screen | all |
| `two-windows.spec.ts` | two game windows: the record and the last jump from one and a jump kept in the second, which held an older list and an older save, stay in both after a reload; the record is the longer of the two jumps, and its replay is that jump | all |
| `storage-blocked.spec.ts` | with the storage blocked the game warns, works and keeps the settings until the end of the visit, without unhandled errors | `desktop-chromium`, `android-portrait` |

A jump runs in real time (70 simulation steps per second), so the test controls it by the page's clock, counted
from the message "Skok rozpoczęty." in the `aria-live` region next to the picture. The moments of the presses lie
in the middle of windows measured in the simulation on many seeds (described in `e2e/support/jump-timing.ts`; the
test `src/game/scripted-jump-timing.test.ts` checks that they give a clean landing with a margin of 0.1 s). A jump
that ends in a fall is repeated by the test, at most three times, as a player would do.

The regression scenarios of the simulation are in `src/sim/test-support/regression-scenarios.ts`; the Vitest test
and the test page use them. The page is built by the project's Vite before the tests (`e2e/sim-harness.setup.ts`)
into the ignored directory `e2e/.sim-harness/`; it does not go to `dist/`.

The offline mode tests have their own servers (`scripts/lib/static-server.mjs`), one per test, so they can cut off
the network, damage a response or substitute another release at the same address. Two releases and the
single-file page are prepared by `e2e/releases.setup.ts` from the tested `dist/`, with the project's release step,
in the ignored directory `e2e/.pwa-releases/`. The browser context is one profile: closing a page and opening a new
one in the same context corresponds to closing the game and starting it again. The player's save in these tests is
synthetic data; no file of the original game takes part in them.

The axe results marked as "incomplete" are neither a violation nor a pass: the test writes them to the file
`axe-incomplete.json` in `test-results/` and attaches it to the report.

### Locally

```sh
pnpm test:browser:edge   # only the Chromium projects, in the installed Microsoft Edge
```

The local mode (the variable `BROWSER_TESTS_EDGE`) downloads nothing: it uses the Edge browser from the system and
builds the game before the tests. Firefox and WebKit run only in CI. `pnpm test:browser` without the variable runs
all projects and needs Playwright's browsers (`pnpm exec playwright install chromium firefox webkit`); in CI it
tests the `dist/` built by the `build` job, outside CI it builds the game itself. The variable
`BROWSER_TESTS_ENGINE` (`chromium`, `firefox` or `webkit`) narrows the run to the projects of one engine. CI runs
the jobs of the `browser` matrix in parallel: Chromium in two parts and WebKit in three (`--shard`, because they
have the most profiles), Firefox and the measurement mode. The code checks and the unit tests run alongside in the
`checks` job; the aggregate `web` job waits for all of them. In the local mode the tests refuse the game pointer
lock: a headless browser can still take the cursor of the whole machine for the duration of a jump. The game then
works without the lock; the path with a locked mouse is checked by CI, as far as the engine allows it.
The HTML report goes to `playwright-report/`, the traces and screenshots of failed tests to `test-results/` (in the
measurement mode: `playwright-report-perf/` and `test-results-perf/`). CI stores these directories as the artifacts
`playwright-report-<zestaw>-<silnik>-<część>` (e.g. `playwright-report-browser-webkit-2`,
`playwright-report-perf-chromium-1`; 7 days) when the tests failed, and also when a test passed only on a retry:
the run is then green, and the trace of the failed attempt is the only record of the cause.

Emulation is not a device: the phone and tablet profiles set the window size, the pixel density, touch and the
browser header, but the engine stays a desktop one. No engine in the tests installs the page on the home screen,
has real screen insets or a mode without the browser bar; the tests check the manifest, the icons and what the
layout does with the given insets. What the tests do not see is checked by hand (below).

### Manual acceptance on a device

A list for about ten minutes: a real phone (Android with Chrome or an iPhone with Safari) and one browser on a
computer. For each item: the test that covers it automatically, or "device only".

| No. | Step | Expected result | Coverage |
|---|---|---|---|
| 1 | Open the page from its address; on a phone add it to the home screen and open it from there | menu in Polish, pixel font, tab title "Telemark" | `smoke.spec.ts`, `page-basics.spec.ts`; adding to the home screen: device only |
| 2 | Training, the Ćwiczebna hill; listen before touching the jump screen | silence until the first touch, then wind | `sound.spec.ts`; a real speaker: device only |
| 3 | iPhone: the mute switch on, then off | the game's sound is audible in both positions (the game has its own switch) | device only |
| 4 | Pause, "Dźwięk: wył.", return to the game | silence; after switching it on again the sound returns | `sound.spec.ts` |
| 5 | The first jump after installation on a phone; then pause, "Pochylanie" | Android: tilt at once, without a question. iPhone: the menu asks whether to lean by tilt; "Tak" shows the system's question about the motion sensor, after consent tilt, after refusal a message and leaning with a finger; "Nie, palcem" is remembered. In portrait briefly a hint about turning the phone; the game works in both orientations | the run with a faked sensor: `tilt-controls.spec.ts`; a real sensor and the system's question: device only |
| 6 | A jump leaning by tilting the phone, in portrait and in landscape; on the gate hold the phone differently than in flight, in flight turn it slowly and fast | there are no L and P areas: touching the screen starts the jump, two thumbs at once take off, in flight one thumb is a telemark (the second after a moment fixes its width), two at once is a two-legged landing; the jumper leans as much as the phone turned, and stays so when the phone is still; the whole lean range is just under 9 degrees of rotation; the picture takes the whole width and is centred vertically, and the pause button is in the top left corner of the screen, it cannot be hit by accident while playing, and the hill name begins next to it, not under it | layout and start by touch: `tilt-controls.spec.ts`; conversion of rotation to lean and the order of thumbs: `src/game/feedback.test.ts`, `src/game/player-input.test.ts`; sensor and feel: device only |
| 7 | Android: a jump with vibrations on, then "Wibracje: wył." | a short vibration at the start, the takeoff and the landing; none after switching off. The iPhone has no vibrations for web pages and does not show the "Wibracje" button; an attempt to replace them with the tap of a system switch gave no perceptible effect (iPhone XS Max, iOS 18.7) | device only |
| 7a | Pause, "Czułość": decrease and increase, make a jump at 1 and at 10; repeat in finger and tilt mode | the same movement of the mouse, the finger or the phone leans the jumper less at 1 and more at 10 (each step is 10%); each control method remembers its own value, also after the game is opened again | saving and conversion: `src/game/sensitivity.test.ts`, `settings.spec.ts`; feel: device only |
| 7b | Computer: press Esc during a jump; in the menu switch on "Pełny ekran", return to the game, press Esc again; also try F11; in the menu open "Zmień skocznię", go back, choose another hill, finally "Wyjdź do menu głównego" | there is no button bar below the picture; in full screen (also after F11) the picture reaches the edges of the screen, in a window it scales by whole pixels; Esc stops the jump and opens the menu (in full screen the browser may first leave it), "Wróć do gry" or Esc resumes the jump at the same place; the mouse is free in the menu; "Zmień skocznię" opens the hill list in the menu: "Wstecz" returns to the menu, and choosing a hill starts a jump on it; training is left with the item "Wyjdź do menu głównego" | `keyboard.spec.ts`, `input.spec.ts`, `smoke.spec.ts` (Esc, menu, hill list, exit); full screen and pointer lock: device only |
| 7c | Main menu, "Jak skakać"; the same from the pause menu on the jump screen; on a phone in finger mode and in tilt mode | the manual speaks of what is used for control: mouse and keyboard, the L and P areas, or thumbs and tilt; it describes the start, the takeoff, the flight, the telemark with its width, the two-legged landing, the next jump and the menu | content: `src/ui/how-to-jump-text.test.ts`; opening and focus: `keyboard.spec.ts`; screen layout: `reflow.spec.ts`, `targets.spec.ts`, `safe-area.spec.ts` |
| 7d | Main menu in the browser, "Gra jako aplikacja"; then the same menu in the game started from the icon | the manual describes adding the game to the home screen on an iPhone and on Android and installation on a computer; in the game started from the icon this item is absent | screen layout: `reflow.spec.ts`, `targets.spec.ts`, `safe-area.spec.ts`; order in the menu: `keyboard.spec.ts`; absence of the item after installation and the steps themselves: device only |
| 7e | Computer: look at the corner of the jump screen and the menu; switch "Pełny ekran" and "Podpowiedzi na skoczni" on and off; in the main menu choose "Wyłącz grę" | in the corner there is the text "ESC: MENU" instead of the pause sign and there is no yellow frame around it after the menu is closed with a key; the menu has "Wróć do gry (Esc)"; "Pełny ekran" shows "wł." or "wył." according to the state; with the hints off the picture shows no instructions (start, takeoff, flight, next jump); switched on they do not blink; "Wyłącz grę" closes the window of an installed game or of one opened in a new tab, and where the browser does not allow this, information appears on how to close the tab | focus after closing the menu: `keyboard.spec.ts`, `targets.spec.ts`; hints: `src/render/jump-view.test.ts`; closing the window and full screen: device only |
| 7f | Main menu, "Ustawienia"; change the sensitivity, scenery, sound and hints, go back and enter a hill; on a computer switch full screen on with the F11 key and try to switch it off with the item "Pełny ekran"; in an ordinary tab choose "Wyłącz grę" | the same settings as in the jump menu are available without entering a hill and apply on the hill; after F11 the item shows "Pełny ekran: wł.", and choosing it says that this full screen is switched off with the F11 key; the information under "Wyłącz grę" is in a box and gets the focus; the menu button on the jump screen does not touch the edge of the picture | layout and order: `reflow.spec.ts`, `targets.spec.ts`, `keyboard.spec.ts`; the browser's full screen and closing the tab: device only |
| 7g | Computer, the game in a browser window (not in full screen): enter a hill and change the size of the window; in the main menu choose "Wyłącz grę". Phone in portrait, finger control: enter a hill; open the settings with the long text "Podpowiedzi na skoczni: wył." | the picture reaches the edge of the window (bars stay only with a very wide or very tall window), and "ESC: MENU" lies in its corner next to the hill name; the information under "Wyłącz grę" is justified to both edges of the box, without large gaps between words; the pause button is on the left; the text wrapped to two lines is centred | filling the area: `smoke.spec.ts`; pause on the left: `touch-layout.spec.ts`; text alignment and look: by hand only |
| 8 | A whole jump with the L and P areas in portrait, then in landscape; in flight lift the finger from the L area and put it back, land with the P area | the areas do not cover the picture; in flight the L area only leans and the finger's return does not start the landing; the P area starts a telemark, a second touch of P (or a new touch of L) ends its preparation and so fixes the width, and the L and P areas touched together land on two legs (lower judges' notes, safer with a very long jump); after the judges' notes appear the L area at once starts the next jump, also while the jumper is still riding; the record appears on the hill list | `jump.spec.ts`, `touch-layout.spec.ts`; the rule of the L area in flight and the two-legged landing: `src/game/touch-landing.test.ts` (simulation, without a browser) |
| 9 | Turn the phone during the inrun | the layout rearranges, the jump can be finished | `interruption.spec.ts` |
| 10 | In landscape look at the area around the screen notch and the gesture bar, also with the pause menu open | nothing important under the notch or under the bar, no white bars next to the picture; a pause menu that does not fit scrolls, and its buttons end above the gesture bar instead of going under it | `page-basics.spec.ts` (background); notch and bar: device only |
| 11 | During a jump switch to another app for a few seconds and come back | the sound stops at once, after the return the jump continues from the same place | device only (`interruption.spec.ts` skips this test) |
| 12 | During a jump lock the screen, unlock it | as in item 11 | device only |
| 13 | Menu, "Wczytaj pliki gry", choose `Dsj.exe` from your copy; close the browser and open the page again | 37 hills from the original on the list also after reopening | device only and your own copy of the game; refusal for a foreign file: `player-files.spec.ts` |
| 14 | Screen reader (VoiceOver or TalkBack): go through the menu, the hill list and the outfit | each button and colour has a name, after a screen change its heading is read | `a11y.spec.ts`, `keyboard.spec.ts` (focus); the reader's speech: device only |
| 15 | Make one jump with a screen reader | "Skok rozpoczęty." is heard, then the landing or the fall with the distance, finally the judges' notes and the result with a decimal comma | content of the messages: `jump.spec.ts`; the reader's speech: device only |
| 16 | Computer: a jump with the mouse (both buttons at the takeoff), Esc during it | the mouse is locked for the duration of the jump, a single Esc stops the jump and opens the menu | `input.spec.ts`; the behaviour of Esc with a real pointer lock: device only |
| 17 | Computer: go through the whole game with the keyboard alone; zoom the page to 200% | the focus always visible, nothing escapes off the screen | `keyboard.spec.ts`, `reflow.spec.ts` |
| 18 | Phone: add the game to the home screen and start it from the icon | an icon with a jumper without white corners and without the figure cut off, the name "Telemark", the game without the address bar | manifest and icons: `pnpm test:scripts`; installation and the look of the icon: device only |
| 19 | Wait in the menu for "Gotowe do gry bez internetu.", close the game, switch on airplane mode, start it from the icon and make a jump | the game starts, the jump and the record work, sound after the first touch | `offline.spec.ts` (Chromium, Firefox, WebKit on a desktop); phone: device only |
| 20 | Started from the icon: both orientations, the area around the notch and the gesture bar, the L and P areas, pause | nothing under the notch or under the bar, black background to the edge | `safe-area.spec.ts` (insets given by the test); real insets: device only |
| 21 | After a new release is published: open the game, wait for the box "Jest nowa wersja gry: <numer>" at the top of the menu (and in the jump menu), close all game windows and start it again | until closing the old release runs, then the new one; settings, records and the remembered game files stay | `offline.spec.ts`; on a phone and with a real game file: device only |
| 22 | Started from the icon: switch to another app and come back; lock and unlock the screen | the game returns to where it was, without a white screen and without reloading during a jump | device only |
| 23 | Open the game in the phone's browser with `?diag` at the end of the address, make three jumps and after the third note the numbers from the overlay in the corner of the picture | dropped steps 0.0; frame interval in line with the screen refresh (about 16.7 ms at 60 Hz, 8.3 ms at 120 Hz) | device only (the working of the overlay: `diagnostics.spec.ts`) |
| 24 | On a phone make a jump, in the menu "Obejrzyj ostatni skok"; touch the picture, wait, touch again; in the menu "Tempo" down to 1/4; after the judges' notes touch the picture | the jump replays as it was (the same distance), without vibrations, with sound; a touch stops and resumes; at tempo 1/4 the jump and the sound clearly slower; after the judges' notes a touch starts a new jump, and the record does not change | playback and no vibrations: `src/ui/jump-runs.test.ts`; pause, distance, record: `replay.spec.ts`; feel and sound in slow motion: device only |
| 25 | With `Dsj.exe` loaded: main menu, "Powtórki", choose an `.rpl` file from the game directory (e.g. `KARPACZ.RPL`); after the judges' notes touch the picture, then "Skacz na tej skoczni" | the replay plays on the hill from the file, with the jumper name from the file in the bar (with Polish letters) and ends with the distance stored in the file (89.92 m for `KARPACZ.RPL`); in the replay menu there are no control settings and no "Wróć do skakania", there are "Wróć do powtórek" and "Skacz na tej skoczni"; a touch after the judges' notes opens this menu; then training on this hill | agreement of the motion with the original: golden tests (`run-golden.mjs`); reading the file and the same path as in the tests: `src/ui/original-replay-choice.test.ts`; screen and refusals: `replays-screen.spec.ts`; a real player's file: by hand only |
| 26 | On an iPhone with sound on make a jump, lock the screen, then return to the game; the same with switching to another app | on the lock screen the playback panel shows "Telemark", "Trening: <skocznia>" and the game's icon (or does not appear at all); nothing plays in the background; after the return the sound comes back, at the latest after the screen is touched | pausing and the panel data in the browser: `sound.spec.ts`; the iOS lock panel and background sound: device only |
| 27 | Before the end of the first jump open the menu (under the greyed "Obejrzyj" and "Zachowaj" there is an explanation), then make a jump with a new record; when the jumper stops, under "KLIKNIJ: JESZCZE RAZ" appears "W MENU: OBEJRZYJ LUB ZACHOWAJ SKOK"; in the jump menu "Zachowaj ostatni skok", reload the game and open "Powtórki"; watch both replays, delete the kept one; in "Ustawienia powtórek" at the bottom of the "Powtórki" screen check "Zapisuj ostatnie skoki" (5 from the start) and switch on one of the cleanups; watch a replay from the list after changing the scenery in the settings | the record and the kept jump are on the list with their size also after a reload, they play to the same distance; the numbers have a comma, and the size is not split between lines; deleting needs a second touch, and the message stands in a box under that replay; further jumps go to "Ostatnie skoki", and old ones disappear according to the setting, records stay; with a record the button "Zachowaj na stałe"; a replay has the time of day and the weather of its jump | shelf, limits and cleanup: `src/storage/replay-shelf.test.ts`; playback agreement: `src/ui/shelf-replays.test.ts`; the player's path: `saved-replays.spec.ts`; replay scenery: `jump-runs.test.ts`; phone (saving after the app is closed): device only |
| 28 | On an iPhone in "Powtórki" select replays and "Eksportuj zaznaczone"; save the file in Files or send it; on a second device (or after deleting) "Wczytaj powtórki" and choose this file; also load an `.rpl` file | on a phone the share sheet opens, on a computer the file downloads; a single replay is the file `telemark-powtorka_<data>_<godzina>_<skocznia>.json`, several are a `.zip` archive with a separate file per jump; a file, an archive (also packed by another program) and an `.rpl` can be loaded; after loading the replays are in the group "Wczytane" at the end of the list and play to the same distance; loading a second time says they are already kept; a loaded `.rpl` plays and stays in "Wczytane" | format, import and limits: `replay-file.test.ts`, `replay-import.test.ts`, `input-codec.test.ts`, archives: `zip-file.test.ts`, `replay-files.test.ts`; sharing and downloading: `hand-over-file.test.ts`; the path in the browser with a download: `saved-replays.spec.ts`; the iOS sheet and Files: device only |
| 29 | On a phone in portrait watch a replay, once with finger control, once with tilt; move the slider "Moment powtórki" under the picture; in the replay menu switch the slider off; on the hill list touch "Powtórka" at a hill with a record | in a replay the picture is in the middle of the screen, of the same size as in a jump, with both control methods; the slider follows the replay, under the finger it stands still and moves the replay to the chosen moment without an avalanche of judges' notes sounds; switched off it disappears; the button on the list plays this hill's record | seeking: `src/ui/jump-runs.test.ts`; record replay: `src/ui/shelf-replays.test.ts`; slider, layout and button: `replay.spec.ts`, `saved-replays.spec.ts`; the feel of the slider under a finger: device only |
| 30 | On a hill with a record make a jump, then in the jump menu (or in "Ustawienia") switch off "Duch rekordu" and jump again | a semi-transparent, bluish-white record ghost starts from the gate together with the jumper and lands where the record did; the player's jumper is always above it; after switching off there is no ghost; the smoothness of the jump on a phone unchanged | synchronisation and landing of the ghost: `src/ui/jump-runs.test.ts`, `src/ui/record-ghost.test.ts`; drawing: `src/render/jump-view-ghost.test.ts`; the switch: `saved-replays.spec.ts`, in the jump menu: `replay.spec.ts`; visibility on a phone screen and smoothness: device only |
| 31 | (The `.rpl` export is disabled since 0.11.1; an item to check after it is enabled again.) On a hill from the original make a few jumps, in "Powtórki" press "Eksportuj .rpl" at one of them, then select all and "Eksportuj zaznaczone do .rpl"; copy the files to the DSJ2 directory and watch them in the original's replay studio; in the replay menu of the last jump press "Zachowaj ostatni skok" | the file downloads or goes to sharing, several files in one `.zip` archive; the message stands in a box under the replay or under the buttons of the selected ones (red when it failed, with the cause); the original shows the files on the list with the distance, the name "GRACZ 1" and the date and plays the same jump; a jump saved "z drobną różnicą" has the same result in the original; at an own hill there is no button | saving and checking by playback: `src/storage/original-replay-file.test.ts`, `src/ui/rpl-export.test.ts`, archive: `src/storage/zip-file.test.ts`; messages, no button at an own hill: `saved-replays.spec.ts`, `replays-screen.spec.ts`; keeping from the replay menu: `replay.spec.ts`; playback in the original: measurements in the emulator of 2026-10-15 (`docs/replay-format.md`), otherwise by hand (the browser tests have no hills from the original) |

A game started from the icon has no address bar, so the measurement of item 23 is made in a browser tab.

During acceptance note the device model, the system version, the browser with its version and the game release
(the commit from the address `/release.json`). When something fails, note: the step number, the device and the
system version, the browser with its version, the orientation, whether the page was opened from the home screen,
what was seen or heard (a screenshot or a recording) and whether the error repeats after a reload of the page.

## Code coverage

`pnpm test:coverage` runs the same tests with coverage measurement (v8), and that is how they are run in CI.
Measured are `src/sim` (without `src/sim/data`), `src/storage` and `src/hills`, without tests and `test-support`
directories. Each directory has its own thresholds (statements, branches, functions, lines) in `vite.config.ts`,
set two points below the values measured without the game files, because that is how CI runs; with the traces the
coverage of `src/sim` is higher. The thresholds are only raised when the coverage grows, never lowered. The HTML
report goes to `coverage/`.

A file named like a test (`*.test.*`, `*.spec.*`, `test_*.py`) that no test runner runs fails
`pnpm test:scripts` (`scripts/lib/test-location-rules.mjs`).

## Golden tests against the original

Environment variables:

- `DSJ2_TRACE_DIR`: a directory with files `<nazwa>.trace` or `<nazwa>.trace.gz`, named like the replay they
  record.
- `DSJ2_GAME_DIR`: a directory with `.rpl` files (searched case-insensitively).
- `DSJ2_TRACE`: a single trace, when no directory is given.

```sh
DSJ2_TRACE_DIR=/ścieżka/traces DSJ2_GAME_DIR=/ścieżka/gra pnpm test
```

No case disappears silently. Which files are required is decided by `src/sim/test-support/golden-files.ts` (the
tests in `golden-files.test.ts` run everywhere, on files created in a temporary directory):

| Set | Required | Effect of absence |
|---|---|---|
| `DSJ2_TRACE_DIR` | the directory can be read and contains at least one `.trace` file | an error in every test that uses traces |
| `DSJ2_TRACE_DIR` | `hills.hilltrace` and `Dsj.exe` and `Dsj.dat` in `DSJ2_GAME_DIR` | an error in `original-hills.golden.test.ts` |
| `DSJ2_TRACE` (without a directory) | the given file exists | an error in every test that uses traces |
| any trace variable | `<nazwa>.rpl` in `DSJ2_GAME_DIR` for each trace `<nazwa>.trace` | an error in `jump-sim.golden.test.ts` with the list of traces without a replay |
| `DSJ2_GAME_DIR` | `Dsj.exe` and `Dsj.dat` | an error in `original-hills.golden.test.ts` and `src/hills/original-hills.local.test.ts` |
| `DSJ2_TRACE_DIR` | at least one `.cputrace` file and one `.cuptrace` file (computer jumps) | an error in `cpu-pilot.golden.test.ts` |

When `DSJ2_TRACE_DIR` is set, the variable `DSJ2_TRACE` is not taken into account, also when the directory cannot
be read. `DSJ2_GAME_DIR` alone (without traces) runs only the hill reading tests; the comparison of the profiles
with the trace `hills.hilltrace` is then skipped. Each trace test further requires that at least one frame
comparison is made from the trace; a trace without matching pairs of snapshots ends the test with an error.

Recording a trace (the game runs in the DOS emulator from `tools/re`, without DOSBox):

```sh
pip install -r tools/re/requirements-dev.txt
python3 -I tools/re/trace_capture.py <katalog-gry> <katalog-roboczy> <numer-powtórki> <wyjście.trace> [max-ticks]
```

`<numer-powtórki>` is the position on the list in the replay studio (from 0, alphabetically).

A trace is about 86 MB, and gzip reduces it about 80 times **[measurement]**. When the output name ends in `.gz`
(`<nazwa>.trace.gz`, `hills.hilltrace.gz`), `trace_capture.py` and `hill_capture.py` write a compressed trace; the
tests and `craft_replays.py set-distance` read both forms. The same trace in both forms at once in
`DSJ2_TRACE_DIR` is an error (one of them is stale): the tests stop with the name of the trace.

### Hills

```sh
python3 -I tools/re/hill_capture.py <gra> <katalog-roboczy> <DSJ2_TRACE_DIR>/hills.hilltrace.gz
```

It records the state of the original after each of the 37 hills is set up (about 100 s per hill, measured on
2026-10-12); the test `original-hills.golden.test.ts` compares the reading from `Dsj.exe` with it. It also needs
`Dsj.exe` and `Dsj.dat` in `DSJ2_GAME_DIR`.

### Computer jumps

The jumps of computer-controlled opponents have no replays: the original plays them itself in the World Cup.
`cpu_capture.py` goes through the menu in the emulator (sound settings, World Cup, participants without player 1,
so eight opponents jump, optionally the choice of hills, the start of the cup, the start list; it clicks on past
the results after the first round) and records a trace of each jump:

```sh
python3 -I tools/re/cpu_capture.py <gra> <katalog-roboczy> <wyjście> <nazwa> [--skip-hills N] [--watch]   [--levels L1,..,L8] [--jumps A-B] [--seed J:HEX] [--max-ticks N] [--shots]
```

- `<wyjście>/<nazwa>-NN.cputrace.gz`: jump NN of the competition (1..16: two rounds of eight jumpers), from the
  call of the jump session (0baf:cc6e) to the next one. Besides the four frame points the trace has snapshots at
  the entry and the exit of the pilot setup (0baf:8aeb, points 5 and 6) and at the exit from the jump loop
  (0baf:d1f9, point 11).
- `<wyjście>/<nazwa>.cuptrace.gz`: snapshots before and after the drawing of talents at the start of the cup
  (points 7 and 8) and of the form at the start of the competition (9 and 10).
- `--skip-hills N` deselects the first N hills of the cup, so the competition takes place on the next one (by
  default Finland K105); `--watch` selects watching the opponents' jumps (the jumps are drawn); `--levels` writes
  the opponents' levels into the competitor list before the start of the cup, as the jumper editor does
  (5 = random); `--seed J:HEX` replaces the seed at the entry of the pilot setup in jump J. This is a patch of the
  generator: it forces a branch that happens rarely in an ordinary game (a failed jump, the limits of the takeoff
  time).

The test `src/sim/cpu-pilot.golden.test.ts` compares for each `.cuptrace` the drawing of talents and form (bit for
bit, including the seed), and for each `.cputrace`: the pilot setup from the record and the seed at the entry (bit
for bit), the input and the pilot's state in every frame from the snapshot of the input reading (bit for bit), the
starting state of the jump (with the fields the original does not reset between jumps) and the whole jump from the
seed after the setup: every frame (relative tolerance 1e-5), the frame of the end of the loop, the distance, the
judges' notes and the points.

### Replays for any hill

The replays from the distribution cover 6 of the 37 hills. For the others a replay has to be made: the input (the
frames of the buttons and of the mouse movement) depends on the length of the inrun, so the port plans it, and the
original plays the finished replay.

```sh
# 1. Plan: the port jumps on the hill read from the player's Dsj.exe, the input goes to <plany>/HILLnn.json
node scripts/plan-replays.mjs <gra> <plany> [numer-skoczni ...]      # without numbers: all 37
# 2. Replay from the plan; the base replay (any from the game) gives only the names and the date
python3 -I tools/re/craft_replays.py from-plan <gra>/Karpacz.rpl <plany>/HILL32.json <kopia-gry>/HILL32.RPL
# 3. Trace: <kopia-gry> contains the game files and this one replay (number 0)
python3 -I tools/re/trace_capture.py <kopia-gry> <katalog-roboczy> 0 <ślady>/HILL32.trace.gz
# 4. The distance measured by the original goes into the replay
python3 -I tools/re/craft_replays.py set-distance <ślady>/HILL32.trace.gz <kopia-gry>/HILL32.RPL
# 5. Golden tests
DSJ2_TRACE_DIR=<ślady> DSJ2_GAME_DIR=<kopia-gry> pnpm test
```

The plan (`src/storage/original-replay-file.ts`, the scripted player in
`src/original/test-support/scripted-jump.ts`) is the input of a jump in the form a replay holds it
(`docs/replay-format.md`): the start frame, the start of the takeoff window and its 20 bytes, the mouse movement
with the first and the last frame, the frames of the landing buttons, the generator seed and the wind. It comes
from a run of the port with the scripted player; an input the replay cannot hold is rejected. The plan file also
contains the port's result (`expected`: the number of frames, the distance, the fall type), that is what the
original should show. The seed of hill n is 21000 + n, and the wind is drawn from this seed as in training, so the
plans are repeatable.

`plan-replays.mjs` loads the TypeScript modules through Vite's module server (`scripts/lib/load-typescript.mjs`):
the sources import without extensions, which Node does not resolve by itself, and Vite is already a dependency of
the project. The script reads `Dsj.exe` and `Dsj.dat` from the given directory and writes only to the plans
directory.

`from-plan` does not write the distance: without `set-distance` the test of the whole jump does not pass, so the
distance from the port cannot be mistaken for the distance from the original.

Checked on hill 32 (K250, the largest) **[measurement, 2026-10-12]**: the original accepted the replay from the
plan, the jump had 1477 frames and 249.69 m in it, as in the port, and five golden tests with the trace passed
(jumper step: 1469 of 1469 frames bit for bit). Recording the trace took about 9 minutes; the trace has 5876
snapshots and 1.6 MB after compression.

`trace_capture.py` ends the recording when the jump loop ends, at the latest after `max-ticks` clock ticks (the
fifth argument, 3000 by default). The earlier limit of 1500 was enough for about 990 frames and cut off the trace
of a long jump in flight **[measurement]**.

### Crafted replays (falls, telemark)

The replays from the distribution end with a clean landing, so they do not check falls.
`tools/re/craft_replays.py` creates from the Karpacz replay variants with a changed input:

| Name | Input change | What it checks in the original |
|---|---|---|
| NOLAND | no landing button | fall of type 4, bounces |
| WILD | no landing, violent leans in flight | fall of type 4 with a different course of the flight |
| LATE | landing button 8 frames later | fall of type 4 |
| EARLY | takeoff buttons held until leaving the takeoff, landing preparation right after the takeoff | phases 6 and 9, fall of type 2 |
| TELEMARK | second landing button in the air | phase 9, clean landing |

```sh
python3 -I tools/re/craft_replays.py make <gra>/Karpacz.rpl <wyjście>
# store each replay in a separate game directory (the only replay, number 0), then:
python3 -I tools/re/craft_replays.py set-distance <NAZWA.trace.gz> <NAZWA.RPL>
```

`set-distance` writes into the replay the distance measured by the original (the last snapshot of the trace),
because the changed input invalidates the distance stored in the header.

The variants were chosen by searching the inputs in the port (about 4600 combinations of buttons and leans), and
then recording the traces of the chosen ones in the original.

### Fall search

The fall type (1..5) is the number of the landing assessment component that together with the mean exceeded the
threshold of 60; when several exceeded it, the highest number stays (`landClean` in `src/sim/jump-logic.ts`).
Components: 1 impact force, 2 landing preparation time (or a landing before the takeoff), 3 unfinished position of
the torso and the shins, 4 leg spread (landing without preparation), 5 bent legs.

```sh
node scripts/search-falls.mjs <gra> <plany>
```

The script plays in the port 257 input patterns on each of the 37 hills (8 takeoff variants: on time, too early,
much too early, late, past the takeoff, with one button, held, no takeoff; 4 lean variants: forward, none,
backward, violent; 8 landing variants: on time, no button, right after the takeoff, too early, late, very late,
after contact, telemark; in addition a jumper who does not leave the gate), prints how many jumps ended with each
fall type, and stores the plan of one case per type as `<plany>/FALLn.json`. It takes about 3 minutes. From the
plan a replay and a trace are made as in the section "Replays for any hill".

Result **[measurement in the port, 2026-10-12]**: 9509 jumps, every input fits in a replay.

| Type | Jumps (past the takeoff) | Hills | Patterns | Case stored as a plan |
|---|---|---|---|---|
| no fall | 2418 (2381) | 37 | 90 | |
| 1 | 285 (28) | 37 | 24 | `FALL1`: hill 4 (K220), takeoff on time, lean backward, landing on time, 63.02 m |
| 2 | 2123 (1939) | 37 | 72 | `FALL2`: hill 1 (K105), takeoff on time, lean forward, landing right after the takeoff, 53.89 m |
| 3 | 94 (24) | 31 | 16 | `FALL3`: hill 3 (K135), takeoff on time, violent leans, late landing, 63.71 m |
| 4 | 3405 (2547) | 37 | 121 | `FALL4`: hill 1 (K105), takeoff on time, lean forward, no landing button, 88.84 m |
| 5 | 1184 (1184) | 37 | 32 | `FALL5`: hill 1 (K105), no takeoff, lean forward, landing on time, 24.65 m |

"Past the takeoff" are the jumps that passed the takeoff; the others end on the inrun (a takeoff too early) and
have 0 m. The port thus reaches all five types, including 1, 3 and 5, which could not be caused by changes to the
Karpacz replay.

In the original `FALL1` was checked **[measurement, 2026-10-12]**: a fall of type 1, 1574 frames and 63.02 m, as
in the port; five golden tests with the trace passed (jumper step: 1567 of 1567 frames bit for bit).
`FALL2`..`FALL5` have plans and replays, but no traces yet; types 3 and 5 have not been compared with the original
so far.

## Mutation tests (Stryker)

```sh
pnpm mutation
```

The HTML report goes to `reports/mutation/`. In CI it is run manually (the workflow "Mutation testing").
Without the game files the physics is checked only by the regression tests, so the local result with the traces is
higher.

Result without traces (2026-10-11, 2700 mutants) **[measurement]**: 61.67% overall; the lowest are `replay.ts`
(0%, only the golden tests test it), `wind.ts` (32%) and `pose.ts` (56%).

Limitations of the tools (as of 2026-10):

- Stryker 10 switches mutants correctly only with Vitest 4; with Vitest 5 the tests pass, but no mutant dies. That
  is why the project uses Vitest 4.1.
- Stryker rewrites project references in `tsconfig` through TypeScript's JavaScript API, which TypeScript 7 does
  not have. `tsconfigFile` in `stryker.config.json` deliberately points to a non-existent file, which skips this
  step (the project does not use project references).
- Stryker uses a separate, minimal configuration `vitest.stryker.config.ts`.
