import { describe, expect, it } from 'vitest';
import { stepSpring, type Spring } from './cursorMath';

describe('stepSpring', () => {
  it('moves toward the target on the first step from rest, staying finite', () => {
    const s: Spring = { value: 0, velocity: 0 };
    stepSpring(s, 100, 0.2, 0.76);
    expect(s.value).toBeGreaterThan(0); // moved toward 100
    expect(s.value).toBeLessThan(100); // but not past it on step one
    expect(Number.isFinite(s.value)).toBe(true);
    expect(Number.isFinite(s.velocity)).toBe(true);
  });

  it('converges to (approximately) the target with velocity decaying to ~0', () => {
    const s: Spring = { value: 0, velocity: 0 };
    for (let i = 0; i < 500; i += 1) stepSpring(s, 100, 0.2, 0.76);
    expect(s.value).toBeCloseTo(100, 3);
    expect(Math.abs(s.velocity)).toBeLessThan(1e-3);
  });

  it('also converges when the target is below the starting value', () => {
    const s: Spring = { value: 50, velocity: 0 };
    for (let i = 0; i < 500; i += 1) stepSpring(s, -20, 0.45, 0.76);
    expect(s.value).toBeCloseTo(-20, 3);
    expect(Math.abs(s.velocity)).toBeLessThan(1e-3);
  });
});
