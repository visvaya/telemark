# Own hills: format and rules

## What a hill is

An own hill of the game is data alone: one JSON-compatible object, with no functions and no code. The same
format applies to every hill, whatever its source (made by hand, generated, and later made by a player). Thanks to
this every hill goes through the same checks, and a hill file cannot execute anything. Code: `src/hills/`.

The hills from the original's files have their own description in `hill-format.md`; this document does not apply
to them.

## Format

Type `HillSpec` (`src/hills/hill-spec.ts`), format version `schemaVersion: 1`. Example: the hill "Ćwiczebna"
(`src/hills/own-hills.ts`).

```json
{
  "schemaVersion": 1,
  "id": "own-3",
  "name": "Ćwiczebna",
  "kPointM": 90,
  "profile": {
    "inrun": {
      "startXM": 10.6, "flatEndXM": 9.2, "lineEndXM": 25.3, "takeoffXM": 46,
      "lineSlope": -1, "lineInterceptM": 230, "curveA": 0.02
    },
    "landing": {
      "centerXM": 115, "centerYM": 150.9, "amplitudeM": 45, "widthM": 50,
      "outrunStartXM": 170, "outrunCurveA": 0.01, "knollBlend": 0.3
    }
  },
  "look": {
    "skyRgb6": [30, 50, 63],
    "terrain": { "seed": 4321, "amplitudeM": 50, "baseOverOutrunM": 3 },
    "trees": { "firstCount": 70, "secondCount": 30, "fromXM": 50, "toXM": 200, "seed": 5150, "hidden": [] },
    "supports": [
      { "fromXM": 7, "toXM": 9.5, "colour": 13, "frontColour": 25 },
      { "fromXM": 20, "toXM": 21, "colour": 13, "frontColour": 17 },
      { "fromXM": 33, "toXM": 40, "colour": 13, "frontColour": 25 }
    ],
    "inrun": { "platformStartXM": 6, "nearWallUpPx": 12, "nearWallDownPx": 11, "wallColour": 228, "gateColour": 163 },
    "marks": { "firstMarkM": 75, "markCount": 3, "fenceColour": 192, "fenceStartM": 0 }
  }
}
```

`profile` holds the parameters of the procedures that build the profile (`buildHillProfile` in
`src/sim/hill-setup.ts`, the meaning of the fields in `physics-spec.md`), `look` is the appearance beyond the
profile (`HillLook` in `src/render/hill-look.ts`).

## Format check

`parseHillSpec` (`src/hills/parse-hill-spec.ts`) reads data from an untrusted source. Each object is checked
against the list of known keys: an unknown key (including `__proto__`, `constructor`, `prototype`) and a missing
one are errors. Only plain objects, arrays and finite numbers are allowed. The result is built anew from the
allowed fields. Too long a list and too long a text are reported without reading the excess, so the size of the
data does not raise the cost of the check. The check collects all problems at once; each has a fixed rule
identifier (`format.…`), a field path and a short description in English for the logs. The texts for the player
will come in `src/text/ui-text.ts`.

The format limits (`src/hills/hill-spec-limits.ts`) say what the engine and the drawing accept, not what makes a
good hill:

- version: higher than the supported one gives a single problem `format.newer-version` (data from a newer game),
  any other `format.version`;
- `id`: lower-case letters and digits in groups joined by a hyphen, 1..40 characters, because it is the key of
  records and replays;
- `name`: 1..24 characters after NFC normalisation, without control characters, bidirectional control characters
  and zero-width characters, only characters the jump picture's font draws (`fontDraws` in
  `src/render/pixel-font.ts`), because otherwise the name would look different from how it was written;
- title width: the text "name K…" is at most 138 px, because that is the room left in the narrowest picture
  (256 px) between the pause button in the top left corner (at most up to column 61) and the wind box with the
  start light (57 px with spacing) (`src/hills/hill-title.ts`);
- `kPointM`: an integer 20..300;
- inrun: field ranges and the order `startXM < takeoffXM` and `flatEndXM <= lineEndXM < takeoffXM`, because the
  profile functions take the flat part up to `flatEndXM`, the straight up to `lineEndXM`, and the curve beyond; a
  flat part beyond the end of the straight would be overwritten by the curve; the start may lie on the flat part;
- landing hill: field ranges, the outrun starts at least 20 m behind the takeoff and at most at 600 m;
- look: colours are palette indices 0..255 (the start gate at most 254, because its second half takes the next
  index), the sky in 6-bit RGB, seeds 0..65535, at most 8 supports and 8 hidden groups of trees, segments with the
  start before the end.

## Geometry rules

`geometryProblems` (`src/hills/hill-geometry.ts`) measures the built profile (`hillGeometry`) and checks the
thresholds from `HILL_RULES` (identifiers `geometry.…`). The measurements are finite for every hill that passed
the format check.

- `join-height`: at the joins flat/straight, straight/curve and landing hill/outrun a height step of at most
  0.01 m, because a step in the track is a blow to the ski;
- `join-slope`: at the joins straight/curve and landing hill/outrun a slope difference of at most 0.5°; the flat
  part lies behind the start gate and meets the straight at its full angle, so only the height is checked there;
- `takeoff-angle`: takeoff angle 6..12° downwards;
- `table-height`: the takeoff 1..3 m above the landing hill;
- `landing-angle-at-k`: slope of the landing hill at the K point 34..48°, because most jumps land around K and the
  landing hill is to take the landing there;
- `k-near-steepest`: the K point horizontally at most `max(15 m, 0,12 K)` from the steepest place of the landing
  hill (`kFromSteepestMaxM`): on a large hill the almost steepest section of the landing hill is longer, so the
  steepest place can lie farther from K. A share of 0.12 K is enough for the generator's large hills with its
  margin; the original's large hills lie up to about 0.18 K from K (measured locally on the game files), but the
  style rules do not have to let them through.
  15 m keeps small hills to the few metres the jumper can tell apart;
- `landing-area-length`: the end of the landing area (the first place after the steepest one where the landing
  hill is gentler than 32°, measured along the arc from the takeoff) lies 0.1..0.4 K behind the K point, because
  longer jumps need room;
- `outrun-length`: from the end of the landing area to the lowest point of the outrun at least 30 m horizontally,
  for braking;
- `outrun-within-scene`: the lowest point of the outrun at most at 380 m, because that is what the scene's layer
  tables cover (`LAYER_TABLE_LENGTH_M` in `src/render/hill-layer-tables.ts`);
