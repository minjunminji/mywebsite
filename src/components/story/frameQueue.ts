// Builds the ordered list of frames to play when moving from one stop to
// another. Forward = segments concatenated in order; backward = each crossed
// segment reversed, in reverse order. Skipped stops are passed straight
// through (their frames are included, but the caller never parks there).
export function buildFrameQueue(
  from: number,
  to: number,
  segments: readonly (readonly string[])[],
): string[] {
  if (from === to) {
    return [];
  }

  const queue: string[] = [];

  if (to > from) {
    for (let s = from; s < to; s += 1) {
      queue.push(...segments[s]);
    }
  } else {
    for (let s = from - 1; s >= to; s -= 1) {
      queue.push(...[...segments[s]].reverse());
    }
  }

  return queue;
}
