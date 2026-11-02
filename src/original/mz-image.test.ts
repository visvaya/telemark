import { describe, expect, it } from "vitest";
import { readMzImage } from "./mz-image";
import { seededBytes } from "./test-support/seeded-bytes";

const PAGE_BYTES = 512;
const PARAGRAPH_BYTES = 16;

/** A file with an MZ header: `lastPageBytes` and `pages` give the image's end, `headerParagraphs` its start. */
function mzFile(fileBytes: number, lastPageBytes: number, pages: number, headerParagraphs: number): Uint8Array {
  const file = new Uint8Array(fileBytes).map((_, i) => i % 251);
  const v = new DataView(file.buffer);
  v.setUint16(0, 0x5a4d, true);
  v.setUint16(2, lastPageBytes, true);
  v.setUint16(4, pages, true);
  v.setUint16(8, headerParagraphs, true);
  return file;
}

describe("the load image of an MZ executable", () => {
  it("lies between the header and the size the header gives", () => {
    const file = mzFile(3 * PAGE_BYTES + 100, 40, 3, 2);
    const { image } = readMzImage(file);
    expect(image.length).toBe(2 * PAGE_BYTES + 40 - 2 * PARAGRAPH_BYTES);
    expect(image[0]).toBe(file[2 * PARAGRAPH_BYTES]);
    expect(image.at(-1)).toBe(file[2 * PAGE_BYTES + 40 - 1]);
  });

  it("takes a last page of 0 bytes as a full one", () => {
    const { image } = readMzImage(mzFile(2 * PAGE_BYTES, 0, 2, 1));
    expect(image.length).toBe(2 * PAGE_BYTES - PARAGRAPH_BYTES);
  });

  it("refuses a file that is not one", () => {
    expect(() => readMzImage(new Uint8Array(0x1b))).toThrow("too short");
    const notMz = mzFile(PAGE_BYTES, 0, 1, 1);
    notMz[0] = 0x50;
    expect(() => readMzImage(notMz)).toThrow("not an MZ executable");
  });

  it("refuses a header that does not fit the file", () => {
    // No pages, more pages than the file has, and a header longer than the image.
    for (const file of [mzFile(PAGE_BYTES, 0, 0, 1), mzFile(PAGE_BYTES, 1, 2, 1), mzFile(PAGE_BYTES, 0, 1, 33)]) {
      expect(() => readMzImage(file)).toThrow("does not match the file size");
    }
  });

  it("reads any bytes a player may pick either as an image inside the file or as a refusal", () => {
    const bytes = seededBytes(20261102);
    const problems: string[] = [];
    let read = 0;
    let refused = 0;
    for (let attempt = 0; attempt < 2000; attempt++) {
      const [lengthByte = 0, pagesByte = 0, lastByte = 0, headerByte = 0] = bytes(4);
      const file = bytes(lengthByte * 8);
      // Every other file has the magic and a header near its own size, so the checks after it are reached and some
      // headers fit; the rest are random bytes.
      if (attempt % 2 === 0 && file.length >= 0x1c) {
        const v = new DataView(file.buffer);
        v.setUint16(0, 0x5a4d, true);
        v.setUint16(2, (lastByte * 2) % PAGE_BYTES, true);
        v.setUint16(4, pagesByte % (Math.ceil(file.length / PAGE_BYTES) + 2), true);
        v.setUint16(8, headerByte % 8, true);
      }
      try {
        const { image } = readMzImage(file);
        // The size and start the MZ format declares: the image is exactly that, and the file holds all of it.
        const v = new DataView(file.buffer);
        const lastPageBytes = v.getUint16(2, true);
        const declaredEnd =
          (v.getUint16(4, true) - 1) * PAGE_BYTES + (lastPageBytes === 0 ? PAGE_BYTES : lastPageBytes);
        const start = v.getUint16(8, true) * PARAGRAPH_BYTES;
        if (declaredEnd > file.length || image.byteOffset !== start || image.length !== declaredEnd - start) {
          problems.push(`attempt ${attempt}: an image of ${image.length} bytes at ${image.byteOffset}`);
        }
        read++;
      } catch (error) {
        if (!(error instanceof Error)) problems.push(`attempt ${attempt}: threw ${String(error)}`);
        refused++;
      }
    }
    expect(problems).toEqual([]);
    expect(read).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(100);
  });
});
