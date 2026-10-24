import { describe, expect, it } from "vitest";
import { OWN_HILLS, hillChoiceOf, type HillChoice } from "../game/hill-choice";
import { DEFAULT_OUTFIT, type Outfit } from "../game/outfit";
import { previewFlightState } from "../game/outfit-preview";
import {
  isJumpOver,
  presentationFrame,
  startTrainingJump,
  stepTrainingJump,
  type TrainingJump,
} from "../game/training-session";
import { parseHillSpec } from "../hills/parse-hill-spec";
import { OWN_HILL_SPECS } from "../hills/own-hills";
import { PHASE, notesShownBy, type FrameInput } from "../sim/jump-logic";
import { makeBot, type BotOptions } from "../sim/test-support/synthetic";
import { FrameBuffer } from "./frame-buffer";
import {
  VIEW_HEIGHT_PX,
  VIEW_MAX_WIDTH_PX,
  VIEW_MIN_WIDTH_PX,
  drawJumpView,
  drawJumperPreview,
  type ControlScheme,
  type Scenery,
} from "./jump-view";
import type { Lighting } from "./palette";
import { fnv } from "./test-support/frame-hash";

/**
 * Pixel regression tests of the jump view. Whole frames are drawn at chosen
 * moments of scripted jumps, under every lighting, weather, view width and
 * control scheme, and a hash of every pixel is compared with a snapshot. The
 * expected values were produced by this renderer; they guard against
 * unintended changes of the picture when the drawing code is reorganised.
 */

const LIGHTINGS: readonly Lighting[] = ["day", "dusk", "night"];
const WIDTHS_PX: readonly number[] = [VIEW_MIN_WIDTH_PX, 356, VIEW_MAX_WIDTH_PX];
const CONTROLS: readonly ControlScheme[] = ["mouse", "touch", "tilt"];
/** Frames per blink phase of the prompts. */
const BLINK_FRAMES = 35;
/** A scenario draws a few hundred whole frames, which takes seconds on a slow or busy machine. */
const SCENARIO_TIMEOUT_MS = 60_000;
const OTHER_OUTFIT: Outfit = { pants: 2, sleeves: 5, gloves: 11, helmet: 1, skis: 7 };

interface Variant {
  name: string;
  scenery: Scenery;
  widthPx: number;
  controls: ControlScheme;
}

/** Every lighting with every weather at every width; the control scheme rotates so each meets each width. */
const VARIANTS: readonly Variant[] = LIGHTINGS.flatMap((lighting, li) =>
  [false, true].flatMap((snowfall, si) =>
    [false, true].flatMap((fog, fi) =>
      WIDTHS_PX.map((widthPx, wi) => {
        const controls = CONTROLS[(li * 4 + si * 2 + fi + wi) % CONTROLS.length] ?? "mouse";
        const weather = `${snowfall ? "snow" : "clear"}${fog ? ", fog" : ""}`;
        return {
          name: `${lighting}, ${weather}, ${widthPx} px, ${controls}`,
          scenery: { lighting, snowfall, fog },
          widthPx,
          controls,
        };
      }),
    ),
  ),
);

/**
 * The smaller set every own hill after the first gets under its own keys: one width, every lighting, clear weather.
 * The first hill's full set covers the weather and the widths, which draw the same way on any hill.
 */
const HILL_VARIANTS: readonly Variant[] = LIGHTINGS.map((lighting) => ({
  name: `${lighting}, clear, 356 px, mouse`,
  scenery: { lighting, snowfall: false, fog: false },
  widthPx: 356,
  controls: "mouse",
}));

interface Moment {
  name: string;
  when: (jump: TrainingJump, frame: number) => boolean;
}

interface Scenario {
  name: string;
  seed: number;
  /** Scripted player; null presses nothing at all. */
  bot: BotOptions | null;
  recordM?: number;
  newRecord?: boolean;
  outfit?: Outfit;
  moments: readonly Moment[];
}

const blinkOn = (frame: number) => Math.floor(frame / BLINK_FRAMES) % 2 === 0;
/** The lines about a new record: on for 24 frames of every 50, for 400 frames from the landing (src/render/jump-view.ts). */
const sinceLanding = (jump: TrainingJump, frame: number) => frame - jump.state.logic.landedFrame;
const recordOn = (jump: TrainingJump, frame: number) => {
  const since = sinceLanding(jump, frame);
  return since >= 0 && since < 400 && since % 50 < 24;
};
const phaseOf = (jump: TrainingJump) => jump.state.logic.phase;
const allNotesShown = (jump: TrainingJump, frame: number) => notesShownBy(jump.state.logic, frame);

/**
 * When the notes are seen appearing: as the second judge's note appears, as the snapshots were first taken, unless
 * that note is the last to appear (each judge's moment is random), and then as the first note appears.
 */