- `inrun-descends`, `landing-descends`: the inrun descends from the start to the takeoff, and the landing hill from
  the takeoff to the lowest point of the outrun (samples every 0.1 m; a sample may lie at most 1 mm higher than
  the previous one, because near the bottom of a gentle outrun neighbouring heights differ by less than single
  precision can resolve).

### Two levels of rules

Each geometry rule has a level (`GEOMETRY_RULE_LEVELS`, the field `level` of a problem; format and simulation
problems have no level, because by nature they are admission problems):

- **admission** (`admission`): rules the engine or the scene needs, or which no hill of this game breaks; a hill
  that breaks them is rejected:
  - `join-height`, `join-slope`: a step or a kink in the track is a blow to the skis;
  - `inrun-descends`: a rising inrun can stop the jumper before the takeoff;
  - `landing-descends`: a rising landing hill is a wall the jumper flies into;
  - `table-height`: a takeoff far above the landing hill or below it makes the takeoff pointless;
- **style** (`style`): the rules of a modern hill, which the game's own hills keep to; a player's hill that breaks
  them is admitted with a note, not rejected:
  - `takeoff-angle`: the original's hills have takeoffs far outside this range and jump well;
  - `landing-area-length`: whether a good player jumps beyond the landing area is checked by the simulation;
  - `outrun-length`: whether the jumper stops within the scene is checked by the simulation;
  - `outrun-within-scene`: the scene is drawn up to 380 m, but what counts is that the jumper stops before its
    end, which the simulation checks; the lowest point of the outrun may lie farther (as on two of the original's
    hills);
  - `k-near-steepest`, `landing-angle-at-k`: whether a good player lands near K is checked by the simulation.

`geometryProblems` returns the problems of both levels, `admissionProblems` only the admission ones. The tests of
the own hills require no problems of either level. A local test with the game files (`DSJ2_GAME_DIR`) checks that
each of the 37 hills of the original passes every admission rule (each can be jumped on); it shows the number of
the original's hills meeting each rule only when some admission rule fails.

## Look rules

`lookProblems` (`src/hills/hill-look-rules.ts`) checks the look of a hill; the rules have the same two levels as
the geometry rules, and the limits are in `HILL_LOOK_RULES`:

- admission:
  - `supports-under-inrun`: every inrun support (`look.supports`) stands under the inrun, from the start of the
    start platform (`look.inrun.platformStartXM`) to the takeoff (`profile.inrun.takeoffXM`);
  - `supports-in-order`: the supports follow one another along the inrun and do not overlap;
  - `inrun-end-supported`: the last support ends at most 3.5 m before the takeoff, as on every hill of the
    original (the end of the inrun does not hang in the air);
  - `deck-share`: the deck behind the gate (the flat part and the platform) takes 0.022 to 0.141 K, as in the
    original;
- style:
  - `inrun-end-close`: the last support at most 1 m before the takeoff, as usual in the original;
  - `deck-share-short`: the deck at most 0.10 K (0.147 K looked too long).

The tests of the own hills require no problems of either level. The generator rejects a hill that breaks an
admission rule (of the look or of the geometry), returns the style problems, and trims the first support to the
start of the platform. The rules do not apply to the original's hills: their look comes from the game file.

The ranges of the style rules are assumptions of the project, not limits verified by simulation; what they are
meant to ensure is checked by the checks based on simulated jumps (next section).

## Simulation checks

The geometry does not say whether a hill jumps well. The checks in `src/hills/hill-play.ts` run the real
simulation (`startTrainingJump`, `stepTrainingJump`) with the bots from `src/hills/hill-players.ts` and compare
the results with the thresholds of `PLAY_RULES`. `playMeasures` returns the numbers alone, `playProblems` applies
the thresholds to them (rules `play.*`). Each check covers all own hills, so a new hill enters them through its
data alone.

The former bots played by a script: the takeoff aim from trying aims in the simulation, in flight one body angle
(0.3 rad) regardless of the hill, the wind and the phase of the flight, landing at a fixed height, without reading
the wind and without knowing about points. They were reliable only up to K120, and on 38 hills with a simpler bot
the spread of distances on large hills (40-60 m) came from the bot, not from the hill. Then they played by a player
policy that was trained (below), still reliable only up to K120. Now the players of the checks are the original's
computer jumpers (section "Rival players"), and the oracle says how much can be got out of a hill at most.

### What the player sees

`playerView` (`src/hills/player-view.ts`) returns from the current jump state only what the player sees: the
frame, the phase, the speed, the time to the edge of the takeoff at the current speed, the height above the
terrain under the jumper and the rate at which it falls, the body angle, the number of frames since leaving the
takeoff and the wind along the hill as the indicator shows it (the x component of `displayedWindMPerS`, computed
with a deterministic cosine so that the bot decides the same way in every engine). It does not see the wind from
the future or the hill data beyond the terrain under it and the edge in front of it.

### Player policy

`PlayerPolicy` (`src/hills/player-policy.ts`) is 10 numbers with the unit in the name:

- `takeoffAimS`: both buttons in the crouch when the time to the edge falls to this value; held until leaving the
  takeoff;
- `earlyFlightFrames`, `earlyLeanRad`: the lean (minus the body angle the control leads to) in the first frames of
  the flight;
- `leanRad`, `leanPerSpeedRadPerMPerS`, `leanPerHeightRadPerM`, `leanPerTailWindRadPerMPerS`: the lean in the rest
  of the flight, linear in the speed (from 25 m/s), the height above the terrain (from 3 m) and the shown tail
  wind; limited to -0.2..0.9 rad;
- `landingHeightM`, `landingPerClosingS`: while descending the right button for 4 frames when the height falls
  below `landingHeightM` plus the descent rate times `landingPerClosingS`;
- `telemark`: the left one from the 8th to the 12th frame after the right one (telemark) or without it
  (two-legged).

The control in flight is a correction of 60 mouse microsteps per radian of angle error, clipped to 40 per frame.
The bot's noise comes from its own seeded `BorlandRandom` (a distribution close to normal from the sum of 12
uniform numbers, without transcendental functions, so the result is the same in every engine).

The three player levels (`PLAYER_LEVELS`) are the trained policy with human noise:

- weak: takeoff spread 0.08 s, control 0.6 of the correction with noise 8, landing 0.7 m lower than the policy,
  +- 1 m;
- average: spread 0.04 s, full control with noise 4, landing 0.2 m lower, +- 0.5 m;
- good: spread 0.015 s, full control with noise 2, landing as the policy, +- 0.2 m.

`EXACT_PLAYER_LEVEL` is the good player without noise, that is the policy alone.

