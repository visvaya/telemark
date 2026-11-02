import { describe, expect, it } from "vitest";
import { createJump, jumpRunning, stepFrame, type JumpSimState } from "../sim/jump-sim";
import {
  REGRESSION_FRAME_LIMIT,
  REGRESSION_SCENARIOS,
  regressionSetup,
} from "../sim/test-support/regression-scenarios";
import { makeBot } from "../sim/test-support/synthetic";

/**
 * FNV-1a over the bytes of every value's float32 bits, in order. Byte by byte: mixed as whole words, a sign flipped
 * in two values cancels out ([1, 2] and [-1, -2] hash alike).
 */
function hashValues(previous: number, values: readonly number[]): number {
  const view = new DataView(new ArrayBuffer(4));
  let hash = previous;
  for (const value of values) {
    view.setFloat32(0, value, true);
    for (let byte = 0; byte < 4; byte++) hash = Math.imul(hash ^ view.getUint8(byte), 0x01000193) >>> 0;
  }
  return hash;
}

/** Every channel of both legs as the figure is drawn from it: joints and segments, where they are and where to. */
const poseValues = ({ pose }: JumpSimState): number[] =>
  pose.legs.flatMap((leg) => [
    ...leg.joints.current,
    ...leg.joints.target,
    ...leg.segments.current,
    ...leg.segments.target,
  ]);

describe("the jumper's pose through a jump", () => {
  it("is hashed so that signs flipped in two values change the hash", () => {
    expect(hashValues(0x811c9dc5, [1, 2])).not.toBe(hashValues(0x811c9dc5, [-1, -2]));
  });

  // The simulation's regression test hashes the ski joints and one segment only; the figure is drawn from every
  // joint. The port matches the original's pose frame for frame where the original's files are at hand
  // (src/sim/*.golden.test.ts); this record of its values guards the pose code where they are not, as in CI and in
  // the mutation tests.
  it.each(REGRESSION_SCENARIOS)("$name: every joint and segment as the port moves them", (scenario) => {
    const setup = regressionSetup(scenario);
    let state = createJump(setup);
    const input = makeBot(setup.hill, scenario.bot, () => state);
    let hash = 0x811c9dc5;
    for (let guard = 0; guard < REGRESSION_FRAME_LIMIT && jumpRunning(state); guard++) {
      state = stepFrame(state, setup, input);
      hash = hashValues(hash, [state.pose.poseId, ...poseValues(state)]);
    }
    expect({ frames: state.logic.frame, fallType: state.logic.fallType, hash: hash.toString(16) }).toMatchSnapshot();
  });
});
