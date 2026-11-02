// The record a font build script in tools/font writes next to the font it builds (tools/font/build_record.py):
// one line per item, its SHA-256 and its name, the files by their path from the repository's root.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** The record as it was written ({ name: digest }) and the same items as they are today. */
export function readBuildRecord(recordPath, inputsToday) {
  const lines = readFileSync(new URL(recordPath, ROOT), "utf8").trimEnd().split("\n");
  const written = Object.fromEntries(
    lines.map((line) => {
      const [digest, name] = line.split("  ");
      return [name, digest];
    }),
  );
  const digestToday = (name) => inputsToday[name] ?? sha256(readFileSync(new URL(name, ROOT)));
  return { written, today: Object.fromEntries(Object.keys(written).map((name) => [name, digestToday(name)])) };
}