### Training

`node scripts/train-player.mjs [liczba ocen]` (400 by default) trains the policy and prints the numbers and the
results to copy into `TRAINED_PLAYER_POLICY` and `TRAINED_POLICY_SCORES`; it writes nothing. A script, not a test
file: training takes minutes, and the result is numbers to review and copy, not a verdict. Training is
deterministic: the same code gives the same numbers.

The training set was the generated set (section "Hill generator"), at the time 27 hills from K45 to K260 with different landing
hills, knolls and inruns. A script generates it without the simulation rules, because those judge a hill with the
trained player that the training replaces; the rules on the set are checked by the stability test. Previously the
set was variants of the only own hill, and the variants with a different landing hill shape did not pass the
admission rules, so the player saw no other shape and on the original's hills above K120 stayed far from the
oracle.

On each hill, on the two strongest seeds of each wind class, three players jump: one without noise, and the
average and the good one with the same noise of their own errors as in the checks (`PLAYER_LEVELS`). The result is
the mean of the game's points, and a fall or a disqualification counts as -100 points. A sensible player wants
points despite their own errors: training the player without noise alone chose a landing press at 1.4 m, and the
average player with this noise then fell on one third of the jumps of the K50 hill.

The search starts from a reference player: first a (1+6) evolution strategy with a seeded generator (70% of the
evaluations; all numbers at once, a spread in coarse steps, wider after a gain, narrower without one), then a
coordinate search with fine steps. The landing style is not trained: the reference player landing on two legs fell
so often that its mean dropped from 128 to 82 points.

Result: 137.35 points on the training set (reference player 131.36), 118.06 on the own hills outside the set
(today Ćwiczebna alone), after 293 evaluations, about 35 minutes on this machine. The early part of the flight
dropped out (0 frames), the wind and the speed did not enter the lean; what remained is a lean of 0.24 rad growing
by 0.016 rad per metre of height, a takeoff 0.2 s before the edge and a landing at 2.2 m. A unit test checks only
that the numbers give the stored result on the own hills outside the set: cheap evidence that neither the policy
nor the simulation has changed.

The shown wind predicts the distance well (the player without noise, seeds 1-64, the component of the starting
wind along the hill: a correlation coefficient from -0.88 at K50 to -0.96 at K150; from 0.75 m at K50 to 2.9 m at
K185 less for each 1 m/s of tail wind), but the lean has no lever that would make up for it, so reading the wind
in flight gives the player nothing. The wind matters for the expectations about the distance, not for the control.

### Rival players

The players of the rules are the original's computer jumpers: the ported pilot (`src/sim/cpu-pilot.ts`) with the
improved landing of competitions (`src/game/rival-landing.ts`). The original's author made the pilot to jump every
one of its hills from K50 to K250, and the improved landing keeps it on its feet; the trained player above stays
for the oracle's search and for the designed jumps.

- `rivalJump(hill, seed, level, noiseSeed)`: `seed` sets the jump (wind) as for every bot; `noiseSeed` draws the
  jumper's talents and form as at the start of a cup and a competition, and the setup of its pilot. A setup with a
  blundered jump (1 in 40) is drawn again: a player of the checks does not throw a jump on purpose, and the rule
  `good-falls-in-class` allows no fall of the good player.
- `RIVAL_PLAYER_LEVELS`: the weak player is level 0, the average one level 2, the good one level 4 ("super").
- `exactRivalJump(hill, seed, aimFrames?)`: the best level with no talent or form either way and always the same
  setup, so that only the wind changes; with `aimFrames` both buttons go down that many frames before the edge.
  It measures the spread from the wind and is the jumper of the takeoff aim search.

The pilot reads the position, the speed and the slope from the simulation, as the original's pilot does, not only
what the player sees. Against the trained player on the hills up to K120 (11 own and 17 of the original, the same
seeds): the good median is 3.3 m further (median of the differences; 0.8 to 20.7 m), the 90th percentile of the
flight height at most 0.4 m higher; the bounds of `good-median` and `flight-height` moved by as much (from K+10 to
K+13 m, from 8 to 8.5 m).

### Oracle

`oracleJump` (`src/hills/hill-oracle.ts`) knows the hill and the seed, and so the future wind too. It looks for
changes to the trained player's jump that give the most points: shifts of the takeoff aim by whole frames, a lean
added in four parts of the flight (up to 35, 105 and 210 frames after leaving the takeoff, and beyond) and a shift
of the landing height. It is a coordinate search with steps of 0.1 rad and 1 m, then 0.04 rad and 0.4 m, at most 60
jumps per seed; a fall and a disqualification are the worst result (-100 points). It starts from the player's
jump, so it never comes out worse than it. On the Ćwiczebna hill four searches (one per wind class) are 141 jumps
and about 1.3 s.

### Comparison with the oracle on the original's hills

A local test (with `DSJ2_GAME_DIR`, see below) plays each of the 37 hills of the original with the exact rival
and with the oracle on the strongest seed of each wind class. The distance the oracle adds, as a share of K (mean
and 90th percentile in the size band), measurement of 2026-10-22 for the pilot of the original with the improved
landing (the exact rival):

| K | hills | mean | 90th percentile | points mean | falls |
|---|---|---|---|---|---|
| up to 90 | 10 | 0.016 | 0.032 | 0.1 | 0 |
| 90-120 | 7 | 0.011 | 0.025 | 0.0 | 0 |
| 120-160 | 8 | 0.014 | 0.026 | 1.3 | 0 |
| above 160 | 12 | 0.017 | 0.050 | 3.0 | 0 |

Every band is within the absolute margin below (a mean of 0.06 K and a 90th percentile of 0.12 K), so the rival is
credible on the largest hills too. With the original's landing a pilot of the same level fell on 23 of 148 jumps
on these hills and winds. The trained player, measured on 2026-10-17:

| K | hills | mean | 90th percentile | points mean | player falls |
|---|---|---|---|---|---|
| up to 90 | 10 | 0.061 | 0.097 | 11.3 | 0 |
| 90-120 | 7 | 0.073 | 0.102 | 15.7 | 0 |
| 120-160 | 8 | 0.091 | 0.163 | 20.3 | 0 |
| above 160 | 12 | 0.071 | 0.162 | 17.2 | 0 |

