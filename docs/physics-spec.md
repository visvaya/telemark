# DSJ2: the jumper physics model (working specification)

Source: analysis of `Dsj.exe` from DSJ2 v2.10P (Borland Pascal 7, DOS). The physics module is segment `1c06`
(functions `jumper_reset` 1c06:0010 and `jumper_step` 1c06:02a1). Data addresses refer to the game's data
segment (22F2h). Confidence marks: **[code]** read from the code, **[measurement]** observed in emulation while
playing `KARPACZ.RPL`, **[hypothesis]** to be confirmed.

## Time step and units

- `jumper_step` is called once per frame; `dt = 1/70 s` (variable `DS:14EE` = 0.0142857) **[measurement]**.
  70 Hz is the refresh rate of VGA mode 13h **[hypothesis: synchronisation with the vertical retrace]**.
- All state variables are `Single` (float32); every assignment rounds to float32, intermediate computations run
  in x87 precision (80 bits) **[code]**.
- Units: metres, seconds, kilograms, radians. `g = 9.81`, mass `m = 60` (`DS:52E0`) **[code]**.

## State

| Address | Name | Meaning |
|---|---|---|
| 5298 | `x` | horizontal position |
| 52A0 | `y` | height (grows upwards) |
| 52A4 | `vx` | horizontal speed |
| 52A8 | `vy` | vertical speed, positive downwards |
| 52AC | `speed` | magnitude of the velocity (on the track: speed along the track) |
| 52B0 | `track_angle` | track angle used in the ground step |
| 52B4, 52B8 | `prev_x`, `prev_y` | position from the previous frame |
| 5296 | `airborne` | 0 on the track, 1 in flight |
| 5297 | `contact_event` | set at the takeoff from the table and at a phase change |
| 52D8 | `ref_y` | reference height of the energy balance |
| 52DC | `ref_speed` | reference speed of the energy balance |
| 52E4 | `energy_lost` | energy dissipated since the time of `ref_*` (J) |
| 52FA | `pose_id` | skeleton pose number (module 1cb6, set by 1cb6:0d15); poses 8, 9 and 100 add braking |

Hill parameters (Karpacz K85, **[measurement]**): start `x = 11.4` (`45B2`), takeoff `x = 44.0` (`45CE`),
friction coefficient of the inrun `0.02` (`45B6`), of the landing hill `0.05` (`4624`). Wind: speed `4D1C`,
direction (angle) `4D20`, varying in time **[measurement]**. `4D06` = 0.5 (lift area coefficient of the
silhouette, also set in `0baf`) **[hypothesis as to the meaning]**.

Terrain profiles: `hill_y(x)` = 1eee:0000 for `x <= takeoff_x` (inrun), 1eee:015e for `x > takeoff_x` (landing
hill), 1eee:0627 returns the terrain height for the balance at landing **[code; implementation of the profiles
to be read]**.

## Ground phase (`airborne = 0`): energy balance

1. `track_angle = -inrun_slope_angle` (`52F2`; on K85 the inrun has -π/4).
2. If `speed == 0`, then `speed = 0.0001`.
3. `mu = x < takeoff_x ? mu_inrun : mu_land`.
4. Speed relative to the wind along the track:
   `v_rel = max(0, speed - 0.2 * wind_speed * cos(wind_dir) * cos(track_angle))`.
5. Energy loss in the frame (distance `speed * dt`):
   `energy_lost += |speed * dt * (mu * m * g * cos(track_angle) + 0.583 * k_4D06 * v_rel^2)|`.
6. Extra braking depending on `pose_id`: for 8 and 100 it adds
   `|speed * dt * mu * 10 * m * g * cos(track_angle)|`, for 9 the same with a multiplier of 20.
7. Limit: `energy_lost <= m*g*(ref_y - y) + 0.5*m*ref_speed^2`.
8. New speed from the conservation of energy:
   `speed = sqrt(|2 * (m*g*ref_y + 0.5*m*ref_speed^2 - energy_lost - m*g*y) / m|)`.
9. `vy = sin(track_angle) * speed`, `vx = cos(track_angle) * speed`, `x += vx * dt`.
10. Crossing the takeoff in this frame (`x_przed_ruchem < takeoff_x` and `x > takeoff_x`) sets
    `contact_event = 1` and skips sticking to the terrain; otherwise `y = hill_y(x)`.

