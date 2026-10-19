# Contributing

Thank you for your interest in Telemark. It is a spare-time project with one maintainer, so replies and reviews
come as time allows.

## Before you start

- For a bug, open an issue with what you did, what you saw and what you expected, the browser and device, and the
  version shown in the game's menu.
- For anything larger than a small fix, open an issue first and describe the change, so we can agree on it before
  you spend time on code.
- Security problems go through a private report, not an issue: see `SECURITY.md`.

## What the project keeps to

- **The jump physics is a port, not a design.** `src/sim` reproduces Deluxe Ski Jump 2 v2.10P frame by frame and
  is checked against traces of the original game. A change there needs evidence from the original's code and
  passing golden tests with the full set of traces (`docs/testing.md`); recording those traces needs your own copy
  of the original game.
- **Nothing from the original game is committed or distributed.** No `Dsj.exe`, `Dsj.dat`, `.rpl` files, traces,
  listings or data cut from them, in any form. The game reads the player's own files in the browser.
- **The simulation is deterministic.** Rendering, sound and the interface only read its state.
- **Text for players is Polish** and lives in `src/text/ui-text.ts`; code, comments, commit messages, pull
  requests and the documentation in the repository are English.
- **No em dash and no emoji** in sources and documentation (CI checks it).

## Making a change

1. Fork the repository and branch from `master`.
2. Set up as in the README ("Development"): Node 24 and pnpm 12, `pnpm install --frozen-lockfile`.
3. Write tests with the change: unit tests for logic, browser tests (`e2e/`) for the interface. `docs/testing.md`
   says which check proves what.
4. Run the checks listed in the README before you open the pull request; CI runs them again, with Chromium,
   Firefox and WebKit.
5. If the change alters the game, raise the version with `pnpm version:bump "<pull request title>"`
   (`docs/deployment.md`, "Version").

## Pull requests

- The title follows Conventional Commits (`fix(ui): ...`, `feat(competition): ...`; types `feat`, `fix`, `docs`,
  `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`; description up to 72 characters). The pull
  request is merged by squash, and the title becomes the commit.
- Say what changed and why, what you checked and what you did not.
- Only the maintainer merges. A merge into `master` publishes the game, so a pull request from a fork waits for the
  maintainer's review, and its workflows for the maintainer's approval on a first contribution.

## License

Telemark is licensed under GPL-3.0-or-later. By contributing you agree that your contribution is licensed under the
same terms.
