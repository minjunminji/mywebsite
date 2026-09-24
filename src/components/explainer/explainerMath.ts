// src/components/explainer/explainerMath.ts
/**
 * Pure math behind the explainer's 2D figures. Mirrors the GLSL in
 * reveal/shaders.ts so the canvas figures show what the GPU does.
 */
import { PATH_SUBDIV, type Brush } from '../reveal/brush';

export function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

/** GLSL smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Distance from p to segment ab, and the clamped projection parameter t. */
export function distToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): { d: number; t: number } {
  const sx = bx - ax;
  const sy = by - ay;
  const lenSq = Math.max(sx * sx + sy * sy, 1e-10);
  const t = clamp01(((px - ax) * sx + (py - ay) * sy) / lenSq);
  return { d: Math.hypot(px - (ax + sx * t), py - (ay + sy * t)), t };
}

/** The brush footprint: 1 inside 10% of r, easing to 0 at r. */
export function strokeFalloff(d: number, r: number): number {
  return 1 - smoothstep(r * 0.1, r, d);
}

/** Store a 0..1 value in an 8-bit UNORM channel (RGBA8). */
export function quantizeUnorm8(v: number): number {
  return Math.round(clamp01(v) * 255) / 255;
}

/** Round to the nearest IEEE half-float (R16F) — 10-bit mantissa. */
export function toHalf(v: number): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  const a = Math.abs(v);
  const e = Math.max(Math.floor(Math.log2(a)), -14);
  const step = 2 ** (e - 10);
  return Math.sign(v) * Math.round(a / step) * step;
}

export type Precision = 'ideal' | 'rgba8' | 'r16f';

const store: Record<Precision, (v: number) => number> = {
  ideal: (v) => v,
  rgba8: quantizeUnorm8,
  r16f: toHalf,
};

/**
 * A fully revealed pixel decaying at `hz` for `seconds`, stored at the given
 * precision each frame exactly like the mask pass: v -= clamp(dt/T, 0, 0.1).
 * Returns one value per frame, starting with 1.
 */
export function simulateDecay(hz: number, duration: number, precision: Precision, seconds: number): number[] {
  const dt = 1 / hz;
  const step = Math.min(Math.max(dt / duration, 0), 0.1);
  const frames = Math.ceil(seconds * hz);
  const out = [1];
  let v = 1;
  for (let i = 0; i < frames; i++) {
    v = store[precision](clamp01(v - step));
    out.push(v);
  }
  return out;
}

/** Seconds until the pixel reaches 0, or null if it gets stuck (within maxSeconds). */
export function fadeTime(hz: number, duration: number, precision: Precision, maxSeconds = 10): number | null {
  const v = simulateDecay(hz, duration, precision, maxSeconds);
  const i = v.findIndex((x) => x <= 0);
  return i < 0 ? null : i / hz;
}

export type CpuMask = { w: number; h: number; data: Float32Array };

export function createCpuMask(w: number, h: number): CpuMask {
  return { w, h, data: new Float32Array(w * h) };
}

export type CpuMaskParams = { dt: number; duration: number; strength: number; aspect: number };

/**
 * One frame of the blob mask pass on the CPU (row 0 = top). Same math as
 * BLOB_FS: decay, max-in the stroke footprint, dwell build-up.
 */
export function stepCpuMask(mask: CpuMask, brush: Brush, painting: boolean, p: CpuMaskParams): void {
  const { w, h, data } = mask;
  const decay = Math.min(Math.max(p.dt / p.duration, 0), 0.1);
  const dwell = 1 - brush.speedT;
  const path = brush.path;
  const radii = brush.radii;
  for (let j = 0; j < h; j++) {
    const vy = 1 - (j + 0.5) / h;
    const uy = (vy - 0.5) * 2;
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let prev = clamp01(data[k] - decay);
      if (painting) {
        const ux = (((i + 0.5) / w) - 0.5) * 2 * p.aspect;
        let f = 0;
        for (let s = 0; s < PATH_SUBDIV; s++) {
          const { d, t } = distToSegment(
            ux, uy,
            path[s * 2] * p.aspect, path[s * 2 + 1],
            path[s * 2 + 2] * p.aspect, path[s * 2 + 3],
          );
          const r = radii[s] + (radii[s + 1] - radii[s]) * t;
          f = Math.max(f, strokeFalloff(d, r));
        }
        prev = Math.max(prev, f);
        prev = clamp01(prev + f * p.strength * p.dt * 60 * dwell);
      }
      data[k] = prev;
    }
  }
}
