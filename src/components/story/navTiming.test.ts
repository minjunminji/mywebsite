import { describe, expect, it } from 'vitest';
import { NAV_ASSEMBLY_MS, NAV_DRAW_MS, NAV_GLIDE_MS, fillWindowT } from './navTiming';

describe('nav timing', () => {
  it('assembly is the glide followed by the line draw', () => {
    expect(NAV_ASSEMBLY_MS).toBe(NAV_GLIDE_MS + NAV_DRAW_MS);
  });
});

describe('fillWindowT', () => {
  it('is linear over the whole window with no holds', () => {
    expect(fillWindowT(0, 1000, 0, 0)).toBe(0);
    expect(fillWindowT(500, 1000, 0, 0)).toBe(0.5);
    expect(fillWindowT(1000, 1000, 0, 0)).toBe(1);
  });

  it('holds at 0 through the start hold, then sweeps the remainder', () => {
    expect(fillWindowT(0, 2000, 900, 0)).toBe(0);
    expect(fillWindowT(900, 2000, 900, 0)).toBe(0);
    expect(fillWindowT(1450, 2000, 900, 0)).toBe(0.5);
    expect(fillWindowT(2000, 2000, 900, 0)).toBe(1);
  });

  it('reaches 1 early by the end hold', () => {
    expect(fillWindowT(550, 2000, 0, 900)).toBe(0.5);
    expect(fillWindowT(1100, 2000, 0, 900)).toBe(1);
    expect(fillWindowT(1900, 2000, 0, 900)).toBe(1);
  });

  it('clamps outside the window', () => {
    expect(fillWindowT(-50, 1000, 0, 0)).toBe(0);
    expect(fillWindowT(5000, 1000, 0, 0)).toBe(1);
  });

  it('never divides by zero when the holds swallow the window', () => {
    expect(fillWindowT(0, 500, 900, 0)).toBe(0);
    expect(fillWindowT(500, 500, 900, 0)).toBe(0);
    expect(fillWindowT(901, 500, 900, 0)).toBe(1);
  });
});
