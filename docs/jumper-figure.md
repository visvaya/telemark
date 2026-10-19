# Jumper figure (v2.10P)

The original has no jumper sprites: it draws the jumper from the pose (`src/sim/pose.ts`) as a 3D skeleton in
oblique projection. Port: `src/render/jumper-skeleton.ts`, drawing: `src/render/jump-view-jumper.ts`.

## Meaning of the pose fields

Each "leg" in `PoseState` is one half of the body (0 and 1):

| Field | Meaning |
|---|---|
| segment 0 | leg, hip to foot (up to 1.08 m) |
| segment 1 | arm, shoulder to hand (up to 0.74 m) |
| joint 0 | ski spread (V) |
| joint 1 | ski angle |
| joints 2, 3 | direction of the leg and its sideways deflection |
| joints 6, 7 | direction of the arm and its sideways deflection |
| joint 4 (half 0) | torso |
| joint 5 (half 0) | head |
| joint 8 (half 0) | rotation of the whole figure |

## Kinematics (1cb6:1418)

21 points (z sideways, x forward, y up) relative to the foot of the front leg (`DS:4CDC` = front leg + 1),
stored from `DS:4456` every 12 bytes. The pelvis lies at the end of the front leg; torso 0.49 m, shoulders
±0.22 m, head 0.24 m from the neck; skis: 1 m behind the binding, 1.628 m in front of it, tip 1.648 m bent by
0.04 rad. Knee and elbow: half the segment (0.54 and 0.37 m) at the angle of the limb direction minus or plus
the bend `arccos(i/100)`, where `i` is the segment length in percent of the maximum (table `DS:42C2`, filled by
1cb6:2291).

## Projection and drawing (1cb6:20e1, 1f8b:00dc)

`x_ekr = (x − 0,15·z)·14`, `y_ekr = 200 − (y − 0,5·z)·14·200/240`: 14 px/m horizontally and 11.67 px/m
vertically on a 320×200 screen with a 4:3 aspect ratio, that is 11.67 px/m on both axes after correcting the
aspect ratio (our renderer uses this scale). 16 bones in a fixed order (far half, torso and head, near half);
each has a part of the outfit (suit, trousers, sleeves, gloves, helmet, skis) and a shade. The torso ("suit") has
a colour slot of its own (byte 0x13 of the jumper record, 1cb6:2232): 0x0D, light grey, for everybody, and 0x0E,
the yellow of computer jumpers' names, for the leader of a World Cup from the second hill on (003f:56ad..56ff);
the outfit editor sets only the other five slots. A 2×2 pixel brush or
a 4×4 blot for thick bones; a bone from a point to itself is a dot (hands, head, ski tips).

The shadow (1cb6:1d2a) is the same bones in one colour (index 24), cast onto the terrain plane under the jumper:
column 147 instead of 148, row lowered by round((y_jumper − y_terrain)·1.33·14) and sheared with the slope of the
terrain; at the takeoff two shadows are drawn (on the inrun and on the landing hill), each clipped at the edge
of the takeoff.

## Verification

**[measurement]** The points the port computes from the pose stored in a trace match the points stored by the
original in all frames of 11 traces (difference below 0.1 mm; `jumper-skeleton.golden.test.ts`). The outfit
colours are our own. How the figure and the shadow sit in the scene: `jump-scene.md`.
