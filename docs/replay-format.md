# DSJ2: the `.rpl` replay format (v2.x)

Source: module `190d` (the replay record) and `1b8f` (encrypted writing) in `Dsj.exe` v2.10P.
Decoder: `tools/re/rpl_codec.py`. All `.rpl` files from the distribution (5 × `/DSJ_v2.1P//`,
1 × `/DSJ_v2.00//`) decode with a correct checksum **[measurement]**.

## File

Size 1222 B = 13 B of header + 1205 B of record (encrypted) + 4 B of checksum (plain, LE).

A stream cipher based on Borland Pascal's `Random` generator:

- `RandSeed := $26B51B17`; `checksum := random31()`, where `random31() = Random($8000) * 65536 + Random($FFFF)`.
- For each plain byte `p`: `k := Random(256)`, `c := (p + k) mod 256` (written),
  `RandSeed := RandSeed + c`, `checksum := checksum + (c - 1) * (random31() shr 8)` (mod 2^32).
- `Random`: `RandSeed := RandSeed * $08088405 + 1`, `Random(n) = (RandSeed * n) shr 32`.

After decryption the header is 13 characters with no length byte: `//DSJ_v2.00//` (DS:14D2) or `//DSJ_v2.1P//`
(DS:14E0) **[measurement: 6 files from the distribution]**.

- Writing (190d:03e4) chooses the marker by hill number: `//DSJ_v2.00//` for hills 1..32, `//DSJ_v2.1P//`
  for 33..37 **[code: 190d:05ca]**.
- Reading (190d:060d) accepts either of the two markers, regardless of the hill number, and only then reads the
  record **[code: 190d:0662..06b1]**; the result is whether the checksum matches **[code: 1b8f:0308]**. It checks
  no other fields when reading.

## Record (1205 B, offsets in hexadecimal)

| Offset | Type | Meaning |
|---|---|---|
| 00 | 8 × Single | wind state at the start (DS:4D10..4D2F): x, y, variability, speed, direction, direction of the indicator, rotation speed of the indicator, its limit |
| 20 | byte | hill number (1..37) |
| 21 | Single | hill record at the time of the jump: a copy of `DS:543B + 21 * numer` (84.58 for Karpacz) **[code: 190d:0052]** |
| 25 | string[6] | distance as text, e.g. `89.92` |
| 2C | LongInt | `RandSeed` at the start of the jump |
| 30.. | ShortInt[] | vertical mouse movement (mickeys, clipped to -128..127) in frames from `dy_start`; index `klatka - dy_start + 1`, counted from 2F |
| 449 | byte | copy of DS:4D30; only the drawing code reads it (0baf:3359) **[code]** |
| 44A | LongInt | frame of the start from the gate (left button) |
| 44E | LongInt | `button_start`: first frame of the takeoff window |
| 452 | LongInt | `dy_start`: first frame of the movement record |
| 456.. | byte[20] | buttons in the takeoff window, index `klatka - button_start + 1` from 455: 0 none, >0 left, >1 right as well |
| 46A | LongInt | frame of the left button at landing (0 = none) |
| 46E | LongInt | frame of the right button at landing (0 = none) |
| 472 | LongInt | `dy_end`: last frame of the movement record |
| 476 | string[25] | jumper name |
| 490 | string[10] | date `RRRR/MM/DD` |
| 49B | string[25] | licensee name |

The X position of the mouse is not stored. Reproducing a jump therefore needs: the wind state, the generator
seed, the hill number and the input above. The simulation is deterministic; seeking in a replay in the game
recomputes the jump from the beginning **[code: 0baf:ca5b]**.

Example (`KARPACZ.RPL`): hill 35, seed `$2F4B0829`, start 74, takeoff window from 308, movement 322..614, right
button at landing in frame 595, distance 89.92 m **[measurement]**.

## A replay for another hill

What decides whether the game plays a replay on the chosen hill:

- **Hill number (20).** The replay studio passes it directly to the procedure that sets up the hill (0baf:631c),
  without a range check **[code: 003f:8951]**. The same procedure sets up the hill in training, so the profile is
  the one in `docs/hill-format.md`.
- **Header marker.** Either of the two (above). `tools/re/craft_replays.py from-plan` writes the one the game
  would write.