A band is reliable when the bot does not fall there and the mean and the 90th percentile are within the absolute
margin (0.06 K and 0.12 K) or at most 1.25 times those of the smallest band (up to K90) of the same measurement.
The relative margin was made for the trained player: a policy robust to its own errors deliberately leaves
distance to the oracle at every size, so what counted was whether the bot is as reliable at a given size as at the
sizes already accepted. The number 1.25 gave for the earlier policy the same verdict as the absolute margin:
90-120 had 1.12 and 0.97 times (passes), 120-160 1.47 and 1.41 (does not pass). For the trained policy 90-120 has
1.20 and 1.05 times, 120-160 1.49 and 1.68, above 160 1.16 and 1.67; so the trained player was trusted only up to
K120. The exact rival comes so close on every band that a ratio of its gaps says little (0.050 against 0.032 K is
1.56 times), so the absolute margin counts as well. The local test
now guards the margin of the exact rival on every band. The rules judge hills of every size: the former K120 limit
is gone, and the bounds that are lengths grow with a hill above K120 (`sizeScaleFromKPointM`): the good median by
1 cm, the flight height by 2.5 cm and the takeoff window's tolerance by 2.5 cm per metre of K. Measured with the
rivals on the original's hills: the good median reaches K+13.6 m at K250 and K+12.9 m at K95, the flight height
10.7 m at K240; with these bounds 34 of the 37 pass every play rule, and the 3 that do not fail on what the hill
does (two let the best jump pass the landing area in a head wind, one lands the good player past it).

The takeoff window is the number of aim frames (every 1/70 s) at which a jumper without errors lands at most 3 m
short of the best jump, without a fall or a disqualification. One takeoff frame is worth a few metres: that is a
property of the game's physics, not of the hill, so the window is counted in frames.

The best takeoff aim is found by `takeoffAimSearch`, with the exact rival (the trained player without noise when
no jumper is given). The distance as a function of the aim grows by 5-7 m per frame up to a single peak and falls behind it
(with a cliff about 6 frames too early), so the search starts from the best aim of the previous seed (for the
first one from 14 frames) and goes both ways, until on a given side two aims in a row come out more than 3 m below
the best or end with a fall; the side on which a new best appears goes on, so a best on the edge widens the
search. The range of aims is from -10 to 30 frames. On the Ćwiczebna hill the search takes 7-9 jumps per seed
instead of 41. A test compares it with a sweep of all 41 aims (`src/hills/test-support/full-aim-sweep.ts`) on 8
seeds: the best distance, the best aim and the window are equal.

### Wind classes

The starting wind of a jump depends only on the seed (`createStartWind`, called by `startTrainingJump`), so the
sample chooses seeds by wind before the jump begins. `windClassSeeds` reads the starting wind of 256 successive
seeds and for each class (`WIND_CLASSES`) takes the seeds with the highest score, from the strongest, without
repeats between classes (the classes chosen in this order):

- `head`: the strongest head wind, the most negative component along the hill (`xMPerS`);
- `calm`: calm, the lowest speed (`speedMPerS`);
- `tail`: the strongest tail wind, the most positive component along the hill;
- `variable`: the most variable wind, the largest scale of the random walk during the jump (`variabilityMPerS`).

On seeds 1-256 these are for example `head` 122, 253, 23, 125 (component -4.5 m/s), `calm` 182, 185, 27, 226
(0.04-0.53 m/s), `tail` 138, 202, 234, 10 (+4.5 m/s), `variable` 14, 33, 235, 102 (variability 0.44-0.47). A head
wind carries farther: the best jump with it is about 100 m, with a tail wind about 86 m.

### Sample

The rules are measured on seeded jumps. The sample (`PLAY_SAMPLE`):

- 16 seeds per wind class (64 in all), on which each player level and the bot without errors (wind alone) jump;
- the 4 strongest seeds per class (16 in all) in the takeoff aim search;
- the strongest seed of each class (4 in all) for the oracle, up to 60 jumps each;
- 12 designed jumps on the strongest seed of each class (48 in all);
- 16 jumps with random control (seeds from 1) as an extra blind check.

Each class thus has an equal share in each part of the sample. `PlaySample` takes the first seed of the wind sweep
and of the random jumps, so the same evaluation can be repeated on a disjoint sample. One evaluation is about 580
jumps and about 5.3 s on this machine, of which the oracle is 141 jumps and about 1.3 s (without the oracle about
440 jumps and 4 s, and earlier still 976 jumps and 7.8 s).

### Designed jumps

`DESIGNED_SCENARIOS`: a jump of the good player without errors at the aim from the search (the median of the best
aims), with one thing changed in each: the takeoff much too early (20 frames), early (4), late (-4 frames), no
takeoff; the flight pose leaning (body angle 0.6 rad), upright (0 rad), changed every 35 frames (in the other jumps
the flight is led by the trained policy, and the landing comes at 1.8 m); landing early (8 m above the landing
hill), on two legs (the right button only), no landing; in addition one jump that is late, with a changing pose and
no landing. Each jump has a name `<klasa>/<scenariusz>` (random jumps `random/<ziarno>`), and a rule's message
gives the name of the jump that broke it. On the Ćwiczebna hill the jumps without a takeoff (`fallType` 5) and
without a landing (`fallType` 4) fall; the random jumps end in a disqualification with a fall of type 2, 3 or 4.

Rules:

- `takeoff-window`: the median of the takeoff window over the seeds of the sweep at least 2 frames, so that one
  does not have to hit a single frame;
  a single frame;
- `takeoff-window-share`: a window of at least 2 frames on at least 75% of the seeds of the sweep. A 1-frame
  window happens from time to time on every hill (the edge of the takeoff falls, with a given wind, between two
  frames), so a minimum over a few seeds passed or failed by chance: on the Ćwiczebna hill the minimum over 4 seeds
  was 3 frames on five disjoint sets and 1 frame on the sixth;
- `takeoff-clean`: every seed of the sweep has at least one clean takeoff (a window of at least 1 frame), because a
  wind with which a clean takeoff is impossible would be unfair;
- `good-median`: the good player's median from K-20 to K+13 m (above K120 plus 1 cm per metre of K), so that the
  hill jumps to its size;
- `levels-ordered`: the medians grow from the weak through the average to the good player, because skill has to
  pay off;
- `skill-wins`: the good player jumps farther than the average one in at least 70% of the pairs of jumps with the
  same wind;
- `good-falls-in-class`: the good player does not fall in any wind class;
- `fall-rate`: the average player falls (or is disqualified) in at most 10% of jumps, the good one in at most 3%.
  The average player's threshold is looser than the earlier 5% (with 32 jumps): the average bot lands with a
  landing height spread of 0.5 m, so a single fall is the bot's error, not the hill's, and at 5% one more fall
  reversed the verdict (on the Ćwiczebna hill 0, 1 and 1 fall out of 32 in three disjoint sets). The good player
  should almost never fall. The Ćwiczebna hill also meets the former 5%;
