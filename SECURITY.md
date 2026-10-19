# Security policy

## Supported versions

Every merge into `master` that changes the game is published at https://telemark.visvaya.workers.dev with a
version number and a GitHub release. Only the latest published version is supported.

## Reporting a vulnerability

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**.
Do not open a public issue for it. Include what you found, how to reproduce it and which commit you tested.

This is a spare-time project, so replies come as time allows. Fixes are merged into the default branch and
published as a new version, and the report is credited unless you ask otherwise.

## Scope

The game runs entirely in the browser. It has no server, no accounts and makes no network requests of its own.
Files of the original game picked by the player are read and stored locally (IndexedDB) and are never uploaded.

In scope:

- parsing of player-supplied files (`Dsj.exe`, `Dsj.dat`, `.rpl`) in `src/original` and `src/sim`;
- the reverse-engineering tools in `tools/`, when run on untrusted files;
- the build, the CI workflows and the dependencies;
- the published site itself: its response headers and content security policy, the service worker and the
  offline cache (`deploy/`, `public/_headers`, `scripts/`).

Out of scope: the original game itself and anything that requires the player to modify their own local saves.