- **Field 21.** Not checked when reading. During playback it goes to 0baf:9303, which computes from it the
  position of the record marker on the landing hill; 0 is replaced with 10000 m, that is beyond the hill
  **[code: 0baf:9311..9435, 0baf:ccec, 0baf:d0ed]**. The table `DS:543B` is changed by the code at
  0baf:b462..b544 **[meaning: hypothesis, writing a new record after a jump]**. `from-plan` writes 0.
- **Field 449.** Drawing only; `from-plan` writes 0.
- **Distance (25).** Text for display; the game computes the jump anew. `from-plan` leaves it empty, and after
  the trace is recorded `set-distance` writes it.
- **Licence.** After a successful read the studio asks 1a7f:029e; when the result is 0 and the hill number is
  greater than 4, it calls 003f:114c instead of the replay screen **[code: 003f:8f42..8f68]**. The same function
  chooses the licensee name (49B) when writing **[code: 190d:0568]**, so an unregistered copy probably plays only
  hills 1..4 **[hypothesis: not checked on such a copy]**.
- **Input.** The input frames depend on the length of the inrun, so they cannot be carried over from another
  hill; the input plan is made in the port (`docs/testing.md`, "Replays for any hill").

Check **[measurement, 2026-10-12]**: a replay for hill 32 (K250) made from a plan, with the marker
`//DSJ_v2.00//`, zeros in fields 21 and 449 and an empty distance, was accepted by the original (a licensed copy)
and played on the K250 hill. The jump lasted 1477 frames and reached 249.69 m, the same as in the port; the
golden tests passed on its trace. The marker `//DSJ_v2.1P//` for hills 1..32 and `//DSJ_v2.00//` for 33..37 were
not checked in the game (this follows only from the reading code).

## This game's replays (own format)

The replay list and the export files (`telemark-replays`, version 2, `src/storage/replay-file.ts`) keep a jump as
the generator seed and the input of each frame (`src/storage/input-codec.ts`): the number of frames, runs of
presses (gap, length, buttons) and the vertical movement from the first to the last frame with movement, one byte
per frame; numbers in LEB128, the whole in base64 with the prefix `2:`. The game also reads the first form (two
bytes per frame, file version 1). When saving, the game removes the mouse movement on the gate, on the inrun, on
the outrun and after a fall if the jump recomputed without it ends in the same state (otherwise the movement of
the fall or the whole input stays). A jump without movement takes a few dozen bytes of input, a jump with the
mouse moving the whole time about two to three times less than in the first form. A single replay is exported as
`telemark-powtorka_<dzień>_<godzina>_<skocznia>.json` (time of the jump), several as a ZIP archive
`telemark-powtorki_<dzień>_<godzina>.zip` with a separate file per jump. A file, an archive (stored or deflate
compressed, with limits on the number and size of files) and an `.rpl` file can be loaded.

## Storing the replay list

The list is kept in IndexedDB, in the database `telemark-replays` (store `replays`, a single record `shelf` with
a `schemaVersion` and the list of entries; `src/storage/replay-store.ts`). The hill record (distance, points) is
separate, in the game save (`src/storage/save-store.ts`, localStorage).

- **Saving from several windows.** Each game window keeps its own copy of the list and a change log: the entries
  it added and the entries it removed, in both cases until a save that covers them. A save reads the record,
  merges it with the window's list and writes the result in one transaction (`src/storage/shelf-merge.ts`): what
  is saved stays, except entries removed in this window; of the window's entries missing from the database, only
  those added and not yet saved go in (the others were already saved, so another window removed them). After a
  successful save the log loses what the save took from it: the merge decided about the added entries (saved, or
  rejected as a weaker record replay), the removals are in the database. That is why an entry removed in one
  window and loaded again in another (same identifier) stays.
- **The record replay** stays one per hill, by the same rule as the record in the game save (`betterRecordOf`
  in `src/storage/save-data.ts`): the longer jump, at equal distance the newer one. A record replay replaced in a
  window with a new one does not count as removed, because a window with an older save may have taken a shorter
  jump for the record. Whether a new jump is a record is decided by `beatsRecord` (a jump longer than the
  record), and `betterRecordOf` only chooses between records from different windows.
- **Refreshing.** A window accepts the merged list, with the same cleanup of the settings as on every change.
  After a save the window notifies the others through `BroadcastChannel` (`src/ui/shelf-sync.ts`), and they read
  the list again; each window also reads it when the page becomes visible again (also where there is no
  `BroadcastChannel`). A window whose last save failed saves instead of reading.
