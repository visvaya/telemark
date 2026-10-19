# Jump scene (v2.10P)

How the original draws the hill and the background (0baf:344c, tables from 0baf:1e89) and how the port does it:
`src/render/jump-view-scene.ts` and the modules `scene-*.ts` and `hill-layer-tables.ts`. The data of each hill:
`hill-format.md`, the jumper figure: `jumper-figure.md`.

## Projection: layers in perspective

The original has no single projection of the scene. It draws it from layers 1..24, each at scale `p` (a Single
table at `DS:14EE`; port: `LAYER_SCALE`), around a vanishing point near the top edge of the screen:

```
X = 160 + p·(14·(x − x_skoczka) − 9)
Y = 12 + p·(14·200/240·(y_skoczka − y) + 58)
```

Distant layers (`p` < 1) move slowly, near ones fast. The layers of the hill itself:

| Layer | p | What lies there |
|---|---|---|
| 17 | 0.933 | far edge of the landing hill and the far fence |
| 19 | 1.182 | far side of the inrun track |
| 20 | 1.33 | the jumper's plane (ski tracks, shadow, gate) |
| 21 | 1.52 | near side of the inrun track and the near wall |
| 23 | 2.313 | near edge of the landing hill and the near fence |

The landing hill is thus a band between two copies of the same profile at different scales, and the distance
lines join the same profile point on layer 17 and on layer 23. The tilt of a line depends on how far in front of
or behind the camera the point lies: a line under the camera is vertical, in front of it it leans to the right,
behind it to the left.

Camera: `camX = 14·x_skoczka + 9`, `camY = 14·200/240·y_skoczka + 70` (the offsets `DS:4D36`, `4D3A` act only in
the replay studio cameras). Layer offset: `trunc(p·camX)` and `trunc(p·camY − 12·(p − 1))`. Layer table: index
`j` is `x = (j − 160)/(14·p)`, the value is `−round(14·p·h(x)·200/240)`; screen column `sx` shows index
`przesunięcie + sx`.

The jumper figure has scale 1 (14 px/m) and stands at the place of layer 20: the foot in column 148, in row 87.

## Drawing order

The scene is made of columns: procedure 0baf:2f7f fills a segment of a column with palette indices from one to
another (8.8 values; the step is the difference divided by the number of rows, the first row already gets one
step).

1. Sky: 16 bands of 3 rows, indices 240..255, fixed.
2. Background: snow bands between layers 1, 2, 4, 7, 11 and 17 (each cut by the far edge of the landing hill),
   with the trees of layers 1..16 between them.
3. Landing hill: from layer 17 to 23, colours `20·cos(atan(14·nachylenie)) + 32` and `15·cos(...) + 48`.
4. Lines: every 5 m from `4648` (green, index 84), K point (red, 75), hill record (blue, 107). Place: the profile
   point along the arc from the takeoff at the distance + 0.15 m (record + 0.25 m), 1eee:08fb.