- `best-short`: the median of the best jumps (over the wind seeds) at least K-10 m, otherwise the hill cannot be
  jumped to K; the median, not the worst seed, so that one strong head wind does not fail a fair hill;
- `best-past-landing-area`: the longest of the oracle's best jumps (one on the strongest seed of each wind class),
  that is the jump in the most favourable class (the message names it; on the Ćwiczebna hill it is the head wind,
  102.5 m with the end of the area at 120.8 m), at most 5 m behind the end of the landing area, so that nobody
  jumps beyond it. Previously this was measured by the takeoff aim search, which changed only the aim, while the
  oracle also searches the flight and the landing;
- `flight-time`: the median of the good player's flight at least 2.5 s, so that it is a real flight;
- `flight-height`: the 90th percentile of the greatest height above the landing hill at most 8.5 m (above K120
  plus 2.5 cm per metre of K), because the jumper flies close to the slope;
- `takeoff-speed`: the speed at the takeoff from 50 to 120 km/h, within the range of ski jumping hills;
- `wind-spread`: the standard deviation of the distance of the exact rival (wind alone) at most 11% of K, because
  the same wind carries farther in a longer flight (5.5% of K on the Ćwiczebna hill, up to 10.7% on the original's
  hills, at K205; with the trained player 8% was the bound);
- `stress-ends`, `stress-finite`: the designed and the random jumps end before the frame limit and give finite
  numbers;
- `stress-within-scene`: each of them stops before 380 m, where the scene ends;
- `stress-below-terrain`: the jumper's point goes at most 0.5 m below the terrain (0 m was measured on the
  Ćwiczebna hill).

### Verdict stability

A rule computed from a sample must give the same verdict on another sample, otherwise it measures the sample, not
the hill. The stability tests (`src/hills/hill-play.stability-*.test.ts`, the checks themselves in
`src/hills/test-support/hill-stability.cases.ts`) evaluate each own hill on three disjoint sets of seeds (wind sweep
1-256, 257-512, 513-768; random jumps 1-16, 17-32, 33-48) and require the same list of failed rules on each of
them. The own hills and the generated set are split among several files so that the files run in parallel; hills
whose K points are less than `NEVER_ALIKE_K_GAP_M` (9.8 m) apart, the only ones that can be too alike, stay in one
part of the set.

The checks have two levels. The ordinary test run (and the gate before a PR) evaluates in detail the training hill
(the first own hill), on the sample described above; `corepack pnpm test src/hills` takes a dozen or so seconds.
The stability test evaluates each own hill (it must pass all the rules) and the whole generated set, the large
hills with the simulation rules too, about 1.9 minutes on a quiet 4-core laptop with the files in parallel (5.5 to 6.5
minutes in one file), so it has a separate command, `corepack pnpm test:hills-stability` (the variable `HILL_STABILITY=1`
includes the files, which `vite.config.ts` otherwise skips). The gate before a PR of a change in these paths also runs them locally. CI runs them in the
`checks` job when a change touches `src/hills/`, `src/sim/`, `src/game/`, the workflow, `package.json` or
`vite.config.ts`, and also when it cannot be established what changed (a manual run, no previous commit).

### Equal chances

- The same inputs give the same result on every device: a test checks that a jump with the same seed, player and
  noise gives the same hash of the final state, and with another seed a different one.
- Skill must weigh more than the wind: the good player beats the average one in most pairs, and the wind alone
  moves a jump by a limited number of metres.
- No hill may require hitting a single frame: the takeoff window usually has at least 2 frames, and a clean
  takeoff is possible with any wind.
- No hill may let a good jumper land beyond the landing area.

One takeoff frame (1/70 s) is worth a few metres of distance. That is a property of the game's physics, common to
all hills, not a flaw of a particular hill.

## Picture checks

The picture tests (`src/render`) that say something about drawing hills go through all own hills (`OWN_HILLS`).
They take the numbers from the hill data: the K point from `kPointM`, the moments of the takeoff as a share of the
frames from the start of the inrun to the takeoff, the places from the profile. A new hill gets them without
changes to the tests.

- picture motion (`scene-motion.test.ts`): props, ends of the distance lines, birds and the moon keep to their
  places throughout a bot's jump, because each hill has different places for these things;
- props and lines (`scene-props.test.ts`, `scene-layers.test.ts`): wind socks, masts, inrun lamps and the K line
  stand on their surfaces and at their distance, computed from this hill's profile;
- scenery (`scene-scenery.test.ts`): trees, birds, the moon and the floodlight light on this hill's data, because
  the tree seed and the profile change their places;
- scenery away from the track: no tree stands on the jumper's plane or in front of it (trees are only on the
  layers behind the far edge of the landing hill, by construction), and the inrun supports end at the takeoff at
  the latest, because behind it they would stand in the landing hill;
- jumper figure (`jump-view.hills-*.test.ts`, the checks in `src/render/test-support/jump-view-hills.cases.ts`): every phase of the jump drawn without empty pixels, the figure on the snow
  and in the inrun track with a takeoff much too early, early, just before the takeoff and without a takeoff,
  because these cases depend on the length of the inrun;
- title (the same files): in the narrowest picture (256 px) and with the pause button moving the title
  farthest to the right, the whole text is in the picture and none of its pixels lies in the columns of the wind
  box and the start light; this is checked by the drawing, not only by the width computed in the format check;
- frame time budget (`frame-time.budget.test.ts`): drawing this hill's widest picture fits in the budget, because
  each hill's scenery draws differently;
- pixel snapshot (`jump-view.pixels.test.ts`): the first hill has the full set, each next one its own keys
  (moments of a jump with a telemark, 356 px, day, dusk and night, without snow and fog); a test on a copy of the
  hill with a different sky and trees checks that a different look gives different frames.

Tests for which any hill will do (bar, hints, texts, menu, sound, replays, save) stay on the first own hill, so as
not to multiply the test time.

## Hill similarity

`src/hills/hill-likeness.ts` measures how similar two hills are, from their data alone. `hillShape` describes a
hill with a few numbers: the K point, the drop of the landing hill below the takeoff at 12 equal horizontal
intervals from the takeoff to the end of the landing area (as a share of K, so hills of different sizes can be
compared), the horizontal length of this section as a share of K, the drop of the inrun, the takeoff angle and the
height of the takeoff above the landing hill. The look (sky, terrain, trees, supports, fences) does not count: a
repainted hill is the same hill.

