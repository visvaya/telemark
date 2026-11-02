/**
 * Bytes from a seeded generator (a 32-bit linear congruential one), for the tests that feed the readers of the
 * player's files with whatever a player may pick: a failing case can be run again from its seed.
 */
export function seededBytes(seed: number): (count: number) => Uint8Array {
  let state = seed >>> 0;
  return (count) =>
    Uint8Array.from({ length: count }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state >>> 24;
    });
}
