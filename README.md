# Telemark

A ski jumping game for the browser. Its jump physics is a faithful port of Deluxe Ski Jump 2 (v2.10P, DOS, 2001),
reconstructed from an analysis of the original executable and checked against the original game frame by frame.
Graphics, interface and sound are new, made in the style of the original.

![A jumper in flight over the built-in practice hill in snowfall](docs/screenshot.png)

Telemark is a working title.

## Status

As of 2026-10-18: in active development.

- Playable: training mode on 11 built-in hills (K50 to K120) and on the 37 original hills, a replay of the last jump
  (pause, half and quarter speed), the original's `.rpl` replays from your own copy of the game, and a single
  competition of two rounds against up to eight computer jumpers with the original's levels and steering.
- Not there yet: the World Cup (a series of hills with a classification and a saved state) and team competitions.
- Playable at <https://telemark.visvaya.workers.dev> since 2026-10-13. The page can be installed and works
  offline after the first visit; every change on the default branch is published there once its checks pass
  (`docs/deployment.md`). Checked by hand on one iPhone and in one desktop browser; not yet on Android.
- Every published change of the game gets a version number, shown in the game and listed under the
  repository's releases.

## Features

- Jump physics, wind, landing and judges' notes identical to DSJ2 v2.10P (deterministic on every device).
- 11 built-in hills; the 37 hills of the original become available when you load `Dsj.exe` from your own copy
  of the game. The file is read in the browser and kept only there; nothing from the original is distributed.
- Mouse, keyboard and touch controls; on phones tilt steering by default, with the finger as the fallback and the
  choice; haptics where supported.
- Pixel graphics with a responsive width, time of day (day, dusk, night) and weather (snow, fog).
- Synthesised sound (Web Audio, no recordings).
- A replay of the last jump, with pause, slow motion and a slider under the picture to any moment; the original's `.rpl` replays play the same way, on
  the hills of your `Dsj.exe`. The replay of each hill record is kept on its own, other jumps by hand or as the
  last few, with an optional clean-up by age and by size; replays go to a file and come back from one, to move them
  to another device (one file, or a ZIP archive with a file for each), and are stored compactly (presses as runs,
  mouse motion only where the jump reacts to it); replays read from files have a group of their own. A replay shows the time of day and the
  weather its jump had. The export of a jump to a `.rpl` file of the original game is written but not offered
  for now: some jumps are still refused although the format could hold them.
- A ghost of the hill record: the record's jump runs beside each training jump, leaving the gate with you.
- Hill records, outfit colours and settings saved locally.
- Installable on a phone's home screen; after the first visit it starts and plays without a network.

## Development

Requirements: Node 24, pnpm 12.

```sh
pnpm install
pnpm dev            # development server
pnpm typecheck
pnpm lint
pnpm format         # rewrite the sources in the project's format (oxfmt)
pnpm check:unused   # unused files, exports and dependencies (knip)
pnpm check:duplicates  # duplicated code (jscpd); src/sim is exempt, the port repeats where the original does
pnpm test
pnpm test:coverage  # the tests with the coverage floor for src/sim, as in CI
pnpm test:browser:edge  # the built game in Microsoft Edge on desktop and phone profiles (Playwright)
pnpm test:browser   # the same in Chromium, Firefox and WebKit, as in CI; needs Playwright's browsers
pnpm test:scripts   # tests of the build, release and deployment scripts
pnpm build          # production build in dist/, with the service worker and the release record
pnpm check:dist     # dist/ holds exactly the build's files, within the size budgets
node scripts/check-doc-links.mjs  # relative links and backticked repository paths in the Markdown files exist
node scripts/serve-dist.mjs  # the build at http://127.0.0.1:4317, served the way the host serves it
pnpm build:single   # the build packed into one HTML file, in dist-single/
```

Tests that compare the port with the original game need its files and recorded traces; without them they are
skipped. See `docs/testing.md`.

## Repository layout

| Path | Contents |
|---|---|
| `src/sim` | the port of the original physics and jump logic |
| `src/original` | readers for the player's original files |
| `src/game`, `src/render`, `src/audio`, `src/ui` | game session, pixel renderer, sound, React screens |
| `src/storage` | local saves |
| `src/pwa` | service worker registration, offline state, the picture the icons are made of |
| `public` | web manifest, icons, the host's headers file |
| `tools/re` | reverse-engineering tools (disassembler, headless DOS emulator, trace capture) |
| `tools/font` | generators of the screens' font (from the jump picture's own glyphs) and of the Polish letters for the Silkscreen font |
| `scripts` | the release step and service worker, checks of the build and of a deployment, the test server, the single-file build |
| `deploy` | the pinned deployment tool and its configuration |
| `docs` | specifications and guides, see below |

## Documentation

The notes in `docs` are in English.

| File | Question it answers |
|---|---|
| `docs/physics-spec.md` | How does the original move the jumper on the inrun, in flight and on landing? |
| `docs/hill-format.md` | Where does the original keep its hills and how are they read? |
| `docs/hills.md` | How are the game's own hills described, which rules must they pass, and how are they generated? |
| `docs/jump-scene.md` | How does the original draw the jump scene, and where does the port differ? |
| `docs/jumper-figure.md` | How is the jumper drawn from a pose? |
| `docs/replay-format.md` | How are the original `.rpl` replays encoded? |
| `docs/testing.md` | Which tests exist, what do they need and how are they run? |
| `docs/deployment.md` | What is in a release, how does the game work offline and update, how is it deployed and rolled back? |

## Contributing

Contributions are welcome; how to report a bug, propose a change and open a pull request is described in
[CONTRIBUTING.md](CONTRIBUTING.md). `master` changes only through pull requests merged by squash, and the pull
request title (Conventional Commits) becomes the commit. CI runs the checks listed under "Development", plus
`pnpm format:check`, a dependency audit, a secret scan, an audit of its own workflows (actionlint, zizmor) and a
check for em dashes and emoji; on `master` the same run can then publish the package it has just tested
(`docs/deployment.md`). `git blame` skips the commit that formatted the whole tree after
`git config blame.ignoreRevsFile .git-blame-ignore-revs` (GitHub does so by itself). Security reports: see
`SECURITY.md`.

## Credits

Telemark follows Deluxe Ski Jump 2 (v2.10P for DOS, 2001), made by Jussi Koskela (Mediamond), with photographs
by Kalevi Koskela; the Polish translation of v2.10P is by Piotr "V-car" Wikarek. Its jump physics is ported from
that game. Without Deluxe Ski Jump this game would not exist: thank you.

Telemark is made by Maciej Budzyński.

## Legal

This is an independent project, not affiliated with the authors or publishers of Deluxe Ski Jump.
Deluxe Ski Jump is a name of its respective owner and is used here only to describe compatibility. The repository
contains no files from the original game; the game reads them from the player's own copy, locally.

The pixel font is Silkscreen with added Polish letters, under the SIL Open Font License 1.1 (`src/ui/fonts/OFL.txt`;
the built game carries the same text as `licenses/silkscreen-ofl.txt`). The screens' headings and choices use the
jump picture's own font, generated from `src/render/pixel-font.ts` by `tools/font/make_screen_font.py` and licensed
with the rest of the game.

## License

Copyright (C) 2026 Maciej Budzyński.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any
later version. It is distributed without any warranty. See `LICENSE` for the full text.

The license covers this project's own code and documentation. It does not cover the original game, and the font
keeps its own license (see Legal).