`hillDistance` is the root mean square of the differences of these components, each divided by the scale from
`LIKENESS_SCALES` (10 m of K point, 0.02 K of landing hill drop, 0.05 K of landing hill length, 5 m of inrun drop,
1° of takeoff angle, 0.5 m of takeoff height). A scale is the difference a jumper feels on the hill, so no
component dominates by its unit alone; the landing hill points form one component, so that the profile does not
dominate by the number of points. The distance is 0 for the same hill and is symmetric.

Hills closer than `LIKENESS.tooAlike` (0.4) are taken to be the same hill: a copy of a hill of the original is
rejected, as is a hill too close to one already published. Since each scale is roughly the smallest difference a
jumper feels, a distance below 1 is a barely perceptible difference, and below the threshold practically none. The
threshold lies with a margin below the distance of the two nearest different hills of the original, so those
count as different. Shifting the profile numbers by a percentage of their value does not test for copies: 1% of
the absolute height moves the takeoff of a hill by metres, which already gives a different hill to jump on, judged
by the other rules like any new one.

### Comparison with the original's hills

`src/hills/original-hills*.local.test.ts` compare the own hills with the original's hills read from the player's
files (the checks in `src/hills/test-support/original-hills.cases.ts`; the range check is split among two files
by the own hills' size, so they run in parallel). It works only with `DSJ2_GAME_DIR` set (like the golden tests), never in CI; with the variable set and
without the files it ends with an error, not a skip. Nothing read from the game files goes into the repository or
to the disk. It checks that no own hill is too similar to a hill of the original, that each plays within the range
of the original's hills with a K point within 15 m of its own (the best distance and the good player's median
relative to K, the speed at the takeoff, the flight time, the takeoff window, the spread from the wind as a share
of K; the range widened by a margin for the spread of the measurement), that the original's hills pass the format
check, and that the exact rival keeps within the oracle margin on every band of sizes (comparison with the oracle
above; the message gives the table of bands).

```sh
DSJ2_GAME_DIR=<katalog gry> corepack pnpm test src/hills/original-hills
```

## Geometry fingerprint and identifier

`hillFingerprint` (`src/hills/hill-fingerprint.ts`) is an FNV-1a hash (32 bits, 8 hexadecimal digits) of the K
point and the 20 numbers of the built profile, each as 4 bytes of a single-precision value (little-endian). The
look does not enter it. A test pins the fingerprint of each own hill. A change of the geometry means a new
identifier, and the old one goes to `RETIRED_OWN_HILL_IDS` (`src/game/hill-choice.ts`): records and replays stay
with the old shape and never meet the new one.

The hill "Ćwiczebna" currently has the identifier `own-3`; `own-1` and `own-2` are its earlier shapes. On `own-2`
the inrun was shorter (`startXM` 11.4 and `flatEndXM` 10 instead of 10.6 and 9.2) and the best jump landed around
the K point; on `own-3` it lands a few metres beyond it, as on hills of a similar size.

## Hill generator

`generateHill(character, seed)` (`src/hills/hill-generator.ts`) makes a hill from a few values a person can
understand instead of fourteen profile numbers. It serves the player training and the tests; it is also the basis
of a future hill editor for players. Twenty hills of the set are in the game: ten up to K120 (`own-14` to `own-23`,
since 2026-10-17) and ten from K135 to K260 (`own-24` to `own-33`, since the checks judge hills of every size). Each
has its own gate position, flat part, takeoff height, inrun steepness and best jump target (the earlier `own-4` to
`own-13` had one gate setting, one inrun look and one target for all, so new ones under new identifiers replaced
them, and the old ones are retired). Their data is copied into `own-hills.ts` with its own scenery seed, and
`SET_HILLS_IN_GAME` (`src/hills/test-support/generated-hills.ts`) binds the characters of the set to these
hills. The set takes them as they are in the game (`keptHill`: a measurement of the best jump and the same checks
as when generating, without the search), instead of generating them anew, because a later change of the
construction must not change a hill the game already has (records and replays belong to the fingerprint; the
fingerprints are pinned by `hill-fingerprint.test.ts`). In the similarity check they count like the other hills
of the set. The larger hills of the set wait for a bot that plays reliably on them. The way into the game is the
same as for every own hill (section "Adding a hill": data into `own-hills.ts`, a new `id`, checks, snapshot,
acceptance on a device).

### Hill character

`HillCharacter`:

- `kPointM`: the size of the hill, the K point;
- `landingSteepnessDeg`: the greatest slope of the landing hill;
- `landingAreaPastKShare`: how far beyond K the landing area reaches, as a share of K (a wider landing hill with a
  larger one);
- `knoll`: `short`, `medium` or `long`: how long the landing hill rounds off behind the takeoff before it becomes
  steep;
- `inrunSteepnessDeg`: the slope of the straight part of the inrun;
- `takeoffAngleDeg`: the takeoff angle;
- `look`: the sky theme (`day`, `dusk`, `winter`); the look does not change the jumping, and the positions of the
  supports, trees and distance marks follow from the profile;
