import { describe, expect, it } from "vitest";
import { recordSaveOf } from "./record-save";

describe("recordSaveOf", () => {
  it("follows the write of the record on a device that keeps the save", () => {
    expect(recordSaveOf("saving", true)).toBe("saving");
    expect(recordSaveOf("stored", true)).toBe("saved");
    expect(recordSaveOf("failed", true)).toBe("failed");
  });

  it("calls a record kept when the save already held one as good, from another window", () => {
    expect(recordSaveOf("unchanged", true)).toBe("saved");
  });

  it("says the record lasts only for the visit when the browser lets the game keep nothing", () => {
    expect(recordSaveOf("stored", false)).toBe("visit");
    expect(recordSaveOf("saving", false)).toBe("visit");
  });

  it("tells a failed write whatever the store", () => {
    expect(recordSaveOf("failed", false)).toBe("failed");
  });
});
