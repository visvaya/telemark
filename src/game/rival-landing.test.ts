import { describe, expect, it } from "vitest";
import { drawCpuForm, drawCpuTalents, type CpuPilotState, type CpuPilotView } from "../sim/cpu-pilot";
import { BorlandRandom } from "../sim/borland-random";
import { landingSlope, landingYM } from "../sim/hill-profile";
import { PHASE, type FrameInput } from "../sim/jump-logic";
import { cpuCompetitionJump, cpuJumpStart } from "./competition-jump";
import { OWN_HILLS } from "./hill-choice";
import { IMPROVED_LANDING, improvedLandingLeadS, rivalLandingInput } from "./rival-landing";

/** The own hill on which the original's computer jumpers fall most often (K120, a quarter of their jumps). */
const hill = OWN_HILLS.find((h) => h.id === "own-23");

const pilot = (over: Partial<CpuPilotState> = {}): CpuPilotState => ({
  impactPending: true,
  blunder: false,
  takeoffLeadS: 0.18,
  secondLeadS: 0.18,
  flightHoldS: 0,
  reactionS: 0.6,
  reactionLeftS: 0.3,
  targetBodyRad: -0.36,
  landingLeadS: 0.8,
  telemarkDelayS: 0.3,
  inrunDropHm: 0.5,
  ...over,
});

const NONE: FrameInput = { left: false, right: false, dy: 0 };

describe.runIf(hill)("the improved landing of a computer jumper", () => {
  if (!hill) return;
  const profile = hill.profile;
  /**
   * A jumper in flight at `heightM` above the landing hill, 60 m past the takeoff, on a path that meets the hill in
   * `touchdownS` by the pilot's straight-line estimate.
   */
  const flying = (heightM: number, touchdownS: number, phase: number = PHASE.flight): CpuPilotView => {
    const xM = profile.takeoffXM + 60;
    const vxMPerS = 24;
    return {
      frame: 700,
      phase,
      xM,
      yM: landingYM(profile, xM) + heightM,
      vxMPerS,
      vyMPerS: heightM / touchdownS - landingSlope(profile, xM) * vxMPerS,
      speedMPerS: 25,
      slopeAngleRad: 0,
      bodyAngleRad: -0.3,
      landingPrepS: 0,
      randomSeed: 1,
    };
  };

  it("starts the landing later than the original's lead, by half of what that lead has over its base", () => {
    expect(improvedLandingLeadS(pilot({ landingLeadS: 0.6 }))).toBeCloseTo(IMPROVED_LANDING.leadBaseS);
    expect(improvedLandingLeadS(pilot({ landingLeadS: 1 }))).toBeCloseTo(IMPROVED_LANDING.leadBaseS + 0.2);
    expect(improvedLandingLeadS(pilot({ landingLeadS: 1 }))).toBeLessThan(1);
  });

  it("holds back the original's landing button in flight while the ground is farther off than the lead", () => {
    const base = { left: false, right: true, dy: -1 };
    expect(rivalLandingInput("improved", base, flying(2.5, 0.6), pilot(), profile)).toEqual({ ...NONE, dy: -1 });
    expect(rivalLandingInput("original", base, flying(2.5, 0.6), pilot(), profile)).toBe(base);
    // The same while the flight position is still held, before the first correction.
    const held = flying(2.5, 0.6, PHASE.flightHold);
    expect(rivalLandingInput("improved", base, held, pilot(), profile)).toEqual({ ...NONE, dy: -1 });
    expect(rivalLandingInput("improved", NONE, flying(2.5, 0.48, PHASE.flightHold), pilot(), profile).right).toBe(true);
  });

  it("presses the landing button once the ground is nearer than the lead, or the jumper is low", () => {
    // The lead of this pilot is 0.4 + (0.8 - 0.6) / 2 = 0.5 s.
    expect(rivalLandingInput("improved", NONE, flying(2.5, 0.52), pilot(), profile).right).toBe(false);
    expect(rivalLandingInput("improved", NONE, flying(2.5, 0.48), pilot(), profile).right).toBe(true);
    // Low over the hill it starts within three leads of the ground, and not sooner.
    expect(rivalLandingInput("improved", NONE, flying(1.2, 1.4), pilot(), profile).right).toBe(true);
    expect(rivalLandingInput("improved", NONE, flying(1.2, 1.6), pilot(), profile).right).toBe(false);
    // High above the hill no button counts, as in the original's pilot.
    expect(rivalLandingInput("improved", NONE, flying(3.5, 0.1), pilot(), profile).right).toBe(false);
  });

  it("leaves the original's input alone before the flight, after the landing has started and in a blundered jump", () => {
    const base = { left: true, right: true, dy: 0 };
    for (const phase of [PHASE.gate, PHASE.takeoff, PHASE.landingPrep, PHASE.landing]) {
      expect(rivalLandingInput("improved", base, flying(2.5, 0.6, phase), pilot(), profile)).toBe(base);
    }
    expect(rivalLandingInput("improved", base, flying(2.5, 0.6), pilot({ blunder: true }), profile)).toBe(base);
  });

  it("makes the same jump, with the same inputs, from the same seed", () => {
    const record = { ...drawCpuTalents(2, new BorlandRandom(7)), form1: 0.1, form2: -0.1 };
    for (const seed of [0x1234abcd, 0x9e3779b1, 0xdeadbeef]) {
      expect(cpuCompetitionJump(hill, record, seed, "improved")).toEqual(
        cpuCompetitionJump(hill, record, seed, "improved"),
      );
    }
  });

  // About 4 s alone; several times that beside the other test files under coverage.
  it("makes jumps that land later and fall less often than the original's", { timeout: 60_000 }, () => {
    const rng = new BorlandRandom(4242);
    const records = [0, 1, 2, 3, 4].flatMap((level) =>
      Array.from({ length: 4 }, () => ({ ...drawCpuTalents(level, rng), ...drawCpuForm(rng) })),
    );
    // The pilot's setup draws from the jump's seed alone, so every jump gets its own, spread over 32 bits.
    const seeds = [1, 2, 3, 4, 5, 6];
    let originalFalls = 0;
    let improvedFalls = 0;
    let longer = 0;
    let count = 0;
    const blundered: { original: unknown; improved: unknown }[] = [];
    for (const [r, record] of records.entries()) {
      for (const k of seeds) {
        const seed = Math.imul(r * seeds.length + k, 0x9e3779b1) >>> 0;
        const a = cpuCompetitionJump(hill, record, seed, "original");
        const b = cpuCompetitionJump(hill, record, seed, "improved");
        expect(b.start).toEqual(a.start);
        // A blundered jump is the original's in both; it falls nearly always.
        if (cpuJumpStart(hill, record, seed).pilot.blunder) {
          blundered.push({ original: a, improved: b });
          continue;
        }
        originalFalls += a.score.fell ? 1 : 0;
        improvedFalls += b.score.fell ? 1 : 0;
        if (!a.score.fell && !b.score.fell && b.score.distanceM >= a.score.distanceM) longer += 1;
        count += 1;
      }
    }
    expect(blundered.length).toBeGreaterThan(0);
    for (const jump of blundered) expect(jump.improved).toEqual(jump.original);
    // Measured: 28 and 2 falls in 116 jumps, 88 of the improved ones as long or longer.
    expect(originalFalls).toBeGreaterThan(10);
    expect(improvedFalls * 4).toBeLessThanOrEqual(originalFalls);
    expect(longer / count).toBeGreaterThan(0.6);
  });
});
