import { describe, expect, it, vi } from 'vitest';
import { createFrameLoader } from './frameLoader';

function pendingLoads() {
  const pending = new Map<string, (ready: boolean) => void>();
  const decode = vi.fn((src: string) => new Promise<boolean>((resolve) => pending.set(src, resolve)));
  return { pending, decode };
}

describe('frame loading', () => {
  it('bounds concurrent decoding and shares duplicate requests', async () => {
    const { pending, decode } = pendingLoads();
    const loader = createFrameLoader(decode, 2);
    const first = loader.load('a');
    expect(loader.load('a')).toBe(first);
    const second = loader.load('b');
    const third = loader.load('c');
    await Promise.resolve();
    expect(decode.mock.calls.map(([src]) => src)).toEqual(['a', 'b']);
    pending.get('a')!(true);
    expect(await first).toBe(true);
    await Promise.resolve();
    expect(decode.mock.calls.map(([src]) => src)).toEqual(['a', 'b', 'c']);
    pending.get('b')!(true);
    pending.get('c')!(true);
    await Promise.all([second, third]);
  });

  it('releases a slot after failure so later frames still load', async () => {
    const decode = vi.fn(async (src: string) => {
      if (src === 'broken') throw new Error('decode failed');
      return true;
    });
    const loader = createFrameLoader(decode, 1);
    const broken = loader.load('broken');
    const next = loader.load('next');
    expect(await broken).toBe(false);
    expect(await next).toBe(true);
  });

  it('prefetches only the requested playback window', async () => {
    const { decode } = pendingLoads();
    const loader = createFrameLoader(decode, 4);
    loader.prefetch(['past', 'current', 'next', 'later'], 1, 2);
    await Promise.resolve();
    expect(decode.mock.calls.map(([src]) => src)).toEqual(['current', 'next']);
  });
});
