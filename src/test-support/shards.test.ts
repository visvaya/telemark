import { describe, expect, it } from "vitest";
import { shardOf } from "./shards";

describe("shares of a list split among test files", () => {
  it("put every item in exactly one share, in the order of the list", () => {
    const items = Array.from({ length: 11 }, (_v, i) => `h${i}`);
    const shares = [0, 1, 2, 3].map((shard) => shardOf(items, shard, 4));
    expect(shares.flat().toSorted()).toEqual(items.toSorted());
    expect(shares.map((s) => s.length)).toEqual([3, 3, 3, 2]);
    expect(shares[0]).toEqual(["h0", "h4", "h8"]);
  });

  it("give the whole list to a single share", () => {
    expect(shardOf([1, 2, 3], 0, 1)).toEqual([1, 2, 3]);
  });
});
