// src/components/reveal/brush.test.ts
import { describe, expect, it } from 'vitest';
import {
  CATCH_UP_EPS,
  FAST_RADIUS_SCALE,
  FAST_SPEED,
  PATH_SUBDIV,
  POINTER_FOLLOW,
  RADIUS_FOLLOW,
  SLOW_SPEED,
  createBrush,
  followFactor,
  sampleHermite,
  speedToT,
  stepBrush,
  targetRadius,
} from './brush';

type Frame = {
  pointerX: number;
  pointerY: number;
  pointerActive: boolean;
  newStroke: boolean;
  dt: number;
  aspect: number;
};

// Verbatim port of RevealFluid.tsx's inline brush logic as of 642caa7.
// Do not "fix" or tidy this — it is the behavior we are pinning.
function reference(pointerRadius: number) {
  let paintX = 10;
  let paintY = 10;
  let lastPaintX = 10;
  let lastPaintY = 10;
  let hasPaint = false;
  let brushRadius = pointerRadius;
  let lastBrushRadius = pointerRadius;
  let velX = 0;
  let velY = 0;
  const pathPoints = new Float32Array((PATH_SUBDIV + 1) * 2);
  const pathRadii = new Float32Array(PATH_SUBDIV + 1);

  return (f: Frame) => {
    const { pointerX, pointerY, pointerActive, dt, aspect } = f;
    if (f.newStroke) hasPaint = false;
    const painting = pointerActive || hasPaint;
    let speedT = 0;
    if (painting) {
      if (!hasPaint) {
        paintX = lastPaintX = pointerX;
        paintY = lastPaintY = pointerY;
        brushRadius = lastBrushRadius = pointerRadius;
        velX = velY = 0;
        hasPaint = true;
      } else {
        lastBrushRadius = brushRadius;
        lastPaintX = paintX;
        lastPaintY = paintY;
        const k = 1 - Math.exp(-dt * POINTER_FOLLOW);
        paintX += (pointerX - paintX) * k;
        paintY += (pointerY - paintY) * k;
      }
      const speed =
        Math.hypot((paintX - lastPaintX) * aspect, paintY - lastPaintY) / Math.max(dt, 1e-3);
      const t = Math.min(Math.max((speed - SLOW_SPEED) / (FAST_SPEED - SLOW_SPEED), 0), 1);
      speedT = t * t * (3 - 2 * t);
      const tr = pointerRadius * (1 - (1 - FAST_RADIUS_SCALE) * speedT);
      brushRadius += (tr - brushRadius) * (1 - Math.exp(-dt * RADIUS_FOLLOW));
      const startTX = velX * dt;
      const startTY = velY * dt;
      velX = (pointerX - paintX) * POINTER_FOLLOW;
      velY = (pointerY - paintY) * POINTER_FOLLOW;
      const endTX = velX * dt;
      const endTY = velY * dt;
      for (let i = 0; i <= PATH_SUBDIV; i++) {
        const u = i / PATH_SUBDIV;
        const u2 = u * u;
        const u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1;
        const h10 = u3 - 2 * u2 + u;
        const h01 = -2 * u3 + 3 * u2;
        const h11 = u3 - u2;
        pathPoints[i * 2] = h00 * lastPaintX + h10 * startTX + h01 * paintX + h11 * endTX;
        pathPoints[i * 2 + 1] = h00 * lastPaintY + h10 * startTY + h01 * paintY + h11 * endTY;
        pathRadii[i] = lastBrushRadius + (brushRadius - lastBrushRadius) * u;
      }
      if (
        !pointerActive &&
        Math.hypot((pointerX - paintX) * aspect, pointerY - paintY) < CATCH_UP_EPS
      ) {
        hasPaint = false;
      }
    } else {
      hasPaint = false;
    }
    return { painting, speedT, path: Float32Array.from(pathPoints), radii: Float32Array.from(pathRadii) };
  };
}

// Deterministic PRNG so the script is stable across runs.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 600 frames: mixed refresh rates, pointer jumps, two leave/return cycles.
function script(): Frame[] {
  const rand = mulberry32(7);
  const dts = [1 / 240, 1 / 144, 1 / 60, 1 / 30, 0.05];
  const frames: Frame[] = [];
  let active = false;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 600; i++) {
    const wantActive = !((i >= 200 && i < 260) || (i >= 420 && i < 430));
    const newStroke = wantActive && !active;
    active = wantActive;
    if (active) {
      x = Math.sin(i * 0.05) * 0.8 + (rand() < 0.03 ? rand() - 0.5 : 0);
      y = Math.cos(i * 0.031) * 0.6;
    }
    frames.push({
      pointerX: x,
      pointerY: y,
      pointerActive: active,
      newStroke,
      dt: dts[Math.floor(rand() * dts.length)],
      aspect: 16 / 9,
    });
  }
  return frames;
}

