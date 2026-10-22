/**
 * The share of one of `count` test files that split a list between them, so that the files run in parallel: every
 * `count`-th item from `shard` on. Each item falls in exactly one share.
 */
export function shardOf<T>(items: readonly T[], shard: number, count: number): T[] {
  return items.filter((_item, i) => i % count === shard);
}

/**
 * The share of one of `count` test files that split a list in runs: the `shard`-th of `count` nearly equal runs of
 * consecutive items, so items close in the list's order (hills close in size) stay together.
 */
export function runOf<T>(items: readonly T[], shard: number, count: number): T[] {
  const start = Math.round((items.length * shard) / count);
  const end = Math.round((items.length * (shard + 1)) / count);
  return items.slice(start, end);
}
