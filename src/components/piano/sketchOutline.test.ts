import { describe, expect, it } from 'vitest';
import { clipPathFor, outlineSdf, traceLoop, wobbleLoop, type OutlineLayout, type Pt } from './sketchOutline';

const R = 12;
const BOUNDS = { left: -10, top: -10, width: 420, height: 285 };
const EXPANDED: OutlineLayout = {
  tabRight: 95.5,
  tabHeight: 40,
  frame: { left: 0, top: 40, width: 400, height: 225 },
  collapse: 0,
  radius: R,
};
const COLLAPSED: OutlineLayout = {
  tabRight: 95.5,
  tabHeight: 40,
  frame: { left: 94.5, top: 0, width: 400 * (40 / 225), height: 40 },
  collapse: 1,
  radius: R,
};

const extent = (loop: Pt[]) => ({
  minX: Math.min(...loop.map((p) => p[0])),
  maxX: Math.max(...loop.map((p) => p[0])),
  minY: Math.min(...loop.map((p) => p[1])),
  maxY: Math.max(...loop.map((p) => p[1])),
});

describe('outlineSdf', () => {
  it('is inside the tab, the video, and the fillet, and outside beside the tab', () => {
    expect(outlineSdf(40, 20, EXPANDED)).toBeLessThan(0);
    expect(outlineSdf(200, 150, EXPANDED)).toBeLessThan(0);
    // Just past the tab's wall, just above the video: the fillet's foot.
    expect(outlineSdf(96.5, 39, EXPANDED)).toBeLessThan(0);
    // Well right of the tab, above the video.
    expect(outlineSdf(250, 20, EXPANDED)).toBeGreaterThan(0);
  });

  it('squares off the join when the hint pulls the wall to the video edge', () => {
    const hint = { ...EXPANDED, tabRight: 400 };
    // The wall's foot and the video's top-right corner meet with no notch.
    expect(outlineSdf(399, 44, hint)).toBeLessThan(0);
    // No fillet bulging past the window's right edge.
    expect(outlineSdf(403, 36, hint)).toBeGreaterThan(0);
  });
});

describe('traceLoop', () => {
  it('traces the expanded window as one loop around both tab and video', () => {
    const loop = traceLoop((x, y) => outlineSdf(x, y, EXPANDED), BOUNDS);
    const e = extent(loop);
    expect(e.minX).toBeCloseTo(0, 0);
    expect(e.maxX).toBeCloseTo(400, 0);
    expect(e.minY).toBeCloseTo(0, 0); // the tab's top is part of the same loop
    expect(e.maxY).toBeCloseTo(265, 0);
  });

  it('traces the collapsed bar as one loop around tab and thumbnail', () => {
    const loop = traceLoop((x, y) => outlineSdf(x, y, COLLAPSED), BOUNDS);
    const e = extent(loop);
    expect(e.minX).toBeCloseTo(0, 0);
    expect(e.maxX).toBeCloseTo(94.5 + 400 * (40 / 225), 0);
    expect(e.maxY).toBeCloseTo(40, 0);
  });

  it('keeps every traced point on the outline', () => {
    const loop = traceLoop((x, y) => outlineSdf(x, y, EXPANDED), BOUNDS);
    for (const [x, y] of loop) expect(Math.abs(outlineSdf(x, y, EXPANDED))).toBeLessThan(1);
  });
});

describe('wobbleLoop', () => {
  const loop = traceLoop((x, y) => outlineSdf(x, y, EXPANDED), BOUNDS);

  it('moves points by no more than half the combined amplitude', () => {
    const out = wobbleLoop(loop, 3, 4, 1.4);
    out.forEach(([x, y], k) => {
      expect(Math.hypot(x - loop[k][0], y - loop[k][1])).toBeLessThanOrEqual(2.7 + 1e-6);
    });
  });

  it('is the same line for the same seed and a different one for the next', () => {
    expect(wobbleLoop(loop, 5, 4, 1.4)).toEqual(wobbleLoop(loop, 5, 4, 1.4));
    expect(wobbleLoop(loop, 6, 4, 1.4)).not.toEqual(wobbleLoop(loop, 5, 4, 1.4));
  });
});

describe('clipPathFor', () => {
  it('writes a closed path relative to the element origin', () => {
    expect(clipPathFor([[10, 50], [20, 60], [10, 70]], { x: 0, y: 40 })).toBe('path("M10.0 10.0L20.0 20.0L10.0 30.0Z")');
  });
});
