import { describe, expect, it } from "vitest";
import { readStorageUsage, storageUsageNote } from "./storage-usage";

describe("storageUsageNote", () => {
  it("gives the size the browser reports, in the units of the replay list", () => {
    expect(storageUsageNote(4_250_000)).toBe(
      "Gra razem z rekordami, powtórkami i wczytanymi plikami zajmuje teraz około 4,3 MB (według przeglądarki).",
    );
    expect(storageUsageNote(640_000)).toContain("około 640,0 KB");
  });

  it("says the browser does not tell when it gives no size", () => {
    expect(storageUsageNote(null)).toBe("Ta przeglądarka nie podaje, ile miejsca zajmuje gra.");
  });
});

describe("readStorageUsage", () => {
  it("reads the usage the browser estimates", async () => {
    expect(await readStorageUsage({ estimate: () => Promise.resolve({ usage: 1234 }) })).toBe(1234);
  });

  it("gives null without the estimate, without a usage, or when the browser refuses", async () => {
    expect(await readStorageUsage(null)).toBeNull();
    expect(await readStorageUsage({})).toBeNull();
    expect(await readStorageUsage({ estimate: () => Promise.resolve({}) })).toBeNull();
    expect(await readStorageUsage({ estimate: () => Promise.reject(new Error("denied")) })).toBeNull();
  });
});