Note: `y` in step 8 comes from the previous frame (before `x` is moved) **[code]**.

## Flight phase (`airborne = 1`)

1. Horizontal wind `w = wind_speed * cos(wind_dir)`; relative speed `u = vx - w`.
2. Angle of attack `alpha = |u| > 0.0001 ? atan(vy / u) : pi/2`; magnitude `V = sqrt(u^2 + vy^2)`.
3. Forces from the silhouette and the skis (`body_angle` = `4CBC`, ski angles `5314`, `5340`):
   - `F_body = 0.53 * 1.1 * k_4D06 * V^2 * sin(0.35 + body_angle + alpha)`
   - `F_ski1 = 0.139284 * V^2 * sin(alpha + ski1_angle)`
   - `F_ski2 = 0.139284 * V^2 * sin(alpha + ski2_angle)`
4. Components (absolute values of each term):
   - `Fy = |cos(0.35 + body_angle) * F_body| + |cos(ski1) * F_ski1| + |cos(ski2) * F_ski2| + 0.1166 * vy^2`
   - `Fx = |sin(0.35 + body_angle) * F_body| + |sin(ski1) * F_ski1| + |sin(ski2) * F_ski2| + 0.1166 * vx^2`
   - `Fy = min(Fy, m*g)`
5. Integration (explicit Euler, the order matters):
   `vy += (g - Fy/m) * dt`; `vx -= (Fx/m) * dt`; `x += vx * dt`; `y -= vy * dt`.

Note: the term `0.1166 * v^2` uses absolute speeds, not speeds relative to the wind **[code]**.

## Phase transitions

- On the track, when the terrain under the jumper is lower than `y` (`hill_y(x) < y`): `airborne = 1`,
  `contact_event = 1`; after a fall (`4D04 != 0`, fall type) additionally a random disturbance of the pose
  (1cb6:0457).
- In flight, when `hill_y(x) >= y` (landing): `energy_lost = 0`, `ref_y = terrain_y(x)` (1eee:0627), impact angle
  `beta = |atan(-vy/vx) - inrun_slope_angle|` (or `pi - inrun_slope_angle` when `vx = 0`),
  `ref_speed = cos(beta) * sqrt(vx^2 + vy^2)`, `y = ref_y`, `speed = ref_speed`, `airborne = 0`,
  `landed = 1` (`52E8`).
  The speed perpendicular to the landing hill is lost.

## End of the step: takeoff and terrain slope

- If `contact_event = 1`: `contact_event = 0`, `airborne = 1`, `track_angle = -slope_angle`,
  `vy = sin(track_angle) * speed - impulse_y / m`, `vx = cos(track_angle) * speed + impulse_x / m`,
  then `impulse_x = impulse_y = 0` (`4CD4`, `4CD8`, N·s) **[code]**.
- Always at the end: `slope_angle = atan(teren'(x))` (1eee:0676; inrun for `x <= takeoff_x`). In the ground
  phase and at landing the angle from the previous frame is therefore used **[code]**.

## Hill profile (module 1eee)

The parameters are set by 1eee:051f (inrun) and 1eee:06e1 (landing hill) when the hill is loaded.

- Inrun `inrun_y(x)`: for `x < x1` the constant `a*x1 + b`; for `x1 <= x <= x2` the straight line `a*x + b`;
  for `x > x2` the parabola `c*x^2 + d*x + e`, where `d = a - 2c*x2`, `e = a*x2 + b - c*x2^2 - d*x2`
  (continuity of value and slope at `x2`). The derivative is 0, `a`, `2c*x + d` respectively.
- Landing hill `landing_y(x)`: for `x <= x_t` the profile `B + A * (e^{-u} - e^{u}) / (e^{u} + e^{-u})`,
  `u = (x - x0) * k` (that is `B - A*tanh(u)`), for `x > x_t` the outrun parabola, whose coefficients are computed
  from continuity at `x_t`. Derivative of the tanh part: `-4*A*k / (e^{u} + e^{-u})^2`.
- Below the takeoff (`x <= takeoff_x`) the shape of the inrun is added to the landing hill with the weight
  `knoll_blend` (`4655`): `y -= inrun_curve(takeoff_x) * w`, then `y += (x <= x2 ? a*x + b : inrun_curve(x)) * w`.
