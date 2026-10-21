/**
 * The share of one of `count` test files that split a list between them, so that the files run in parallel: every
 * `count`-th item from `shard` on. Each item falls in exactly one share.
 */
export function shardOf<T>(items: readonly T[], shard: number, count: number): T[] {
  return items.filter((_item, i) => i % count === shard);
}
