// src/components/explainer/explainerMath.test.ts
import { describe, expect, it } from 'vitest';
import { createBrush, stepBrush } from '../reveal/brush';
import {
  createCpuMask,
  distToSegment,
  fadeTime,
  quantizeUnorm8,
  simulateDecay,
  stepCpuMask,
  strokeFalloff,
  toHalf,
} from './explainerMath';

describe('distToSegment', () => {
  it('projects onto the interior', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toEqual({ d: 3, t: 0.5 });
  });
  it('clamps to the endpoints', () => {
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toEqual({ d: 5, t: 0 });
    expect(distToSegment(14, 3, 0, 0, 10, 0)).toEqual({ d: 5, t: 1 });
  });
  it('handles a zero-length segment', () => {
    expect(distToSegment(3, 4, 1, 1, 1, 1).d).toBeCloseTo(Math.hypot(2, 3), 9);
  });
});

describe('strokeFalloff', () => {
  it('is 1 inside the core, 0 at the radius, smooth between', () => {
    expect(strokeFalloff(0, 10)).toBe(1);
    expect(strokeFalloff(1, 10)).toBe(1);
    expect(strokeFalloff(10, 10)).toBe(0);
    expect(strokeFalloff(5.5, 10)).toBeCloseTo(0.5, 9);
  });
});

describe('precision', () => {
  it('quantizes to 1/255 steps', () => {
    expect(quantizeUnorm8(1 - 0.001)).toBe(1);
    expect(quantizeUnorm8(1 - 0.003)).toBeCloseTo(254 / 255, 12);
  });
  it('rounds to half-float precision', () => {
    expect(toHalf(1)).toBe(1);
    expect(toHalf(0.5)).toBe(0.5);
    expect(Math.abs(toHalf(1 / 3) - 1 / 3)).toBeLessThan(2 ** -12);
    expect(toHalf(0)).toBe(0);
  });
});

describe('decay', () => {
  it('ideal decay fades in the configured duration at any refresh rate', () => {
    for (const hz of [30, 60, 144, 240]) {
      expect(fadeTime(hz, 2.5, 'ideal')).toBeCloseTo(2.5, 1);
    }
  });
  it('8-bit storage never fades at 240Hz (the step rounds away)', () => {
    expect(fadeTime(240, 2.5, 'rgba8')).toBeNull();
  });
  it('8-bit storage fades too fast at 60Hz (1.7 steps rounds to 2)', () => {
    expect(fadeTime(60, 2.5, 'rgba8')).toBeCloseTo(2.13, 1);
  });
  it('half-float storage stays finite (unlike rgba8) but still overshoots a bit at 240Hz', () => {
    // Verified against a real IEEE754 binary16 round-trip (Node's Float16Array):
    // at 240Hz the per-frame step (1/600 ≈ 0.001667) sits awkwardly inside the
    // half-float grid near 1 (ULP ≈ 0.00049), so quantization rounds up often
    // enough to add ~6% to the fade time — nowhere near rgba8's "never", but
    // not an exact match for the ideal 2.5s either.
    expect(fadeTime(240, 2.5, 'r16f')).toBeCloseTo(2.6541666666666667, 9);
  });
  it('simulateDecay starts at 1 and is non-increasing', () => {
    const v = simulateDecay(60, 2.5, 'rgba8', 1);
    expect(v[0]).toBe(1);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeLessThanOrEqual(v[i - 1]);
  });
});

describe('stepCpuMask', () => {
  const params = { dt: 1 / 60, duration: 2.5, strength: 0.12, aspect: 16 / 9 };

  it('fully reveals under the brush and nothing far away', () => {
    const mask = createCpuMask(64, 36);
    const brush = createBrush(0.15);
    const painting = stepBrush(brush, {
      pointerX: 0, pointerY: 0, pointerActive: true, newStroke: true,
      dt: 1 / 60, aspect: 16 / 9, baseRadius: 0.15,
    });
    stepCpuMask(mask, brush, painting, params);
    expect(mask.data[18 * 64 + 32]).toBeGreaterThan(0.99);
    expect(mask.data[0]).toBe(0);
  });

  it('decays by dt/duration per frame when not painting', () => {
    const mask = createCpuMask(4, 4);
    mask.data.fill(1);
    stepCpuMask(mask, createBrush(0.15), false, params);
    // CpuMask.data is a Float32Array (~7 significant decimal digits), so the
    // stored value can't match the double-precision expected value to 9
    // decimal places — precision 6 is the tightest a float32 round-trip
    // can guarantee here (observed error is ~6e-9, well under 5e-7).
    expect(mask.data[0]).toBeCloseTo(1 - 1 / 60 / 2.5, 6);
  });
});
