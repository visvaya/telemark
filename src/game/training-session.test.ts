import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "./hill-choice";
import { PHASE, notesShownBy } from "../sim/jump-logic";
import type { WindState } from "../sim/wind";
import {
  isJumpOver,
  nextJumpAllowed,
  presentationFrame,
  startTrainingJump,
  stepTrainingJump,
} from "./training-session";

const hill = OWN_HILLS[0];

describe("training jump", () => {
  it("is fully determined by the seed and the inputs", () => {
    if (!hill) throw new Error("no hill");
    const run = () => {
      let jump = startTrainingJump(hill, 12345);
      for (let f = 0; f < 4000 && !isJumpOver(jump); f++) {
        const frame = jump.state.logic.frame + 1;
        jump = stepTrainingJump(jump, {
          left: frame === 70 || (frame > 500 && frame < 520),
          right: frame > 500 && frame < 520,
          dy: 0,
        });
      }
      return jump.state;
    };
    const a = run();
    expect(a.logic.frame).toBeGreaterThan(70);
    expect(run()).toEqual(a);
  });

  it("starts with the wind of the training setup", () => {
    if (!hill) throw new Error("no hill");
    const jump = startTrainingJump(hill, 1);
    expect(jump.setup.wind.speedMPerS).toBeGreaterThanOrEqual(0);
    expect(jump.setup.wind.speedMPerS).toBeLessThanOrEqual(4.5);
    expect(jump.state.logic.frame).toBe(1);
  });

  it("draws the start wind and blows it through a jump as the port does", () => {
    // The port matches the original frame for frame where the original's files are at hand (src/sim/*.golden.test.ts).
    // This record of its values guards the wind code where they are not, as in CI and in the mutation tests.
    if (!hill) throw new Error("no hill");
    const winds = [1, 2, 3, 0xdeadbeef].map((seed) => {
      let jump = startTrainingJump(hill, seed);
      const start = jump.setup.wind;
      const during: WindState[] = [];
      for (let f = 1; f <= 600; f++) {
        jump = stepTrainingJump(jump, { left: f === 70, right: false, dy: 0 });
        if (f % 100 === 0) during.push(jump.state.wind);
      }
      return { seed, start, during };
    });
    expect(winds).toMatchSnapshot();
  });

  it("allows the next jump half a second after a disqualification", () => {
    if (!hill) throw new Error("no hill");
    // Nobody presses start: the countdown runs out.
    let jump = startTrainingJump(hill, 3);
    for (let f = 0; f < 4000 && !jump.state.logic.finished; f++)
      jump = stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(jump.state.logic.finished).toBe(true);
    expect(jump.state.logic.distanceM).toBe(0);
    const disqualifiedAt = presentationFrame(jump);
    expect(nextJumpAllowed(jump.state.logic, disqualifiedAt)).toBe(false);
    expect(nextJumpAllowed(jump.state.logic, disqualifiedAt + 34)).toBe(false);
    expect(nextJumpAllowed(jump.state.logic, disqualifiedAt + 35)).toBe(true);
  });

  it("allows the next jump once every note of a scored jump is up, not before", () => {
    if (!hill) throw new Error("no hill");
    let jump = startTrainingJump(hill, 12345);
    let allowedAt: number | null = null;
    let scoredAt: number | null = null;
    for (let f = 0; f < 6000 && !isJumpOver(jump); f++) {
      const frame = jump.state.logic.frame + 1;
      const takeoff = jump.state.logic.phase === PHASE.crouch && jump.state.jumper.xM > hill.profile.takeoffXM - 4;
      jump = stepTrainingJump(jump, { left: frame === 70 || takeoff, right: takeoff, dy: 0 });
      const clock = presentationFrame(jump);
      expect(nextJumpAllowed(jump.state.logic, clock)).toBe(notesShownBy(jump.state.logic, clock));
      if (jump.state.logic.finished) scoredAt ??= clock;
      if (nextJumpAllowed(jump.state.logic, clock)) allowedAt ??= clock;
    }
    expect(jump.state.logic.distanceM).toBeGreaterThan(0);
    expect(scoredAt).not.toBeNull();
    expect(allowedAt).toBeGreaterThan(scoredAt ?? 0);
    // The jumper is still moving then.
    expect(allowedAt).toBeLessThan(presentationFrame(jump));
  });

  it("keeps the presentation clock running after the jump is over", () => {
    if (!hill) throw new Error("no hill");
    let jump = startTrainingJump(hill, 3);
    for (let f = 0; f < 4000 && !isJumpOver(jump); f++)
      jump = stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(isJumpOver(jump)).toBe(true);
    const end = jump.state.logic.frame;
    jump = stepTrainingJump(jump, { left: true, right: true, dy: 5 });
    jump = stepTrainingJump(jump, { left: false, right: false, dy: 0 });
    expect(jump.state.logic.frame).toBe(end);
    expect(presentationFrame(jump)).toBe(end + 2);
  });
});