- The terrain height at landing (1eee:0627) uses `x < takeoff_x` (strict inequality), and the step functions
  `x <= takeoff_x`; the port keeps both versions.
- Arc length of the landing hill (1eee:0830): midpoint integration with a fixed step,
  `L += sqrt(teren'(x + krok/2)^2 + 1) * krok`; the last step is shortened to the end of the interval.
  It is used to measure the distance **[code; call parameters to be determined]**.

## Wind (0baf:976a, once per frame before the physics step)

Every 10 frames (`round(frame * dt * 70) mod 10 = 0`, rounding to even):

- `wy += G * zmienność`, then `wx += G * zmienność`, where `G` is the mean of five `Random(65535)` scaled to
  [-1, 1] (`(suma/5/65534)*2 - 1`).
- Direction: `atan(wy/wx)` for `wx > 0`, `atan(wy/wx) + pi` for `wx < 0`, `±pi/2` for `wx = 0`.
  Speed `sqrt(wy^2 + wx^2)`; above 3.8 m/s both components are multiplied by `1 - (v - 3.8)/50`.
- The direction indicator chases the wind direction with an acceleration of 0.05 rad and a limit of 0.2 rad per
  update (dead zone `|sin(różnica)| <= 0.05`).

Verification: bit-for-bit agreement with the game state, including `RandSeed`, in 876 frames of `KARPACZ.RPL`
**[measurement]**.

## Jump phases and control (0baf:9c52, partial reading)

Phase variable `4CBB`: 1 gate, 2 descent, 3 crouch, 4 takeoff window, 5 after the takeoff, 6–7 flight,
8 preparation for landing, 9 and 11 landing, 12 fall **[code; names of phases 3, 5, 9, 11: hypothesis]**.

- Start (phase 1 → 2): the left button after frame 65; `ref_speed = speed = 1` m/s, pose 2.
- Phase 2 → 3 after more than 20 frames of descent with no buttons pressed; 3 → 4 after a button is pressed
  (the frame `button_start` is stored in the replay); `lift_factor = 1`, pose 4.