- **Game save from several windows.** The game save had the same problem: a window with an older save overwrote
  the records saved by another. A save now reads the save from the storage and keeps at each hill the record
  chosen by `betterRecordOf`; the settings come from the window that saves (the last save wins). The saved result
  goes back to the window, and other windows read the save after a message on the channel `telemark-save` and
  after returning to the page (`src/ui/save-sync.ts`), so the hill list and the recognition of a new record see
  the records of all windows. A save that cannot be read changes nothing, and while the window saves on its own,
  it takes only the records from the read and keeps its own settings.
- **Save and read errors.** Opening the database that does not finish within 5 s (another tab holds the
  database during a version change) counts as an error; a save counts only after the transaction completes (a
  full disk aborts it at the end). After a save error the list stays in the window's memory and the log
  unchanged, so the next save (at the next change or on returning to the page) also writes what the previous one
  did not. After two errors in a row the menu says that replays may disappear after the page is closed; the first
  successful operation withdraws that. A first read that failed is retried by the game after 2 s (up to three
  times) and on every return to the page. The game never overwrites a record written by a newer version of the
  game (unknown `schemaVersion`).

## A file written by this game

Since 2026-10-15 (version 0.11.1) the "Powtórki" screen does not offer this export (`RPL_EXPORT_OFFERED` in
`src/ui/rpl-export.ts`): some players' jumps were rejected although the format could hold them. The code and the
tests stay; the description below applies to the export once it is enabled again.

The "Powtórki" screen writes a jump made on a hill from the original as an `.rpl` file (`src/ui/rpl-export.ts`,
encoder: `src/storage/original-replay-file.ts`). The fields as with `from-plan`: the header marker the game would
write, zeros in fields 21 and 449, an empty licensee; in addition the distance with two digits after the point,
the name `GRACZ 1` and the date of the jump. A player's `.rpl` file kept on the list is exported unchanged. The
file name is the day, hour, minute and second of the jump (eight characters, as in DOS; the month and the year are
in the file); a second file from the same second gets a letter in the eighth position. Several selected replays
are exported in one uncompressed ZIP archive (`src/storage/zip-file.ts`), because browsers ask for permission for
many downloads at once or refuse them.

The format holds one start press, one 20-frame window at the takeoff (the right button only together with the
left one), one press of each button outside it, each in a single frame, and at most 1049 frames of vertical
movement. The game first tries to write the jump's input in full. When it does not fit, it in turn omits each
press or shortens it to its first frame or to 20 frames, if the jump recomputed without it ends in the same state:
a press on the gate before the start, a mouse click lasting a few frames, a second press of the same button after
the press for the landing; a lone right press in the takeoff window may get a left one next to it. Then the same
with the movement outside the flight (from takeoff to landing): on the gate, on the inrun and on the outrun. The
file is handed to the player when, read back and recomputed in this game, it gives the same jump state in the last
frame.

When that fails, the game tries a save "with a small difference": movement only in flight, a lone right press with
a left one next to it and every press outside the takeoff in a single frame (the one in which the jump changed
phase, or the first), without checking whether the jump reacted to it. Such a file is handed over only when,
recomputed, it gives the same result: distance, judges' notes, points and the kind of fall; the game then says
that the jumper's movements (for example after a fall, when the mouse kept moving) may look slightly different in
DSJ2. Otherwise the game says why the jump cannot be saved: too long a movement the jump reacted to, too many
presses (for example a takeoff with the right button alone) or a file that gives a different jump.

Check **[measurement, 2026-10-15]**: two jumps on Karpacz made in the browser (with a mouse on a computer and by
touch in an emulated Android phone), saved with the "Eksportuj .rpl" button and played by the original
(`tools/re/trace_capture.py`, a licensed copy): 21.89 m and 21.63 m, the same as in this game. Both jumps needed
the omission or shortening of presses described above.

Check **[measurement, 2026-10-15, `tools/re/game_session.py` with screenshots]**: the original's replay studio
shows on its list the files from the archive of a bulk export (including a name with a letter in the eighth
position), and in the details the hill ("KARPACZ, K85"), the jumper "GRACZ 1", the distance from the file and the
date; the field "ZAREJESTR." is empty. The file plays until the landing. Distances in the original
(`trace_capture.py`): 22.41 m for the jump on Karpacz and 94.53 m for the jump with a fall on hill 19 (K180)
saved "with a small difference", the same as in this game.
