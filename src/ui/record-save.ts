import type { RecordSave } from "../render/jump-view";

/**
 * Where the write of a new record stands: being written, stored, failed, or not needed because the save already
 * held a record as good (another window stored it meanwhile).
 */
export type RecordWrite = "saving" | "stored" | "failed" | "unchanged";

/** What the picture says under a new record, from its write and whether the store outlives the page. */
export function recordSaveOf(write: RecordWrite, kept: boolean): RecordSave {
  if (write === "failed") return "failed";
  if (!kept) return "visit";
  return write === "saving" ? "saving" : "saved";
}
