import { describe, expect, it } from 'vitest';
import {
  OPEN_GATE,
  STEP_PX,
  circleLoop,
  clampStop,
  draftProgress,
  easeToward,
  gateWheel,
  lineLayout,
  wobbleLine,
  type WheelGate,
} from './experienceLine';

/** Feeds a run of wheel events `gapMs` apart, starting at `start`; returns the steps taken. */
function feed(gate: WheelGate, deltas: number[], start: number, gapMs: number) {
  let g = gate;
  const steps: number[] = [];
  deltas.forEach((d, i) => {
    const r = gateWheel(g, d, start + i * gapMs);
    g = r.gate;
    if (r.step) steps.push(r.step);
  });
  return { gate: g, steps };
}

describe('lineLayout', () => {
  it('spaces the stations evenly, oldest at the top', () => {
    const { stations } = lineLayout(1440, 900, 4);
    expect(stations).toHaveLength(4);
    const gaps = stations.slice(1).map((y, i) => y - stations[i]);
    gaps.forEach((g) => expect(g).toBeCloseTo(gaps[0]));
    expect(gaps[0]).toBeGreaterThan(0);
  });

  it('keeps every station between the top of the line and the "now" terminus', () => {
    const l = lineLayout(1440, 900, 4);
    expect(l.stations[0]).toBeGreaterThan(l.top);
    expect(l.stations[3]).toBeLessThan(l.bottom);
  });

  it('puts the line in the middle of the left half', () => {
    expect(lineLayout(1440, 900, 4).x).toBe(360);
  });

  it('keeps a usable line on a short window', () => {
    const l = lineLayout(1200, 300, 4);
    expect(l.bottom - l.top).toBeGreaterThanOrEqual(240);
  });
});

describe('gateWheel', () => {
  it('steps once for one long trackpad gesture, momentum tail included', () => {
    // 60 events, 16ms apart, slowly decaying: far more than one STEP_PX of travel.
    const deltas = Array.from({ length: 60 }, (_, i) => Math.max(2, 40 - i * 0.6));
    expect(feed(OPEN_GATE, deltas, 0, 16).steps).toEqual([1]);
  });

  it('steps again for a second gesture once the wheel has gone quiet', () => {
    const first = feed(OPEN_GATE, [30, 30, 30], 0, 16);
    const second = feed(first.gate, [30, 30, 30], 1000, 16);
    expect([...first.steps, ...second.steps]).toEqual([1, 1]);
  });

  it('holds the lock for a quick second flick', () => {
    const first = feed(OPEN_GATE, [80], 0, 16);
    // Quiet for 200ms, but still inside the minimum lock.
    const second = feed(first.gate, [80], 200, 16);
    expect([...first.steps, ...second.steps]).toEqual([1]);
  });

  it('steps back for upward travel', () => {
    expect(feed(OPEN_GATE, [-STEP_PX], 0, 16).steps).toEqual([-1]);
  });

  it('ignores travel short of a step, and forgets it after a pause', () => {
    const nudge = feed(OPEN_GATE, [STEP_PX - 10], 0, 16);
    expect(nudge.steps).toEqual([]);
    expect(feed(nudge.gate, [20], 1000, 16).steps).toEqual([]);
  });
});

describe('clampStop', () => {
  it('keeps the index on the line', () => {
    expect(clampStop(-1, 4)).toBe(0);
    expect(clampStop(2, 4)).toBe(2);
    expect(clampStop(9, 4)).toBe(3);
  });
});

describe('easeToward', () => {
  it('moves part of the way, then lands exactly', () => {
    const mid = easeToward(0, 100, 16, 260);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(easeToward(99.8, 100, 16, 260)).toBe(100);
  });

  it('jumps when there is no easing (reduced motion)', () => {
    expect(easeToward(0, 100, 16, 0)).toBe(100);
  });
});

describe('draftProgress', () => {
  it('runs 0 to 1 over the draft and stays clamped', () => {
    expect(draftProgress(-50, 1000)).toBe(0);
    expect(draftProgress(500, 1000)).toBeCloseTo(0.5);
    expect(draftProgress(2000, 1000)).toBe(1);
  });
});

describe('wobbleLine', () => {
  const line = [[100, 0], [100, 200]] as const;

  it('is the same line for the same seed', () => {
    expect(wobbleLine(line, 7, 2.2, 0.8)).toEqual(wobbleLine(line, 7, 2.2, 0.8));
  });

  it('re-rolls with a new seed', () => {
    expect(wobbleLine(line, 7, 2.2, 0.8)).not.toEqual(wobbleLine(line, 8, 2.2, 0.8));
  });

  it('stays within the wobble of the straight line', () => {
    wobbleLine(line, 3, 2.2, 0.8).forEach(([x, y]) => {
      expect(Math.abs(x - 100)).toBeLessThanOrEqual(1.5 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(200);
    });
  });

  it('samples along the whole length', () => {
    const pts = wobbleLine(line, 3, 0, 0);
    expect(pts[0]).toEqual([100, 0]);
    expect(pts[pts.length - 1]).toEqual([100, 200]);
    expect(pts.length).toBe(41);
  });
});

describe('circleLoop', () => {
  it('puts every point on the circle', () => {
    circleLoop(10, 20, 7).forEach(([x, y]) => expect(Math.hypot(x - 10, y - 20)).toBeCloseTo(7));
  });
});