- optionally (`CHARACTER_LIMITS`): `gateXM`, where the start gate stands (the start of the inrun, 6..34 m, 10 by
  default); `flatBehindGateM`, the length of the flat part behind the gate (0.5..7 m, 1.4 by default);
  `bestPastKM`, the target of the oracle's best jump in calm (from K+3 to at most K+18, a width of at least 3 m,
  the end at least 2 m before the end of the landing area from the character, so that the rule "best jump past
  the landing area" does not fail; K+3..K+8 by default); `tableHeightM`, the height of the takeoff above the
  landing hill (1.2..2.6 m within the rule's 1..3 m, 2 by default). A character outside these ranges is an error
  (`characterProblems`, rule `generator.character`). A character with any of these values has an identifier with
  an FNV-1a hash of all the character's numbers (`gen-k<K>-<skrót>-<motyw><ziarno>`), because the full notation
  would exceed the format's 40 characters; characters without them keep the existing notation.

`seed` fixes the colours (the inrun walls from 7 ramps of the scene palette, the start gate from 6, the fences
from 8; `LOOK_COLOURS`, lists of different lengths give neighbouring seeds different combinations), draws from
`LOOK_RANGES` the supports (one under the deck, a wide one under the end of the inrun, ending 0.1 to 0.8 m before
the takeoff, as on every hill of the original, and up to three thin or wide ones between them), the heights of the
walls above and below the track, the length of the deck (the deck with the flat part takes 3.5 to 9% of K; a
longer one on a small hill looks like a pier), the height of the terrain, the number of trees and the start of
the fences, and also the end of the identifier; the profile depends only on the character. The identifier
(`generatedHillId`) is a notation of the character, so the same character gives the same identifier.

### Construction

All constants are in one object `GENERATOR` (with the unit in the name). They were chosen from the physics and
the game's goals, not from the numbers of the original's hills.

- The inrun begins at the gate (`gateXM`, 10 m by default), with a flat part behind it (1.4 m by default), runs
  straight at the angle from the character and passes with a parabola into the takeoff angle. The radius of the
  curve grows with the size of the hill (0.25 K), because a faster jumper needs a gentler curve for the same
  pressure on the skis, at most up to 40 m (from K160): on a large hill a 0.25 K curve takes so much of the scene
  that no room is left on the straight for the speed the hill needs; and at least 19 m: 0.25 K gave a small hill a
  curve so tight that at a lower speed it pressed the jumper harder than on larger hills. The inrun begins at the
  gate from the character (10 m by default) with a flat part behind it. The joins are smooth by the construction
  of the profile itself (`buildHillProfile` computes the coefficients of the curve and of the outrun).
- The takeoff lies at a height of 200 m, the landing hill begins below it by the takeoff height from the character
  (2 m by default, in the middle of the range of the takeoff height rule).
- The landing hill is the format's tanh curve, `y = cY - A tanh((x - cX) / w)`. The greatest slope is `A / w`, so
  `A = w tan(nachylenia)`. The takeoff lies a number of widths depending on the knoll (1.2, 1.35 or 1.5) before the
  centre.
- The outrun joins the curve 0.3 widths beyond its centre, while the landing hill is still steep, and flattens out
  with a parabola of curvature `tan 32° / (2 · 32 m)`: the lowest point lies 32 m (horizontally) beyond the end of
  the landing area, that is beyond the place where the parabola becomes gentler than 32° (the rule requires 30 m;
  40 m before 2026-10-22, which left the large hills no room in the scene).
  One rule for every size: the landing area ends on the curve of the outrun, not far out on the slowly flattening
  tanh curve, which led large hills out of the scene. When the landing hill is so gentle that the curve reaches 32°
  before this place, the outrun joins there.
- The slope at the join, and so the parabola down to 32° and its arc, depend only on the slope of the landing
  hill. The arc of the tanh curve between two places a fixed number of widths from the centre is proportional to
  the width, so the width follows from a single division: the arc of the curve from the takeoff to the join plus
  the arc of the parabola to the end of the landing area has the length K times one plus the share from the
  character. The K point is the place where the arc from the takeoff reaches K.
- When K falls farther from the steepest place than 0.8 of the style rule's limit (`max(12 m, 0,096 K)`), the
  landing area gives way: its length is computed so that K lies exactly at this distance. The knoll does not give
  way, because a long, flat knoll throws the jumper high above the slope (this came out in trials: high flights, a
  large spread from the wind).
- The length of the straight part of the inrun is set by a short deterministic search: the oracle's best jump on
  the calmest seed (`CALM_SEED`) grows with the length of the inrun, so the secant method with a bracket (the
  Illinois variant) between the shortest inrun (1 m of straight) and the longest the format (the end of the
  straight at most at 150 m) and the scene (the lowest point of the outrun at most at 354 m, 25 m before the scene's
end, because a jumper coasts 15 to 23 m up the outrun past its lowest point) allow looks for a
  jump within the target from the character (from K+3 to K+8 m by default). The oracle starts from the reference
  player (`REFERENCE_PLAYER_POLICY`), not from the trained one, so the hills do not change after another training.
- The profile numbers are rounded (lengths to 0.01 m, slopes to 0.0001, curve coefficients to 0.000001), and the
  transcendental functions come from `deterministic-math.ts`, so the result is the same in every engine.

### Targets and report

Targets (`GENERATOR_TARGETS` and the game rules): the oracle's best jump in calm within the target from the
character (from K+3 to K+8 m by default), every admission rule, every style rule, every simulation rule and a
similarity distance of at least `LIKENESS.tooAlike` from
every hill of the catalogue (`catalog`, the own hills by default) and from the hills given in `others`.

`generateHill` returns the hill data and a report: the best jump in calm and its distance from K, the length of
the inrun straight, the number of oracle runs, the share of K of the landing area, the problems of the style
rules, whether the jump target was reached, whether the simulation rules judged it and the nearest hill. The
checks (`checkGeneratedHill`) go from the cheapest: format, admission rules, similarity, simulation rules. A hill
that does not pass the format, an admission rule, a simulation rule or is too similar to another is an error
(`HillGenerationError` with the list of problems), never a silent result. The style rules and the range of the
best jump are targets: the report says whether they were reached.

### Generated set

`src/hills/test-support/generated-hills.ts`: a fixed list of 26 characters from K45 to K260 (a little below the
smallest and above the largest hill of the original), generated in turn, each hill checked against the previous
ones, so no two are the same hill. The ten hills that are in the game are taken by the set as they are
(`SET_HILLS_IN_GAME`; in the table 0 oracle runs in the search, and the share of K of the landing area measured).

Numbers from the report (without the simulation rules, as the training generates it): the slope of the landing
hill, the landing area beyond K from the character (in brackets: after giving way to the K point), the gate
position (m), the flat part behind it (m), the best jump target (m beyond K), the height of the takeoff above the
landing hill (m), the knoll, the inrun, the takeoff, the length of the inrun straight from the search (m), the
best jump in calm minus K (m), oracle runs, the similarity distance to the nearest hill:

| K | landing hill | area past K | knoll | inrun | takeoff | gate | flat | jump target | takeoff height | straight | best - K | oracle | similarity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 45 | 37° | 0.25 (0.25) | medium | 46° | 10° | 7.0 | 0.8 | 4..8 | 1.6 | 5.5 | 7.1 | 6 | 2.54 |
| 50 | 39° | 0.30 (0.30) | long | 44° | 11° | 8.0 | 2.5 | 3..7 | 1.6 | 8.9 | 6.3 | 0 | 0.65 |
| 60 | 38° | 0.26 (0.26) | long | 50° | 11° | 12.0 | 2.5 | 5..9 | 2.4 | 8.2 | 8.3 | 5 | 1.03 |
| 60 | 36° | 0.24 (0.24) | medium | 52° | 10° | 18.0 | 0.8 | 3..6 | 2.4 | 5.5 | 5.5 | 0 | 0.46 |
| 70 | 38° | 0.26 (0.26) | medium | 38° | 9° | 11.0 | 5.0 | 3..7 | 2.0 | 24.3 | 7.0 | 0 | 0.79 |
| 75 | 37° | 0.28 (0.28) | short | 55° | 9° | 20.0 | 1.5 | 3..7 | 1.3 | 5.0 | 6.6 | 0 | 0.65 |
| 85 | 41° | 0.20 (0.20) | medium | 47° | 8° | 9.0 | 6.0 | 3..7 | 2.2 | 11.1 | 4.3 | 0 | 1.05 |
| 95 | 39° | 0.24 (0.24) | short | 53° | 10° | 15.0 | 3.5 | 7..11 | 1.3 | 8.7 | 8.0 | 7 | 1.12 |
| 95 | 38° | 0.25 (0.25) | short | 42° | 11° | 14.0 | 2.0 | 7..11 | 1.8 | 29.0 | 9.8 | 0 | 0.66 |
| 100 | 39° | 0.26 (0.26) | medium | 50° | 10° | 28.0 | 3.5 | 6..9 | 2.5 | 15.9 | 6.5 | 0 | 0.76 |
| 105 | 42° | 0.18 (0.21) | medium | 45° | 9° | 7.0 | 1.0 | 4..8 | 1.5 | 18.6 | 5.7 | 0 | 0.72 |
| 115 | 37° | 0.28 (0.28) | short | 53° | 10° | 20.0 | 4.5 | 5..8 | 2.1 | 17.2 | 7.7 | 0 | 1.18 |
| 120 | 39° | 0.26 (0.26) | short | 48° | 9° | 12.0 | 2.8 | 4..8 | 2.0 | 22.1 | 7.0 | 0 | 0.76 |
| 135 | 38° | 0.20 (0.20) | medium | 50° | 10° | 20.0 | 5.0 | 10..14 | 2.2 | 33.0 | 10.2 | 8 | 1.76 |
| 140 | 36° | 0.30 (0.30) | medium | 43° | 8° | 8.0 | 6.0 | 10..13 | 1.8 | 79.6 | 11.3 | 6 | 2.49 |
| 150 | 40° | 0.25 (0.25) | medium | 45° | 9° | 25.0 | 1.0 | 6..10 | 2.6 | 46.2 | 9.8 | 7 | 1.08 |
| 160 | 37° | 0.18 (0.18) | medium | 42° | 11° | 14.0 | 4.5 | 9..12 | 1.4 | 100.5 | 11.8 | 6 | 2.30 |
| 170 | 39° | 0.20 (0.20) | medium | 55° | 10° | 30.0 | 2.0 | 8..12 | 2.1 | 30.0 | 8.2 | 6 | 1.84 |
| 185 | 39° | 0.20 (0.20) | short | 45° | 10° | 18.0 | 7.0 | 11..15 | 1.2 | 68.3 | 11.4 | 5 | 1.11 |
| 200 | 40° | 0.18 (0.18) | medium | 47° | 10° | 9.0 | 3.0 | 15..18 | 2.5 | 77.1 | 16.6 | 2 | 1.91 |
| 200 | 41° | 0.20 (0.20) | short | 48° | 11° | 22.0 | 0.5 | 4..9 | 1.7 | 49.4 | 4.7 | 4 | 1.20 |
| 215 | 42° | 0.15 (0.15) | medium | 48° | 11° | 16.0 | 5.5 | 9..13 | 2.3 | 64.0 | 9.6 | 2 | 1.19 |
| 230 | 44° | 0.15 (0.16) | medium | 54° | 10° | 13.0 | 1.8 | 13..17 | 1.5 | 34.0 | 14.9 | 5 | 1.38 |
| 230 | 45° | 0.12 (0.17) | medium | 54° | 9° | 11.0 | 4.0 | 6..9 | 1.9 | 25.7 | 7.7 | 8 | 1.10 |
| 245 | 45° | 0.12 (0.16) | medium | 56° | 10° | 7.0 | 2.8 | 6..12 | 2.6 | 24.4 | 7.9 | 8 | 1.09 |
| 260 | 47° | 0.12 (0.17) | medium | 56° | 10° | 7.5 | 3.2 | 14..18 | 2.2 | 21.9 | 18.0 | 11 | 0.87 |

Each hill outside the game has its own gate position, flat part, takeoff height and best jump target (gate
6.5..30 m, flat part 0.5..7 m, takeoff 1.2..2.6 m, targets from K+3..K+7 to K+14..K+18). All are within the
target and pass every rule, the simulation rules too (the stability test plays all of them); the nearest pair is
0.46 apart. The second K120 hill has a short knoll: with a medium knoll it did not pass the rule of the spread from
the wind. The large hills changed on 2026-10-22, when the simulation rules began to judge them: a short knoll above
K120 threw the jumper too high (9.5 to 13.6 m) and a long one made the hill too sensitive to the wind (14 to 22% of
K), so from K140 the knolls are medium but for two short ones (K185, K200); the hills from K230 have a steep
landing hill (44..47°) and inrun (54..56°), like the original's K250, so that the outrun stops a jumper inside the
scene. A second K260 (a short knoll) was dropped: it either flew too high or missed its target. The K245 target is
6 m wide, because one frame of the takeoff moves its best jump by several metres.

A unit test generates the smallest hill of the set (with the simulation rules) and one too large for the scene (a
report with a missed target and a landing area that gave way). The whole set with the simulation rules is
generated by the stability test (`corepack pnpm test:hills-stability`).

## Adding a hill

1. Copy the data of an existing hill in `src/hills/own-hills.ts`, give it a new `id` and name, change the numbers.
2. `corepack pnpm test src/hills`: format, geometry rules, simulation checks and fingerprint (add the new
   fingerprint to the table in the test); then `corepack pnpm test:hills-stability`: the same verdict on disjoint
   samples.
3. `corepack pnpm test src/render`: picture checks; the new pixel snapshot keys for the new hill are written by
   `corepack pnpm test -u src/render/jump-view.pixels.test.ts`, and only they should appear in the diff.
4. Review the pixel snapshot and the browser tests that point to the built-in hill (`e2e/support/app.ts`; the
   press times in `e2e/support/jump-timing.ts` were measured on this hill; the test
   `src/game/scripted-jump-timing.test.ts` checks that they still give a clean landing with a margin of 0.1 s).
5. Jump on a computer and on a phone.
6. Raise the version as with every change to the game.
