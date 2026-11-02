import { describe, expect, it } from "vitest";
import { PHASE } from "../sim/jump-logic";
import { startFrameOf } from "./automation-marks";

describe("the frame of the start, as the jump picture shows it to the browser tests", () => {
  it("is none at the gate", () => {
    expect(startFrameOf(null, { frame: 80, phase: PHASE.gate, inrunFrames: 0 })).toBeNull();
    expect(startFrameOf(70, { frame: 1, phase: PHASE.gate, inrunFrames: 0 })).toBeNull();
  });

  it("is read back from the frames counted on the inrun, however many steps the drawn frame took", () => {
    expect(startFrameOf(null, { frame: 75, phase: PHASE.inrun, inrunFrames: 3 })).toBe(72);
  });

  it("stays as it was through the rest of the jump", () => {
    expect(startFrameOf(72, { frame: 400, phase: PHASE.flight, inrunFrames: 210 })).toBe(72);
  });

  it("is found anew for a jump that starts over without a frame at the gate", () => {
    // A replay or a new jump counts its frames from the start again.
    expect(startFrameOf(300, { frame: 74, phase: PHASE.inrun, inrunFrames: 2 })).toBe(72);
  });
});