function notesAppearingFrame(jump: TrainingJump): number {
  const frames = jump.state.logic.judges.map((judge) => judge.showFrame);
  const second = frames[1] ?? Infinity;
  return second < Math.max(...frames) ? second : Math.min(...frames);
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: "jump with a telemark landing",
    seed: 7,
    bot: { startFrame: 70, takeoffLeadM: 3, landingHeightM: 2, leanPattern: () => 0 },
    recordM: 80,
    newRecord: true,
    moments: [
      { name: "waiting on the start gate", when: (j, f) => phaseOf(j) === PHASE.gate && f === 20 },
      { name: "start gate, half a second in", when: (j, f) => phaseOf(j) === PHASE.gate && f === 40 },
      {
        name: "inrun",
        when: (j, f) =>
          (phaseOf(j) === PHASE.inrun || phaseOf(j) === PHASE.crouch) &&
          j.state.jumper.xM > (j.hill.profile.startXM + j.hill.profile.takeoffXM) / 2 &&
          blinkOn(f),
      },
      { name: "takeoff", when: (j) => phaseOf(j) === PHASE.takeoff || phaseOf(j) === PHASE.afterTakeoff },
      {
        name: "flight",
        when: (j) => phaseOf(j) === PHASE.flight && j.state.jumper.xM > j.hill.profile.takeoffXM + 25,
      },
      { name: "landing", when: (j) => phaseOf(j) === PHASE.landingPrep || phaseOf(j) === PHASE.landing },
      { name: "outrun", when: (j) => phaseOf(j) === PHASE.outrun && !isJumpOver(j) },
      {
        name: "distance shown, notes appearing",
        when: (j, f) => j.state.logic.finished && !allNotesShown(j, f) && f >= notesAppearingFrame(j),
      },
      // The second showing of the record's lines, and the pause before it.
      {
        name: "record lines shown",
        when: (j, f) => j.state.logic.finished && sinceLanding(j, f) >= 50 && recordOn(j, f),
      },
      {
        name: "record lines blinked off",
        when: (j, f) => j.state.logic.finished && sinceLanding(j, f) >= 24 && !recordOn(j, f),
      },
      {
        name: "after the jump, notes shown",
        when: (j, f) => isJumpOver(j) && allNotesShown(j, f) && blinkOn(f),
      },
    ],
  },
  {
    name: "jump without a landing",
    seed: 11,
    bot: { startFrame: 70, takeoffLeadM: 3, landingHeightM: null, leanPattern: () => 0 },
    outfit: OTHER_OUTFIT,
    moments: [
      { name: "fall", when: (j) => phaseOf(j) === PHASE.crash && j.state.logic.fallType !== 0 },
      {
        name: "sliding after the fall",
        when: (j) => j.state.logic.fallType !== 0 && !j.state.jumper.airborne && !isJumpOver(j),
      },
      {
        name: "lying after the fall, notes shown",
        when: (j, f) => isJumpOver(j) && j.state.logic.fallType !== 0 && allNotesShown(j, f) && blinkOn(f),
      },
    ],
  },
  {
    name: "start never pressed",
    seed: 5,
    bot: null,
    recordM: 80,
    moments: [
      {
        name: "disqualification",
        when: (j) => j.state.logic.finished && j.state.logic.distanceM === 0 && j.framesAfterEnd === 10,
      },
    ],
  },
];

function practiceHill(): HillChoice {
  const hill = OWN_HILLS[0];
  if (!hill) throw new Error("no hill");
  return hill;
}

const NO_INPUT: FrameInput = { left: false, right: false, dy: 0 };

/** Hash of the frame for each variant at each moment of the scenario, drawn while the jump is at that moment. */
function capture(
  sc: Scenario,
  hill: HillChoice = practiceHill(),
  variants: readonly Variant[] = VARIANTS,
): Record<string, Record<string, string>> {
  let jump = startTrainingJump(hill, sc.seed);
  const bot = sc.bot === null ? () => NO_INPUT : makeBot(hill.profile, sc.bot, () => jump.state);
  const buffers = new Map(variants.map((v) => [v.widthPx, new FrameBuffer(v.widthPx, VIEW_HEIGHT_PX)]));
  const frames: Record<string, Record<string, string>> = {};
  for (let f = 0; f < 4000 && jump.framesAfterEnd < 400; f++) {
    jump = stepTrainingJump(jump, bot(jump.state.logic.frame + 1));
    const frame = presentationFrame(jump);
    for (const moment of sc.moments) {
      if (frames[moment.name] !== undefined || !moment.when(jump, frame)) continue;
      const hashes: Record<string, string> = {};
      for (const v of variants) {
        const fb = buffers.get(v.widthPx);
        if (!fb) throw new Error("no buffer");
        fb.pixels.fill(0);
        drawJumpView(fb, {
          profile: hill.profile,
          kPointM: hill.kPointM,
          look: hill.look,
          hillName: hill.name,
          playerName: "GRACZ 1",
          state: jump.state,
          controls: v.controls,
          frame,
          over: isJumpOver(jump),
          scenery: v.scenery,
          windDriftM: jump.windDriftM,
          ...(sc.recordM === undefined ? {} : { recordM: sc.recordM }),
          ...(sc.newRecord === undefined ? {} : { newRecord: sc.newRecord }),
          ...(sc.outfit === undefined ? {} : { outfit: sc.outfit }),
        });
        hashes[v.name] = fnv(fb.bytes);
      }
      frames[moment.name] = hashes;
    }
  }
  return frames;
}