describe('stepBrush', () => {
  it('matches the original inline RevealFluid brush frame-for-frame', () => {
    const ref = reference(0.15);
    const brush = createBrush(0.15);
    for (const f of script()) {
      const expected = ref(f);
      const painting = stepBrush(brush, { ...f, baseRadius: 0.15 });
      expect(painting).toBe(expected.painting);
      expect(brush.speedT).toBe(expected.speedT);
      if (painting) {
        expect(Array.from(brush.path)).toEqual(Array.from(expected.path));
        expect(Array.from(brush.radii)).toEqual(Array.from(expected.radii));
      }
    }
  });

  it('starts a fresh stroke on the cursor with a zero-length path', () => {
    const brush = createBrush(0.15);
    stepBrush(brush, {
      pointerX: 0.3, pointerY: -0.2, pointerActive: true, newStroke: true,
      dt: 1 / 60, aspect: 1, baseRadius: 0.15,
    });
    for (let i = 0; i <= PATH_SUBDIV; i++) {
      expect(brush.path[i * 2]).toBeCloseTo(0.3, 6);
      expect(brush.path[i * 2 + 1]).toBeCloseTo(-0.2, 6);
    }
  });

  it('keeps painting after release until it catches up, then stops', () => {
    const brush = createBrush(0.15);
    const base = { pointerY: 0, dt: 1 / 60, aspect: 1, baseRadius: 0.15 };
    stepBrush(brush, { ...base, pointerX: 0, pointerActive: true, newStroke: true });
    stepBrush(brush, { ...base, pointerX: 0.8, pointerActive: true, newStroke: false });
    let frames = 0;
    while (stepBrush(brush, { ...base, pointerX: 0.8, pointerActive: false, newStroke: false })) {
      frames++;
      expect(frames).toBeLessThan(200);
    }
    expect(frames).toBeGreaterThan(1);
    expect(Math.abs(brush.x - 0.8)).toBeLessThan(CATCH_UP_EPS);
  });

  it('stale tangents only differ from the fix when frame times change', () => {
    const run = (stale: boolean, dts: number[]) => {
      const brush = createBrush(0.15);
      const out: number[] = [];
      dts.forEach((dt, i) => {
        stepBrush(brush, {
          pointerX: Math.sin(i), pointerY: Math.cos(i), pointerActive: true,
          newStroke: i === 0, dt, aspect: 1, baseRadius: 0.15, staleTangents: stale,
        });
        out.push(...brush.path);
      });
      return out;
    };
    const even = Array(20).fill(1 / 60);
    expect(run(true, even)).toEqual(run(false, even));
    const uneven = even.map((dt, i) => (i % 2 ? 0.05 : 1 / 240));
    expect(run(true, uneven)).not.toEqual(run(false, uneven));
  });
});

describe('followFactor', () => {
  it('is frame-rate independent: two half steps equal one full step', () => {
    const half = followFactor(1 / 120, POINTER_FOLLOW);
    const full = followFactor(1 / 60, POINTER_FOLLOW);
    expect(1 - (1 - half) ** 2).toBeCloseTo(full, 12);
  });
});

describe('speedToT / targetRadius', () => {
  it('is 0 below SLOW_SPEED, 1 above FAST_SPEED, 0.5 halfway', () => {
    expect(speedToT(0)).toBe(0);
    expect(speedToT(SLOW_SPEED)).toBe(0);
    expect(speedToT(FAST_SPEED)).toBe(1);
    expect(speedToT(100)).toBe(1);
    expect(speedToT((SLOW_SPEED + FAST_SPEED) / 2)).toBeCloseTo(0.5, 12);
  });

  it('shrinks the radius to FAST_RADIUS_SCALE at full speed', () => {
    expect(targetRadius(0.2, 0)).toBeCloseTo(0.2, 12);
    expect(targetRadius(0.2, 1)).toBeCloseTo(0.2 * FAST_RADIUS_SCALE, 12);
  });
});

describe('sampleHermite', () => {
  it('hits both endpoints exactly', () => {
    const out = new Float32Array((PATH_SUBDIV + 1) * 2);
    sampleHermite(out, 0, 0, 5, 5, 1, 1, -5, 5);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[PATH_SUBDIV * 2]).toBeCloseTo(1, 6);
    expect(out[PATH_SUBDIV * 2 + 1]).toBeCloseTo(1, 6);
  });

  it('is a straight line when both tangents equal the chord', () => {
    const out = new Float32Array((PATH_SUBDIV + 1) * 2);
    sampleHermite(out, 0, 0, 2, 4, 2, 4, 2, 4);
    const mid = PATH_SUBDIV / 2;
    expect(out[mid * 2]).toBeCloseTo(1, 6);
    expect(out[mid * 2 + 1]).toBeCloseTo(2, 6);
  });
});
