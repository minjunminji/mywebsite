import { describe, expect, it } from 'vitest';
import { remapClamped, stepSpring, type Spring } from './cursorMath';

describe('remapClamped', () => {
  it('returns the low output when the input range is degenerate (inMax === inMin)', () => {
    expect(remapClamped(5, 2, 2, 1, 1.3)).toBe(1);
    expect(remapClamped(-100, 2, 2, 0.8, 1)).toBe(0.8);
  });

  it('clamps inputs below and above the range to the output bounds', () => {
    expect(remapClamped(-10, 0, 10, 0, 100)).toBe(0); // below → outMin
    expect(remapClamped(999, 0, 10, 0, 100)).toBe(100); // above → outMax
  });

  it('is linear at the midpoint and endpoints', () => {
    expect(remapClamped(0, 0, 10, 20, 40)).toBe(20);
    expect(remapClamped(5, 0, 10, 20, 40)).toBe(30);
    expect(remapClamped(10, 0, 10, 20, 40)).toBe(40);
  });

  it('matches the X stretch mapping (0 → 1, ≥ height/2 → 1.3)', () => {
    const halfHeight = 20;
    expect(remapClamped(0, 0, halfHeight, 1, 1.3)).toBe(1);
    expect(remapClamped(halfHeight, 0, halfHeight, 1, 1.3)).toBeCloseTo(1.3);
    expect(remapClamped(halfHeight * 2, 0, halfHeight, 1, 1.3)).toBeCloseTo(1.3); // clamped
    expect(remapClamped(halfHeight / 2, 0, halfHeight, 1, 1.3)).toBeCloseTo(1.15); // partway
  });

  it('matches the Y stretch mapping (0 → 1, ≥ width/2 → 0.8)', () => {
    const halfWidth = 30;
    expect(remapClamped(0, 0, halfWidth, 1, 0.8)).toBe(1);
    expect(remapClamped(halfWidth, 0, halfWidth, 1, 0.8)).toBeCloseTo(0.8);
    expect(remapClamped(halfWidth * 2, 0, halfWidth, 1, 0.8)).toBeCloseTo(0.8); // clamped
    expect(remapClamped(halfWidth / 2, 0, halfWidth, 1, 0.8)).toBeCloseTo(0.9); // partway
  });
});

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