describe("jump view pixels", () => {
  it.each(SCENARIOS)(
    "$name",
    (sc) => {
      const frames = capture(sc);
      // Every moment has to be reached, or a drawing path silently drops out of the snapshot.
      expect(sc.moments.filter((m) => frames[m.name] === undefined).map((m) => m.name)).toEqual([]);
      expect(frames).toMatchSnapshot();
    },
    SCENARIO_TIMEOUT_MS,
  );

  it("scenery is drawn without the optional parts of the model", () => {
    const hill = practiceHill();
    const jump = startTrainingJump(hill, 9);
    const fb = new FrameBuffer(356, VIEW_HEIGHT_PX);
    drawJumpView(fb, {
      profile: hill.profile,
      kPointM: hill.kPointM,
      hillName: hill.name,
      playerName: "GRACZ 1",
      state: jump.state,
      controls: "mouse",
      frame: 1,
      over: false,
    });
    expect(fnv(fb.bytes)).toMatchSnapshot();
  });

  it("outfit preview", () => {
    const hill = practiceHill();
    const state = previewFlightState(hill);
    const hashes: Record<string, string> = {};
    for (const [name, outfit] of [
      ["default outfit", DEFAULT_OUTFIT],
      ["other outfit", OTHER_OUTFIT],
    ] as const) {
      for (const [w, h] of [
        [120, 90],
        [356, VIEW_HEIGHT_PX],
      ] as const) {
        const fb = new FrameBuffer(w, h);
        drawJumperPreview(fb, { hill, state, outfit });
        hashes[`${name}, ${w}x${h}`] = fnv(fb.bytes);
      }
    }
    expect(hashes).toMatchSnapshot();
  });
});

/** The clean jump with a telemark landing: the moments every own hill is drawn at. */
function telemarkJump(): Scenario {
  const sc = SCENARIOS[0];
  if (sc === undefined) throw new Error("no telemark jump");
  return sc;
}

/**
 * The telemark jump on a further own hill: the bot prepares the landing 1 m above the slope rather than 2 m, below
 * the lowest table the rules allow, since on a hill with a low table 2 m would come right after the takeoff.
 */
function ownHillJump(): Scenario {
  const sc = telemarkJump();
  if (sc.bot === null) throw new Error("the telemark jump has no bot");
  return { ...sc, bot: { ...sc.bot, landingHeightM: 1 } };
}

/**
 * A hill that exists only in this test: the first own hill's data with another id, another sky and other trees,
 * parsed and built the way every own hill is.
 */
function otherLookHill(): HillChoice {
  const first = OWN_HILL_SPECS[0];
  if (first === undefined) throw new Error("no own hill");
  const parsed = parseHillSpec(
    JSON.parse(
      JSON.stringify({
        ...first,
        id: "test-other-look",
        look: { ...first.look, skyRgb6: [50, 30, 20], trees: { ...first.look.trees, seed: 777 } },
      }),
    ),
  );
  if (!parsed.ok) throw new Error(parsed.problems.map((p) => `${p.path}: ${p.message}`).join("; "));
  return hillChoiceOf(parsed.spec);
}

describe("jump view pixels of every own hill", () => {
  // The first own hill has the full set above; each further hill adds its own keys to the snapshot.
  for (const hill of OWN_HILLS.slice(1)) {
    it(
      `${hill.id}: ${telemarkJump().name}`,
      () => {
        const sc = ownHillJump();
        const frames = capture(sc, hill, HILL_VARIANTS);
        expect(sc.moments.filter((m) => frames[m.name] === undefined).map((m) => m.name)).toEqual([]);
        expect(frames).toMatchSnapshot();
      },
      SCENARIO_TIMEOUT_MS,
    );
  }

  it(
    "draws a hill of another look differently at every moment, through the same path",
    () => {
      const sc = telemarkJump();
      const first = capture(sc, practiceHill(), HILL_VARIANTS);
      const other = capture(sc, otherLookHill(), HILL_VARIANTS);
      const pairs = sc.moments.flatMap((m) =>
        HILL_VARIANTS.map((v) => [first[m.name]?.[v.name], other[m.name]?.[v.name]] as const),
      );
      expect(pairs).toHaveLength(sc.moments.length * HILL_VARIANTS.length);
      expect(pairs.filter(([a, b]) => a === undefined || b === undefined)).toEqual([]);
      expect(pairs.filter(([a, b]) => a === b)).toEqual([]);
    },
    SCENARIO_TIMEOUT_MS,
  );
});