5. Far fence: 5 rows above layer 17, a post every 60 indices; from the takeoff + 1 m + `4651`.
6. Inrun supports, then the track (far rail, track, start platform with the back wall, end of the track with the
   front face of the takeoff), ski tracks (darkened snow indices two rows above and below the jumper's line).
7. Shadow, far half of the gate, jumper, near half of the gate.
8. Near wall of the track (in front of the jumper), near fence (11 rows above layer 23, a post every 130
   indices), snow in front of the near edge.

## Palette

Built by formula (003f:9df1): 13 ramps from black through a hue to white; the middle of the ramp shifted towards
grey (`c·0,85 + suma·0,05` in the original's 80-bit arithmetic, with halves rounded to even). Only the sky
depends on the hill (003f:9da5): entries 241..255 blend into the hill's sky colour. Port: `scene-palette.ts`.

## Background

The five background layers mix the hill profile with sine waves (0baf:1c31: 5 sets of 4 waves from the hill's
seed; the original also computes average phases and frequencies, and then immediately overwrites them with new
draws):

| Layer | Height | Colour |
|---|---|---|
| 1 | 0.03·profile + 0.97·(waves 1 + D) | fixed, 62 → 58 |
| 2 | 0.4·profile + 0.6·(waves 2 + D) | fixed, 58 |
| 4 | 0.6·profile + 0.4·(waves 3 / 1.5 + D) | `8·cos(...) + 46` |
| 7 | 0.8·profile + 0.2·(waves 4 / 2.5 + D) | `12·cos(...) + 38` |
| 11 | 0.95·profile + 0.05·(waves 5 / 2.5 + D) | `18·cos(...) + 34` |

`D` is the base height `464E`.

## Trees

0baf:602e places, once per hill and from its seed, spruces and pines on layers 2..15 (size `t` from 2 to 12, the
largest on layers 12..15), at most 20 per layer; from 30 m before the takeoff to 20 m behind it only on layers
below 11. Height of the base: the layer table or a mix of two neighbouring key tables according to `p`. The
original draws bitmaps from `Dsj.dat` (resources 100..121), one per size.

The port draws its own trees (`tree-bitmaps.ts`) at the same places and sizes: spruces with drooping tiers of
branches and pines with a bare trunk (orange in the crown) under a crown of flat clumps; snow on top of the
branches; four shapes of each size, chosen by the tree's place; distant pines with a dense crown. On layers 2..10
some of the original's trees get a clump of neighbours of the same species (`scene-trees.ts`, `sceneTrees`), and
the trees of farther layers fade slightly towards the snow colour (up to 20 % on the farthest layer, no change
from `p` = 0.35).

## HUD

The wind frame (0baf:3389) and the start light have the sizes and colours of the original's bitmaps (resources 11
and 13 from `Dsj.dat`), drawn by the port (`jump-view-hud.ts`):

- Arrow (1cb6:1ee9): centre at (13, 8) of the frame, tail and head at `±(11 cos a, 5,5 sin a)`, barbs to
  `(8 cos(a ± 1,25), 4 sin(a ± 1,25))`, `a` is the direction of the indicator; first a shadow in colour 0x44 one
  row lower, then 0x47, lines with a 2x2 brush. A positive `sin a` is the head pointing down: the crosswind
  component (with no effect on the jumper) lies into the depth of the scene, squashed by half. The snow follows
  the same vector (`game/wind-display.ts`).
- Wind socks (an addition of the port) take the same indicator direction and speed, but as a cone in the world:
  with the wind's strength they rise from hanging towards horizontal (full at 4.5 m/s), always with a slight sag
  of the fabric (0.25 of the horizontal length). The part across the hill is shortened to 0.15 and drawn up the
  screen when the sock points away from the viewer, down when towards them; the sag is larger than this rise, so
  the sock never stands above horizontal and does not jump from below to above. The visible length has a lower
  limit of 0.4, so a sock seen head-on is a short stub with a direction, and in a pure crosswind it does not hang
  as in calm.
- Start light (0baf:5581), while the jumper stands on the gate: red when the countdown has not started yet
  (16 s); green from 15 s; from 10 s the green blinks (lit when frame mod 70 < 25); after the time is exceeded red
  again.
- Judges' notes: 27x11 frames from row 57 every 12 rows, text 2 pixels from the left edge of the frame,
  right-aligned in a 4-character field like `Str(note:4:1)` (8.0 stands under the 0 and 5 of 10.0); up to 45
  frames after the last one all dimmed (0xC7), then the counted ones bright (0xCC), the discarded ones dimmed.
- Bar: 13 rows (top line 0x11, left column 0x0A, fill 0x05, bottom line 0x08), texts 5 pixels from the edge and
  3 rows below the top line, in colour 0x79; after the jump the distance with a small "m" from 47% of the width
  (column 150 of 320) in a right-aligned 5-character field, like the original's `Str(x:5:1)` (on its screenshot
  89.5 m begins in column 156). The original writes the points from column 248 in a 7-character field (128.5
  begins in column 260); the port ends them at the right edge of the bar, 5 pixels from it, where the speed stood
  before the landing, because on the wider view column 248 of 320 left them in the middle of the empty part of
  the bar.
- The port writes numbers in the picture (distance, points, judges' notes, speed, wind) with a decimal comma,
  like the game's screens and Polish spelling; the original writes a point. The points are followed by "pkt", so
  that they are not taken for a second distance, and the speed has the unit "km/h"; both in lower case, like the
  original's small "m" after the distance. Each unit is separated from the number by the same thin space (space
  U+2009, 2 pixels), and lower-case letters stand tighter than capitals (letter width and a pixel of spacing); the
  original writes "m" right after the number.

The font (`pixel-font.ts`) is our own, in the style of the original, and every shape is designed anew (a
comparison with the original's font at every offset within the cell: only the space, the full stop and the colon
match, and no other character differs from it by one pixel; the exclamation mark, later straightened to a
vertical stroke with a dot because the slanted one looked like a question mark from a distance, and the small k,
p, t, h, added later, were not compared with it). A character has a 5x6 body with vertical strokes 2 px wide and
a shadow: an empty pixel under a body pixel is shadow, so the shadow fills the insides of letters, the inner
corners and the seventh row under the letter. Each character takes 5 columns and 1 column of spacing, as in the
original. Colour from a palette ramp as in the original: index = value - 7 + ramp + `(2 wiersz + kolumna) div 6`
(row 1..7, column 1..5; the body has value 6, the shadow 1), so the body is ramp - 1, the shadow ramp - 6, both
lighter towards the bottom right corner. With a uniform colour the shadow has half of its brightness.

