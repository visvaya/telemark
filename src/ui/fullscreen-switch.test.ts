import { describe, expect, it } from "vitest";
import { fullscreenSwitch } from "./fullscreen-switch";

const base = { enabled: true, touch: false, own: false, reported: false };

describe("fullscreenSwitch", () => {
  it("is hidden where a page cannot ask for the full screen", () => {
    expect(fullscreenSwitch({ ...base, enabled: false })).toBe("hidden");
  });

  it("reads off, and on once the page has the full screen", () => {
    expect(fullscreenSwitch(base)).toBe("off");
    expect(fullscreenSwitch({ ...base, own: true, reported: true })).toBe("on");
    expect(fullscreenSwitch({ ...base, touch: true, own: true, reported: true })).toBe("on");
  });

  it("reads on for the browser's own full screen on a computer, which F11 leaves", () => {
    expect(fullscreenSwitch({ ...base, reported: true })).toBe("on");
  });

  it("is hidden in the installed app on a touch screen, whose full screen only the system leaves", () => {
    expect(fullscreenSwitch({ ...base, touch: true, reported: true })).toBe("hidden");
  });
});
