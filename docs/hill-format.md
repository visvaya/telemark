# Hills in the original's files (v2.10P)

The hill geometry is not in `Dsj.dat` but in the code of `Dsj.exe`, as constants passed to the procedures that
set up the profile and the scenery. `Dsj.dat` supplies the names (and graphics and sounds). Reading:
`src/original/` (profile: `hill-table.ts`, look: `hill-look-reader.ts`). How the original draws the scene from
this data: `jump-scene.md`.

The game's own hills have a separate format, described in [hills.md](hills.md).

## Hill table in `Dsj.exe`

Procedure 0baf:631c (argument: hill number 1..37) compares the number with successive values:

```
cmp al, N ; je +3 ; jmp <next comparison>
push ... ; call 1eee:051f      ; inrun
push ... ; call 1eee:06e1      ; landing hill and outrun
push ... ; call 1eee:0437      ; inrun supports
push ... ; call 003f:9da5      ; sky colour
push ... ; call 0baf:1c31      ; background terrain waves
call 0baf:1e89                 ; scene layer tables (no arguments)
push ... ; call 0baf:602e      ; trees
[loops hiding trees]           ; only hills 4 and 9
jmp 0baf:8843                  ; the last branch (37) falls through without a jump
```

The parameters are the immediate arguments of the PUSH instructions. Pascal pushes arguments from left to right,
a Single as the high word, then the low word. `push imm8` is sign-extended.

### 1eee:051f, inrun (20 words)

| Words | Type | Field | Notes |
|---|---|---|---|
| 0-1 | Single | `45C2` | back of the start platform (m) |
| 2-3 | Single | end of the flat section | `inrunFlatEndXM` |
| 4-5 | Single | end of the straight | `inrunLineEndXM` |
| 6-7 | Single | takeoff | `takeoffXM` |
| 8-9 | Single | start | `startXM` |
| 10 | byte | `45E7` | colour of the start gate (palette index; near half: the next index) |
| 11-12 | Single | slope of the straight | `inrunLineSlope` |
| 13-14 | Single | intercept of the straight | `inrunLineInterceptM` |
| 15-16 | Single | parabola coefficient | `inrunCurveA` |
| 17 | word | `45DE` | height of the near wall above the track (pixels); `45E2` = round(`45DE`·p19/p21) |
| 18 | word | `45E0` | near wall below the track and the front face of the takeoff (pixels); `45E4` = round(`45E0`·p19/p21) |
| 19 | byte | `45E6` | colour of the inrun walls (darkest index of the ramp) |

Computed: `B = slope - 2*A*lineEnd`, `C = slope*lineEnd + intercept - A*lineEnd*lineEnd - B*lineEnd`
(continuity of height and slope at the end of the straight); friction 0.02.

### 1eee:06e1, landing hill (21 words)

| Words | Type | Field | Notes |
|---|---|---|---|
| 0-1 | Single | tanh centre, x | `landingCenterXM` |
| 2-3 | Single | tanh centre, y | `landingCenterYM` |
| 4-5 | Single | amplitude | `landingAmplitudeM` |
| 6-7 | Single | width | stored as the reciprocal, `landingInvWidthPerM` |
| 8-9 | Single | start of the outrun | `outrunStartXM` |
| 10-11 | Single | parabola coefficient of the outrun | `outrunCurveA` |
| 12 | word | `4648` | distance of the first line, every 5 m before the K point |
| 13 | word | `464A` | number of those lines, at most 13 |
| 14 | word | K point in metres | `464C` |
| 15 | word | `464E` = round(bottom of the outrun parabola + word 15) | base height of the background terrain |
| 16 | byte | `4650` | colour of the fences (darkest index) |
| 17-18 | Single | `4651` | offset of the start of the fences behind the takeoff (m) |
| 19-20 | Single | blending of the inrun shape into the landing hill below the takeoff | `knollBlend` (`4655`) |

Computed: `B = landing_slope(x0) - 2*A*x0`, `C = landing_y(x0) - A*x0*x0 - B*x0` for `x0` = start of the outrun
(continuity with the tanh profile); friction 0.05.

The simulation (0baf:9c52, 1c06:02a1) reads only the profile and the K point from this data **[code]**. The
other fields are read only by the scene code (0baf:1e89, 0baf:344c), outside the simulation; their meaning
follows from that code **[code]** and from a comparison with the game's memory (`jump-scene.md`).

### Scenery (the other calls of the branch)

| Procedure | Arguments | Meaning |
|---|---|---|
| 1eee:0437 | 6 records: Single x0, Single x1, byte c0, byte c1 | inrun supports from x0 to x1 (m), colour of the sides c0, colour of the front from c0 to c1; x0 = 0: record unused |
| 003f:9da5 | bytes R, G, B | sky colour at the horizon (6 bits per component); changes palette entries 240..255 |
| 0baf:1c31 | word seed, word A | generator seed and amplitude of the background terrain waves |
| 0baf:1e89 | none | builds the layer tables from the profile and the data above |
| 0baf:602e | words a1, a2, xmin, xmax, seed | trees: round(0.8·a1) spruces and round(0.8·a2) pines from xmin to xmax (m) |

After placing the trees, hills 4 and 9 run their own loops `for i := a to b do x[layer][i] := -200`, which
hide a few trees off the screen (hill 4: layer 3 records 1..3 and layer 9 records 3..5, hill 9: layer 5 records
1..3). The port reads them from the code of the branch.

## `Dsj.dat`

Reading a resource (1bc6:0039): `u32` offset at index·4 (0 = no resource), at the offset a `u16` length and the
data. The directory ends where the first resource begins (v2.10P: 1000 entries, 62 resources).

Resource 220 is the interface text (Polish): a table of `u16` offsets; an offset points to the byte after the
length byte, text in code page 852. The name of hill n is text 198 + n (1..32: country names, 33..37: Polish
hills).

Resources 100..121 are the bitmaps of the scene's trees (two species of 11 sizes each, run-length encoded: `u16`
length, the field `x0, y0, x1, y1, anchor x, anchor y`, then runs of `u16` offset, `u16` count, palette index
bytes, until the offset `FFFF`). The port does not read them: it draws its own trees at the same places and
sizes (`jump-scene.md`, "Trees").

## Verification

`tools/re/hill_capture.py` runs the game for each hill and stores the state after the profile is set up
**[measurement]**: the profile (20 fields) and the K point of all 37 hills read from `Dsj.exe` match the original
bit for bit, including the coefficients computed in double precision. From the same capture,
`src/render/hill-scene.golden.test.ts` checks the scenery of the 37 hills: palette, background waves, base height,
lines, starts of the fences, inrun walls and supports, gate and trees (`jump-scene.md`, "Verification").
