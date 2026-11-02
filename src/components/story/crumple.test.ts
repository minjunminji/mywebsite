import { describe, expect, it } from 'vitest';
import { creaseOpacity, crumpleLoop, crumpleTransform, newCrumple, roundRectLoop, unfold } from './crumple';

const W = 440;
const H = 248;

/** A deterministic stand-in for Math.random. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('roundRectLoop', () => {
  it('stays inside the sheet and touches all four edges', () => {
    const loop = roundRectLoop(W, H, 10);
    const xs = loop.map((p) => p[0]);
    const ys = loop.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(W, 5);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(H, 5);
  });
});

describe('unfold', () => {
  it('runs 0 → 1, holding near crumpled early and settling late', () => {
    expect(unfold(0)).toBe(0);
    expect(unfold(1)).toBe(1);
    expect(unfold(0.15)).toBeLessThan(0.05);
    expect(unfold(0.85)).toBeGreaterThan(0.95);
    for (let p = 0; p < 1; p += 0.05) expect(unfold(p + 0.05)).toBeGreaterThanOrEqual(unfold(p));
  });
});

describe('crumpleLoop', () => {
  const base = roundRectLoop(W, H, 10);
  const crumple = newCrumple(seeded(7));

  it('is the clean outline once flat', () => {
    expect(crumpleLoop(base, crumple, 1, W, H)).toEqual(base);
  });

  it('is visibly crumpled at the start', () => {
    const out = crumpleLoop(base, crumple, 0, W, H);
    const moved = out.map((p, k) => Math.hypot(p[0] - base[k][0], p[1] - base[k][1]));
    expect(Math.max(...moved)).toBeGreaterThan(30);
  });

  it('relaxes steadily as it unfolds', () => {
    const spread = (e: number) =>
      Math.max(...crumpleLoop(base, crumple, e, W, H).map((p, k) => Math.hypot(p[0] - base[k][0], p[1] - base[k][1])));
    expect(spread(0.25)).toBeGreaterThan(spread(0.75));
    expect(spread(0.75)).toBeGreaterThan(spread(0.99));
  });
});

describe('newCrumple', () => {
  it('is reproducible from the same random source', () => {
    expect(newCrumple(seeded(3))).toEqual(newCrumple(seeded(3)));
  });

  it('starts tilted between 8 and 16 degrees', () => {
    for (let s = 1; s < 20; s++) {
      const rot = Math.abs(newCrumple(seeded(s)).rot);
      expect(rot).toBeGreaterThanOrEqual(8);
      expect(rot).toBeLessThanOrEqual(16);
    }
  });
});

describe('crumpleTransform / creaseOpacity', () => {
  const crumple = newCrumple(seeded(11));

  it('starts small and tilted, ends full size and level', () => {
    expect(crumpleTransform(crumple, 0)).toEqual({ rotate: crumple.rot, scale: 0.14 });
    expect(crumpleTransform(crumple, 1)).toEqual({ rotate: 0, scale: 1 });
  });

  it('fades the creases out as it flattens', () => {
    expect(creaseOpacity(0)).toBe(1);
    expect(creaseOpacity(1)).toBe(0);
    expect(creaseOpacity(0.5)).toBeLessThan(creaseOpacity(0.2));
  });
});
