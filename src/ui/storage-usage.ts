import { UI_TEXT } from "../text/ui-text";
import { formatSize } from "./number-text";

/** The line about the room the game takes on the device; null when the browser gives no size. */
export function storageUsageNote(usageBytes: number | null): string {
  return usageBytes === null ? UI_TEXT.install.storageUnknown : UI_TEXT.install.storageUsed(formatSize(usageBytes));
}

/**
 * The bytes the browser counts for this site: the files of the game kept for offline play, the save, the replays
 * and the original's files. Null when the browser has no such count or refuses it.
 */
export async function readStorageUsage(
  storage: {
    estimate?: () => Promise<{ usage?: number }>;
  } | null,
): Promise<number | null> {
  if (typeof storage?.estimate !== "function") return null;
  try {
    const { usage } = await storage.estimate();
    return typeof usage === "number" && Number.isFinite(usage) && usage >= 0 ? usage : null;
  } catch {
    return null;
  }
}