Set: A..Z, 0..9, `. , : ; / + - = ! ? ( ) ' " % ·`, space, the lower-case letters of units (m, k, p, t, h and a
thin slash; like the original's "m", "p" reaches two rows below the line) and Latin Extended capitals with ß.
Letters with diacritics are the base letter with the mark in two rows above it (ogonek, cedilla and comma below
it); the dots, the acute and the dot above take the upper of these rows, so a row of shadow separates them from
the letter. Ł, Đ, Ø, Æ and ß have their own shapes, lower-case letters are drawn as capitals, combining marks are
skipped (a small "i" with a combining dot is İ). O is angular and 0 has a diagonal in the middle, so that "K120"
and "SŁOWENIA" read at 1x. The original places the accent one row higher, overlapping the letter; the port keeps
two separate rows for the marks, for which the bar has room.

The menu screens write headings, labels and everything that is chosen in the same font: the family "Telemark
Screen" (`src/ui/fonts/telemark-screen.woff2`) is a COLRv0/CPAL colour font generated from the same characters.
`scripts/export-screen-glyphs.mjs` writes the pixels of each character (`glyphPixels`, `fontCharacters` from
`pixel-font.ts`) as JSON, and `tools/font/make_screen_font.py` builds the font from it: each character has a shadow
layer (palette entry 0, which the style sheet overrides for each shade through `@font-palette-values`) and a body
layer in the text colour; the outline of the character alone is the body, for a browser without colour fonts.
Grid: 8 pixels per em from two rows of marks above the capitals to the baseline, on which the last row of the body
stands; the shadow and the marks below the letter go under it. Each character is 6 pixels wide, lower-case letters
point to the characters of the capitals. Next to the font lies the SHA-256 hash of the export
(`telemark-screen.glyphs.sha256`); `scripts/lib/screen-font-glyphs.test.mjs` compares it with a fresh export, so a
change of the characters without rebuilding the font stops `pnpm test:scripts`. The commands are in the header of
`make_screen_font.py` (packages needed: `tools/font/requirements.txt`). Sizes on the screens are multiples of 8 px,
so that the pixels stay sharp.

Additions of the port: the hill name in the top left corner from (5, 5) (top edge of the capitals; a mark above a
capital lies in row 3, at the height of the top frame of the wind box), where the original writes the name of the
replay file, in the colour in which it writes it (0xCB), and like it without a shadow (readable over the sky and
the inrun); when the pause button lies in that corner (control by horizontal tilt), the name stands to the right
of it, vertically centred on the button. On the bar the phase label (ramp 0x58) and the speed, white with a darker
shadow: in the grey ramp 0x3C a shadow five steps lower barely stood out from the letters. The new record line is
also without a shadow, as in the original; it blinks every half second, counted from the landing frame, so it
always begins with a full half second of visibility.

## Places of world objects in the picture

World objects standing on something or hanging in the background (props, line ends, trees, birds, the moon, the
start gate) are placed in the picture by the port through `src/render/scene-anchor.ts`, in one of four places:

- on the drawn surface of a layer (fence, rail, edge of the landing hill): the column nearest to the table index,
  the row of the surface under that column (`onSurface`; the end of a distance line with its own height:
  `onSurfaceAtHeight`). A prop is in the column of its index or, in square pixels, where the view skips that index,
  in the neighbouring column. The places of the props come from functions in `scene-extras.ts` (`sockPlaces`,
  `mastPlaces`, `inrunLampPlaces`), which both the drawing and the motion test use;
- on a background layer, with its scrolling (`layerPlacer` for trees, `layerScroll` for birds);
- in the sky, only with the drift of the stars (`skyDrift`; the moon chooses its place once per jump,
  `viewAtStart`);
- on the screen itself (interface): with no world underneath.

The start gate stays with the original's computation (`gatePlace`: a rounded column and an exact row), because
that is how the original draws it; this function serves only the gate. Everything drawn column by column stays
outside the module: the surfaces from the layer tables (`scene-layers.ts`, `hill-layer-tables.ts`, the files of
the landing hill, the inrun, the background and the mountains) and the night light spill in `scene-floodlight.ts`,
which takes the rows of a column from the layer scrolling itself, and from the module only the world x shown in
the column (`worldXAtDepth`). The jumper's shadow and the figure have their own fixed column in the picture.

The test `scene-anchor.guard.test.ts` makes sure that files outside the module and the primitives do not call the
projection directly, and that the props file (`scene-extras.ts`) neither samples picture columns nor reads surface
rows. In the files that draw surfaces, the test cannot tell a surface row from a place computed by hand; there the
props and the lines are guarded by `scene-motion.test.ts` (described in `testing.md`).

## Differences of the port (deliberate)

- The view has square pixels and a width of 256 to 480 columns: a column of the port corresponds to 6/5 of a
  column of the original (`SQUARE_PIXEL_WIDTH`), the centres of the screens coincide; the tables are also computed
  outside the original's range.
- A tree that the key table does not reach in the original (far behind the gate) gets in the original a height
  from outside the table; the port puts it on the ground.
- A line going off the screen: the original clips only its rows (changing the slope), the port draws it whole and
  clips the pixels.
- Additions of the port: time of day and weather, mountains in the background (`scene-mountains.ts`: a range of
  peaks on the farthest background layer, moving at half its speed, with a haze towards the sky colour), wind
  socks and masts with floodlights on the far fence, lamps on posts along the inrun, stars and the moon (drawn
  after the mountains, only on the sky; the moon's place chosen once per jump, for the camera at the start, where
  most of the sky is visible; afterwards it moves only with the stars, and the mountains pass in front of it; a
  disc of radius 4 to within half a pixel), birds (in no phase of flight are they a flat stroke; they fly in
  background layer 7 above the top of the inrun and move with it horizontally and vertically, so the picture
  leaves them up high when the camera follows the jumper down; their places, counted from the centre of the
  picture, do not depend on its width), the record ghost (`scene-extras.ts`, `jump-view-ghost.ts`).
- The picture columns in square pixels skip every sixth index of the layer table (6 columns of the original to 5
  of the picture), so the fence and the edge under a given place take their height from the index the column
  happens to show. The sock, the mast and the inrun lamp stand in the column whose index lies nearest to their own
  (at a tie, the left one), on the table row for that index, so they do not jump by a row relative to the fence or
  the rail while scrolling. The ends of the distance lines keep the original's height when their column is shown,
  and otherwise move to the nearest shown one and change row as much as the edge (`nearestViewColumn`). The
  original's snow (single pixels on the layers, intensity drawn when entering the hill and stored in the replay)
  is replaced by the port's own.
- Dusk and night (additions of the port, `palette.ts`): the background has a "far" palette (warmer and darker at
  dusk, in moonlight at night), the hill a "near" one. At dusk both have the same warm tint, and the background
  is only slightly darker; a weaker tint of the hill drew a sharp border along its far edge. At dusk the floodlight
  light reaches 28 rows above the far edge of the hill: the pixels of the background and the trees shift towards
  the colours of the near palette, at the edge by 55%, higher less and less (with the square of the distance), the
  sky stays unchanged (`drawFloodlightSpill` in `scene-backdrop.ts`). At night the background stays in moonlight,
  and the floodlight light lies on the hill (`scene-floodlight.ts`): the hill is fully lit from 13 m before the
  first mast (masts every 30 m from 12 m behind the takeoff, so farther on always within reach of one) to the end
  of the outrun; higher up, under the inrun, it weakens by one step every 1.5 m: seven steps shift the colours from
  9 to 60% towards the far palette, in small stairs like the bands of the original's palette. The step of a pixel
  depends on the place in the world it shows (the camera offset counted in whole columns, like the scrolling of
  the layers): the rows between the far and the near edge pass in depth from layer 17 to 23, so the step borders
  lie on the hill like the distance lines and do not travel with the camera. The snow in front of the near edge has
  no shape of its own: its depth grows by a fixed amount per row from the near edge, so when the camera moves along
  the hill the steps stay in place, and vertically they move together with the near edge. The inrun and its
  supports stay lit (inrun lamps).
- The outfit preview and the icon are the same scene without the interface, cut out around the jumper
  (`drawJumperPreview`).

## Verification

- **[measurement]** The scene drawn by the port in the original's geometry (320 columns, 14 px/m) matches pixel
  for pixel the emulator's screenshots (`tools/re`) for Karpacz, England K50, Germany K120, Zakopane 1 and
  Slovenia K250, except the trees, the interface and the outfit colours (comparison of 2026-10-15).
- **[measurement]** `src/render/hill-scene.golden.test.ts` compares with the stored state of the original after
  each of the 37 hills is set up: the palette (768 bytes), background waves, base height, lines, starts of the
  fences, inrun walls and supports, the gate and the trees (place, size, height; without the trees described
  above).