- Takeoff (phase 4, while `x < takeoff_x`): every frame
  `F = (lewy + prawy) * 1275 * dt * cos(((knee/1.08 - 0.5)/0.5) * pi/2)`, where `knee` = `5300`
  (an angle in the jumper's skeleton); `impulse_x -= sin(slope) * F`, `impulse_y += cos(slope) * F`;
  takeoff time counter `4CB7 += (lewy + prawy) * dt / 2`.
- When `knee > 1.07`: if the jumper is still before the takeoff, a forced takeoff (`contact_event = 1`) and a
  correction of the time counter; phase 5.
- Flight (phases 6–7): `body_angle -= dy_myszy * dt * 1.5`; random disturbances (each `Random(n) = 1`):
  with p = 1/30 `body_angle += (7 - wiatr_x) * dt / 10`, and tremors of the limbs `4CC0..4CCC`
  (Random(5), Random(60), Random(100), Random(10)); `body_angle` limited to ±0.6.
  The ski angles `5314`, `5340` come from the skeleton module `1cb6`.
- Phase 7 → 8 after a button is pressed: `body_angle = 0.75`, pose 6. The button chooses the leg put forward
  (right: leg 0, left: leg 1); both paths lead to the same telemark preparation **[code]**.
  The earlier hypothesis "right is telemark, left is two-legged" finds no confirmation in the code.
  The preparation time grows to 0.6 s and stops when the second button is pressed or when the landing hill is
  touched; the penalty in the judges' notes grows with `(0.4 - czas)²`, so it is best to press the button about
  0.4 s before the ground, and a long preparation increases the fall component `czas * 92` **[code]**.

The generator seed is saved before the input is read and restored after it (0baf:9a3c), so reading the input does
not change the random sequence **[code]**.

## Computer jumpers (0baf:8aeb, 0baf:8ee4)

Port: `src/sim/cpu-pilot.ts` (setup, pilot, drawing of talents and form) and `src/sim/cpu-jump.ts` (a jump frame
with the pilot). A computer jump is the ordinary physics and logic of a jump; the pilot gives the input instead of
the mouse.

- Competitor record `5CBF + 17 * nr` (nr 9..16 are opponents 1..8): form 1 and 2, talent 1 and 2 (Single) and
  level 0..4. On the competitor list `5906 + 26 * nr`: `+11h` computer control, `+12h` participation, `+19h`
  level setting (0..4, larger = random) **[code]**.
- Start of the cup (003f:4dda..4fb1), for each computer participant: level = the setting or `Random(5)`;
  `w` = level spread (`1894`: 4, 3, 2, 1, 0.2); each of the two talents
  `(Random(2)*2 - 1) * w * 0.3 + rc(6) * (w/10 + 0.3)`, where `rc(n)` is the mean of `n` draws of `Random(65535)`
  scaled to [-1, 1] (1980:009c). Start of the competition (003f:51c2..51dd): form 1 = `rc(6)`, form 2 = `rc(6)`
  **[code, measurement]**.
- Setup before the jump (0baf:8aeb, from the jump session after `Randomize`, before the seed is written to the
  replay header): time to the takeoff for the first button
  `((t1/12)*0.8 + 0.18 + (f1/20)*0.8) + rc(6)/25 + (250 - K)/10000`, below 0.108 s replaced by
  `(0.65 - Random(15)/100)*0.18`, above 0.252 s by `(1.35 + Random(15)/100)*0.18`; second button
  `(5 - poziom)/70 * rc(4)*0.5 + pierwszy - 0.01`, not earlier than the first; holding the flight position
  `Random(10)/100 + 0.05` s; reaction time `Random(30)/100 + 0.5` s; target silhouette angle
  `((t2/12)*1.3 + f2/10 + rc(6)/15)/1.7 - 0.38`; landing lead `rc(3)*0.3 + 0.6 + (5 - poziom) * |rc(3) + 0.7| * 0.15`
  s; telemark delay `rc(3)*0.4 + 0.35 + rc(2)*0.1` limited to 0..0.42 s. When `Random(40) = 1`, the jump is
  "failed": with `Random(2) = 1` telemark `rc(3)*0.2 + 0.7` and landing lead + 0.7 s, otherwise lead
  `rc(2)*0.3`. Stored to Single only at each `fstp`; the order of the draws as written **[code, measurement]**.
- Pilot (0baf:8ee4) in every frame, called from the input reading (0baf:9a3c) instead of the mouse; the seed is
  restored after the input is read, so the pilot's draws do not change the jump's sequence
  **[code, measurement]**:
  - frame 70: left button (start from the gate);
  - phases 3–4: time to the takeoff `(takeoff_x - x)/cos(nachylenie)/prędkość` shorter than the first lead: left,
    than the second: right;
  - phases 6–7: first the holding countdown; then every frame `reakcja_pozostała -= dt` and, when
    `(reakcja - pozostała)/reakcja > |sylwetka / cel|` or the remaining time < 0: `dy = +1` when
    `sylwetka - 0.05 - Random(30)/100 > cel`, and `dy = -1` when `sylwetka + 0.05 + Random(30)/100 < cel`
    (both draws always, in this order);
  - phases 6–8: height above the landing hill `h` and time to contact
    `t = h/(vy/vx + nachylenie_zeskoku) * vy/vx / vy` (negative = 10 s). With `vy > 0`: `t` shorter than the
    landing lead gives the right button; at the first such press (except in a failed jump) the impact estimate
    `sqrt(|sin(a) * |v||)`, where `a` is the angle of the path relative to the terrain 5 m farther on, above 2
    shortens the telemark delay by `(uderzenie - 2) * 1.75`; the left button when the landing preparation time
    (`4CDE`) exceeds the telemark delay. Regardless of `vy`: `h < 1.3 - nieudany` gives the right one,
    `h > 3 + nieudany` releases both buttons.
  - The pilot does not read the wind.
- A jump computed without drawing (`29BE = 1`: an opponent's jump when watching is not selected) ends the loop in
  the frame in which the result is ready (0baf:d1cd..d1f6), that is in the touchdown frame, without the outrun. A
  watched jump lasts until the stop on the outrun, and then the loop shows the result in frames without a
  simulation step until the player moves on (0baf:d16a..d1ba) **[code, measurement]**.
- Between jumps the original resets only part of the state (1c06:0010, 0baf:c9e6, 1cb6:0d15). The other fields
  stay from the previous jump: arm tremors, takeoff force, impact components, ski spread, closeness to the ground,
  distance, flight speeds and forces, the previous position and the joint targets that the first pose does not set
  at once (`createJump(setup, previous)`). The list comes from comparing traces of successive jumps; the golden
  tests check that the state at the start of a jump is exactly as in the original **[measurement]**.

## Jumper skeleton (module 1cb6)

Two legs, each with two segment lengths (upper up to 1.08 m, lower up to 0.74 m) and nine joint angles. Each
channel has a current value, a target and a speed; every frame the value approaches the target by
`prędkość * dt` (or jumps to the target when it is closer). The pose (1cb6:0d15) sets the targets and speeds from a
table; speed 0 means immediate setting, an angle value of -99 means "terrain slope". The physics is fed by: the
ski angle (joint 2 of both legs) and the length of the upper segment of the first leg ("knee", takeoff force). The
other joints serve drawing and the style assessment.

- On the track the skis aim at the terrain angle (1cb6:0315), in flight at an angle depending on the silhouette
  and random tremors, near the ground mixed with the terrain slope in proportion to the closeness to the ground
  (`2A0E`).
- An impact (a fall in flight, a landing with a fall, bounces) randomly disturbs the pose (1cb6:0457): joints 0, 1,
  2, 4, 5 and 6 of both legs and the segment lengths, consuming the random generator.
- Before touchdown the leg lengths adjust so that both feet touch the landing hill (variables `5420..5438`).

## Landing, distance and judges' notes

- In the touchdown frame five "impact" components are computed (impact angle and speed, preparation time,
  position of the torso and legs, ski spread, leg bend) and their mean; component + mean > 60 means a fall of the
  given type.
- Distance: the arc length of the landing hill from the takeoff to `x - czas_przygotowania`, step 0.1 m, truncated
  to centimetres; for the points rounded down to half a metre. Points for distance: `60 + (d - K) * 2` for
  K <= 90, `* 1.8` for K < 145, `120 + (d - K) * 1.2` above.
- Five judges: note 20 minus penalties (leg spread, fall, late preparation, takeoff time, flight style) with random
  weights and noise, rounded to half a point; the extreme notes are discarded.

## Verification

State traces of the original game from six replays from the distribution (Karpacz, REC-FIN, Szczyrk, Wisła,
Zakopane 1 and 2) **[measurement]**:

- Physics step, wind, frame logic and skeleton: agreement in all frames of all six jumps (relative tolerance
  1e-6), mostly bit for bit, including the state of the random generator.
- The full simulation run only from the `.rpl` file (and the hill geometry) reproduces every frame of the original
  and exactly the stored distance (e.g. 89.92 m in Karpacz), judges' notes and points.
- The only known difference down to the bit: a speed close to zero at the end of the outrun (the original computes
  in 80 bits).
- The fall paths do not occur in the replays from the distribution. Five crafted replays (`docs/testing.md`) cover
  a fall at landing (types 2 and 4) with the transition into the fall pose, bounces (up to three), phases 6 and 9
  and a telemark with two buttons; the port reproduces each of their frames and the distance measured by the
  original.
- The traces FALL1..FALL5 (plans from the fall search, `docs/testing.md`, "Fall search") cover each of the five
  fall types with one jump each; the port reproduces each of their frames and the distance measured by the
  original.
- Computer jumps (52 traces from a World Cup played by the original: K70, K105, K170, all levels, two watched
  jumps, rare natural and forced branches, `docs/testing.md`, "Computer jumps"): the pilot's setup, the input and
  the pilot's state in every frame and the drawing of talents and form bit for bit; the whole jump from the seed
  after the setup agrees in every frame, with distance, judges' notes and points, also with falls.
- Not checked with a trace: touching the landing hill before the takeoff; team mode.

## To be determined

Hill data and the `Dsj.dat` format: `docs/hill-format.md`.

- Competition mode: the order of jumps (the second round in a different order), teams (`5C7C`, `5CCF`), hill
  records with computer jumps (reads of `5C73` at 0baf:b44a and c865). Control of the computer competitors: the
  section "Computer jumpers".
