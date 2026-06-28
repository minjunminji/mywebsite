import { describe, expect, it } from 'vitest';
import { buildFrameQueue } from './frameQueue';

// 4 segments connecting 5 stops (0..4), each with distinct readable frames.
const seg = [
  ['a0', 'a1'], // 0 -> 1
  ['b0', 'b1', 'b2'], // 1 -> 2
  ['c0', 'c1'], // 2 -> 3
  ['d0', 'd1'], // 3 -> 4
];

describe('buildFrameQueue', () => {
  it('returns empty when from === to', () => {
    expect(buildFrameQueue(2, 2, seg)).toEqual([]);
  });

  it('forward single segment', () => {
    expect(buildFrameQueue(0, 1, seg)).toEqual(['a0', 'a1']);
  });

  it('forward across multiple segments (no stop at intermediate)', () => {
    expect(buildFrameQueue(0, 2, seg)).toEqual(['a0', 'a1', 'b0', 'b1', 'b2']);
  });

  it('forward across the project turnstiles', () => {
    expect(buildFrameQueue(2, 4, seg)).toEqual(['c0', 'c1', 'd0', 'd1']);
  });

  it('backward single segment plays reversed', () => {
    expect(buildFrameQueue(1, 0, seg)).toEqual(['a1', 'a0']);
  });

  it('backward across multiple segments plays each reversed, in reverse order', () => {
    expect(buildFrameQueue(2, 0, seg)).toEqual(['b2', 'b1', 'b0', 'a1', 'a0']);
  });

  it('does not mutate the source segments', () => {
    buildFrameQueue(2, 0, seg);
    expect(seg[1]).toEqual(['b0', 'b1', 'b2']);
  });
});
