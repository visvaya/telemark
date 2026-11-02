import { describe, expect, it } from "vitest";
import { OWN_HILLS } from "../game/hill-choice";
import { startTrainingJump } from "../game/training-session";
import { jumpProbePublisher, probeOf } from "./jump-probe";

describe("the probe of a jump for the browser tests", () => {
  it("tells the frame, how far ahead the edge of the takeoff is and the lean of the body", () => {
    const [hill] = OWN_HILLS;
    if (hill === undefined) throw new Error("no built-in hill");
    const { state } = startTrainingJump(hill, 1);
    expect(probeOf(state, hill.profile.takeoffXM)).toEqual({
      frame: state.logic.frame,
      toEdgeM: hill.profile.takeoffXM - state.jumper.xM,
      bodyAngleRad: state.logic.bodyAngleRad,
    });
    expect(probeOf(state, hill.profile.takeoffXM).toEdgeM).toBeGreaterThan(0);
  });

  it("is published only under automation", () => {
    expect(navigator.webdriver).not.toBe(true);
    expect(jumpProbePublisher(0)).toBeNull();
  });
});
