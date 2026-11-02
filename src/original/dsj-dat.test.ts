import { describe, expect, it } from "vitest";
import { decodeCp852, readResource, readText } from "./dsj-dat";
import { seededBytes } from "./test-support/seeded-bytes";

function textResource(texts: Uint8Array[]): Uint8Array {
  // Table of u16 offsets, then length-prefixed texts; each offset points past the length byte.
  const tableBytes = texts.length * 2;
  const out: number[] = Array.from({ length: tableBytes }, () => 0);
  let at = tableBytes;
  texts.forEach((t, i) => {
    out.push(t.length, ...t);
    out[2 * i] = (at + 1) & 0xff;
    out[2 * i + 1] = (at + 1) >> 8;
    at += 1 + t.length;
  });
  return Uint8Array.from(out);
}

function resourceFile(entries: Map<number, Uint8Array>, directoryEntries = 8): Uint8Array {
  const out: number[] = Array.from({ length: directoryEntries * 4 }, () => 0);
  for (const [id, data] of entries) {
    const offset = out.length;
    out.splice(id * 4, 4, offset & 0xff, (offset >> 8) & 0xff, (offset >> 16) & 0xff, offset >>> 24);
    out.push(data.length & 0xff, data.length >> 8, ...data);
  }
  return Uint8Array.from(out);
}

/** A resource file built right, then with a few bytes overwritten, so the checks past the first are reached. */
function damagedFile(bytes: (count: number) => Uint8Array): Uint8Array {
  const [first = 0, second = 0, damage = 0] = bytes(3);
  const file = resourceFile(
    new Map([
      [first % 8, bytes(second)],
      [(first + 3) % 8, bytes(damage)],
    ]),
  );
  for (const [at = 0, value = 0] of Array.from({ length: damage % 4 }, () => bytes(2))) {
    file[at % file.length] = value;
  }
  return file;
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("resource file", () => {
  it("returns resources by id and null for missing ones", () => {
    const dat = resourceFile(new Map([[2, Uint8Array.from([1, 2, 3])]]));
    expect(readResource(dat, 2)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(readResource(dat, 1)).toBeNull();
    expect(readResource(dat, 99)).toBeNull();
  });

  it("rejects a truncated file", () => {
    const dat = resourceFile(new Map([[0, Uint8Array.from([1, 2, 3])]]));
    expect(() => readResource(dat.subarray(0, dat.length - 1), 0)).toThrow("past the end");
  });

  it("reads texts from the offset table", () => {
    const res = textResource([ascii("Gotowe"), Uint8Array.from([0x57, 0x69, 0x73, 0x88, 0x61])]);
    expect(readText(res, 0)).toBe("Gotowe");
    expect(readText(res, 1)).toBe("Wisła");
    expect(readText(res, 5)).toBeNull();
  });

  it("decodes Polish letters of code page 852", () => {
    expect(decodeCp852(Uint8Array.from([0xa5, 0x86, 0xa9, 0x88, 0xe4, 0xa2, 0x98, 0xab, 0xbe]))).toBe("ąćęłńóśźż");
    expect(decodeCp852(Uint8Array.from([0xa4, 0x8f, 0xa8, 0x9d, 0xe3, 0xe0, 0x97, 0x8d, 0xbd]))).toBe("ĄĆĘŁŃÓŚŹŻ");
  });
});

describe("any bytes a player may pick as the resource file", () => {
  it("give a resource inside the file with the length it declares, nothing, or a refusal", () => {
    const bytes = seededBytes(852);
    const problems: string[] = [];
    const outcomes = { read: 0, none: 0, refused: 0 };
    for (let attempt = 0; attempt < 2000; attempt++) {
      const dat = attempt % 2 === 0 ? damagedFile(bytes) : bytes((bytes(1)[0] ?? 0) + 1);
      const id = (bytes(1)[0] ?? 0) % 10;
      try {
        const resource = readResource(dat, id);
        if (resource === null) {
          outcomes.none++;
          continue;
        }
        const declared = new DataView(dat.buffer).getUint16(resource.byteOffset - 2, true);
        if (
          resource.buffer !== dat.buffer ||
          resource.length !== declared ||
          resource.byteOffset + declared > dat.length
        ) {
          problems.push(`attempt ${attempt}: resource ${id} of ${resource.length} bytes at ${resource.byteOffset}`);
        }
        outcomes.read++;
      } catch (error) {
        if (!(error instanceof Error)) problems.push(`attempt ${attempt}: threw ${String(error)}`);
        outcomes.refused++;
      }
    }
    expect(problems).toEqual([]);
    expect(outcomes.read).toBeGreaterThan(100);
    expect(outcomes.none).toBeGreaterThan(100);
    expect(outcomes.refused).toBeGreaterThan(100);
  });

  it("give a text of the length its byte declares, or nothing, and never throw", () => {
    const bytes = seededBytes(220);
    const problems: string[] = [];
    let read = 0;
    for (let attempt = 0; attempt < 2000; attempt++) {
      const resource =
        attempt % 2 === 0 ? textResource([bytes(bytes(1)[0] ?? 0), bytes(3)]) : bytes((bytes(1)[0] ?? 0) + 1);
      if (attempt % 4 === 0) resource[(bytes(1)[0] ?? 0) % resource.length] = bytes(1)[0] ?? 0;
      const index = (bytes(1)[0] ?? 0) % 4;
      const text = readText(resource, index);
      if (text === null) continue;
      const at = new DataView(resource.buffer).getUint16(2 * index, true);
      if (text.length !== resource[at - 1]) problems.push(`attempt ${attempt}: text ${index} of ${text.length}`);
      read++;
    }
    expect(problems).toEqual([]);
    expect(read).toBeGreaterThan(100);
  });

  it("decode every byte of code page 852 to a character of its own", () => {
    const all = decodeCp852(Uint8Array.from({ length: 256 }, (_, i) => i));
    expect(all).toHaveLength(256);
    expect(all).not.toContain("�");
    expect(new Set(all).size).toBe(256);
  });
});
