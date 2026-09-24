# Shader Explainer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A full-screen, editorial "how the ink reveal works" takeover — opened from a bold inline link in the "this website" project — that explains the about-page WebGL2 reveal shader in six chapters with live, interactive figures.

**Architecture:** First extract the reveal's brush math (`brush.ts`), GLSL (`shaders.ts`) and GL pipeline (`revealRenderer.ts`) out of `RevealFluid.tsx` with no behavior change, so the live site and the explainer run the *same* code. The explainer is a lazily-loaded `next/dynamic` takeover modeled on `TldrOverlay`. Three figures run the real shader via the shared renderer (with debug uniforms); the rest are 2D canvas / SVG figures driven by the same pure functions (plus a CPU port of the mask pass).

**Tech Stack:** Next.js 15 (app dir), React 19, TypeScript, WebGL2 / GLSL ES 3.0, Canvas 2D, SVG, vitest, `next/font/google` (Neuton).

**Design doc:** `docs/plans/2026-09-24-shader-explainer-design.md`

---

## Ground rules for the implementer

- **Package manager is pnpm.** Commands: `pnpm test`, `pnpm lint`, `pnpm build`.
- **Tests** are vitest, colocated as `*.test.ts`, importing with relative paths (see `src/components/cursorMath.test.ts`). There is no vitest config; tests run in node, so no DOM/WebGL in tests — only pure functions.
- **Path alias:** `@/*` → `src/*`.
- **Styling convention:** inline `style={{…}}` objects; global classes only in `app/globals.css` for pseudo-classes (`:hover`, `:focus-visible`, range thumbs). Match that.
- **Voice:** all user-facing copy lowercase.
- **Desktop only:** `app/globals.css` replaces the whole site with a notice below 1024px wide (`.desktop-gate`). No phone layout work — the column just needs to fit ≥1024px.
- **Custom cursor:** `CustomCursor.tsx` wraps any `a, button, [role="button"]` in a blob. Text buttons are fine. Nothing else needed.
- **Visual verification is done by Ryan in the browser.** Don't drive a browser. At each **CHECKPOINT** stop, summarize, and hand over the checklist.
- **Commit messages** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

## Phase A — Extract the reveal (no behavior change)

### Task 1: `brush.ts` — the brush as pure functions, pinned by a characterization test

**Files:**
- Create: `src/components/reveal/brush.ts`
- Create: `src/components/reveal/brush.test.ts`

**Step 1: Write the failing test**

The key test is a *characterization* test: `reference()` below is a verbatim copy of the brush logic currently inline in `RevealFluid.tsx` (`frame()`, lines ~496–572). `stepBrush` must reproduce it bit-for-bit over a long, messy scripted input (uneven dt, leaves, returns).

```ts
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
```

**Step 2: Run to verify it fails**

Run: `pnpm test src/components/reveal/brush.test.ts`
Expected: FAIL — `Failed to resolve import "./brush"`.

**Step 3: Implement**

```ts
// src/components/reveal/brush.ts
/**
 * The reveal brush: a point that chases the pointer with exponential lag and
 * paints each frame's movement as a cubic Hermite curve. Pure and
 * allocation-free per step, so RevealFluid and the shader explainer's figures
 * run exactly the same brush. Coordinates are clip space (-1..1, y up);
 * speeds are aspect-corrected.
 */

/** Sub-segments each frame's brush path is sampled into. */
export const PATH_SUBDIV = 12;
/** Brush follow rate (1/s): higher = tighter to the cursor, lower = more lag. */
export const POINTER_FOLLOW = 25;
/** Brush shrinks toward this fraction of its base radius at high speed. */
export const FAST_RADIUS_SCALE = 0.7;
/** Speed band (aspect-corrected UV units per second) the shrink eases across. */
export const SLOW_SPEED = 0.5;
export const FAST_SPEED = 5.0;
/** How fast (1/s) the radius eases toward its speed-based target. */
export const RADIUS_FOLLOW = 8;
/** After release, the stroke ends once the brush is this close to the pointer. */
export const CATCH_UP_EPS = 0.002;

/** Fraction of the remaining gap an exponential follow covers in `dt` seconds. */
export function followFactor(dt: number, rate: number): number {
  return 1 - Math.exp(-dt * rate);
}

/** 0 when resting/slow, 1 when fast, smoothstepped in between. */
export function speedToT(speed: number): number {
  const t = Math.min(Math.max((speed - SLOW_SPEED) / (FAST_SPEED - SLOW_SPEED), 0), 1);
  return t * t * (3 - 2 * t);
}

export function targetRadius(baseRadius: number, speedT: number): number {
  return baseRadius * (1 - (1 - FAST_RADIUS_SCALE) * speedT);
}

/**
 * Cubic Hermite from p0 (tangent m0) to p1 (tangent m1), sampled at
 * PATH_SUBDIV + 1 evenly spaced u into `out` as interleaved x,y.
 */
export function sampleHermite(
  out: Float32Array,
  p0x: number, p0y: number, m0x: number, m0y: number,
  p1x: number, p1y: number, m1x: number, m1y: number,
): void {
  for (let i = 0; i <= PATH_SUBDIV; i++) {
    const u = i / PATH_SUBDIV;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    out[i * 2] = h00 * p0x + h10 * m0x + h01 * p1x + h11 * m1x;
    out[i * 2 + 1] = h00 * p0y + h10 * m0y + h01 * p1y + h11 * m1y;
  }
}

export type Brush = {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  /** A stroke is in progress (pointer down, or catching up after release). */
  stroking: boolean;
  radius: number;
  lastRadius: number;
  /** Brush velocity at the end of the last frame (UV units per second). */
  velX: number;
  velY: number;
  /** Last frame's end tangent — only used by the `staleTangents` demo. */
  endTX: number;
  endTY: number;
  /** Aspect-corrected speed this frame, and its smoothstepped 0..1 form. */
  speed: number;
  speedT: number;
  /** This frame's path: PATH_SUBDIV + 1 points (x,y) and radii. */
  path: Float32Array;
  radii: Float32Array;
};

export function createBrush(baseRadius: number): Brush {
  return {
    x: 10, y: 10, lastX: 10, lastY: 10,
    stroking: false,
    radius: baseRadius, lastRadius: baseRadius,
    velX: 0, velY: 0, endTX: 0, endTY: 0,
    speed: 0, speedT: 0,
    path: new Float32Array((PATH_SUBDIV + 1) * 2),
    radii: new Float32Array(PATH_SUBDIV + 1),
  };
}

export type BrushStepInput = {
  pointerX: number;
  pointerY: number;
  /** Mouse over the page / finger down. */
  pointerActive: boolean;
  /** Pointer just came back after a release: start on the cursor. */
  newStroke: boolean;
  dt: number;
  aspect: number;
  baseRadius: number;
  /** Follow rate override (explainer figures). Defaults to POINTER_FOLLOW. */
  follow?: number;
  /**
   * Demo of the pre-642caa7 bug: start each curve with the previous frame's
   * end tangent (scaled by the *previous* dt) instead of velocity × this dt.
   */
  staleTangents?: boolean;
};

/** Advance the brush one frame. Returns whether it painted this frame. */
export function stepBrush(b: Brush, input: BrushStepInput): boolean {
  const { pointerX, pointerY, pointerActive, dt, aspect, baseRadius } = input;
  const follow = input.follow ?? POINTER_FOLLOW;

  if (input.newStroke) b.stroking = false;
  b.speed = 0;
  b.speedT = 0;

  // After release the brush keeps painting until it catches up with the
  // last pointer position, so the end of the stroke isn't cut short.
  const painting = pointerActive || b.stroking;
  if (!painting) {
    b.stroking = false;
    return false;
  }

  if (!b.stroking) {
    // Fresh stroke: start on the cursor rather than sweeping in.
    b.x = b.lastX = pointerX;
    b.y = b.lastY = pointerY;
    b.radius = b.lastRadius = baseRadius;
    b.velX = b.velY = 0;
    b.endTX = b.endTY = 0;
    b.stroking = true;
  } else {
    b.lastRadius = b.radius;
    b.lastX = b.x;
    b.lastY = b.y;
    const k = followFactor(dt, follow);
    b.x += (pointerX - b.x) * k;
    b.y += (pointerY - b.y) * k;
  }

  b.speed = Math.hypot((b.x - b.lastX) * aspect, b.y - b.lastY) / Math.max(dt, 1e-3);
  b.speedT = speedToT(b.speed);
  b.radius += (targetRadius(baseRadius, b.speedT) - b.radius) * followFactor(dt, RADIUS_FOLLOW);

  // Tangents are the brush velocity at each end times this frame's dt: C1
  // joins with no lookahead, and a long frame followed by a short one can't
  // produce an oversized tangent that loops.
  const startTX = input.staleTangents ? b.endTX : b.velX * dt;
  const startTY = input.staleTangents ? b.endTY : b.velY * dt;
  b.velX = (pointerX - b.x) * follow;
  b.velY = (pointerY - b.y) * follow;
  b.endTX = b.velX * dt;
  b.endTY = b.velY * dt;

  sampleHermite(b.path, b.lastX, b.lastY, startTX, startTY, b.x, b.y, b.endTX, b.endTY);
  for (let i = 0; i <= PATH_SUBDIV; i++) {
    b.radii[i] = b.lastRadius + (b.radius - b.lastRadius) * (i / PATH_SUBDIV);
  }

  if (!pointerActive && Math.hypot((pointerX - b.x) * aspect, pointerY - b.y) < CATCH_UP_EPS) {
    b.stroking = false;
  }
  return true;
}
```

**Step 4: Run to verify it passes**

Run: `pnpm test src/components/reveal/brush.test.ts`
Expected: PASS (all tests). If the characterization test fails, the bug is in `stepBrush` — **never** edit `reference()` to match.

**Step 5: Commit**

```bash
git add src/components/reveal/brush.ts src/components/reveal/brush.test.ts
git commit -m "Extract reveal brush math into pure brush.ts with characterization test"
```

---

### Task 2: `shaders.ts` — GLSL out of RevealFluid, plus debug uniforms and excerpt markers

**Files:**
- Create: `src/components/reveal/shaders.ts`
- Create: `src/components/reveal/shaders.test.ts`

The display shader gains uniforms that replace its constants: `u_view`, `u_octaves`, `u_threshold`, `u_noiseAmp`, `u_edgeSoftness`, `u_accent`. With `DEFAULT_EDGE` and `u_view = 0` the output is identical to today (the generalized fbm normalizer `Σ 0.5^i` over 4 octaves is exactly `0.9375`). Shader sections are wrapped in `// #region name` / `// #endregion` so the explainer can quote the *real* source.

**Step 1: Write the failing test**

```ts
// src/components/reveal/shaders.test.ts
import { describe, expect, it } from 'vitest';
import { BLOB_FS, DEFAULT_EDGE, DISPLAY_FS, GLSL_REGIONS, glslExcerpt } from './shaders';

describe('glslExcerpt', () => {
  it('returns the dedented body of a region without marker lines', () => {
    const src = 'a\n  // #region x\n    foo();\n      bar();\n  // #endregion\nb';
    expect(glslExcerpt(src, 'x')).toBe('foo();\n  bar();');
  });

  it('throws on a missing region', () => {
    expect(() => glslExcerpt('nothing here', 'x')).toThrow(/x/);
  });

  it('finds every region the explainer quotes', () => {
    for (const [shader, name] of GLSL_REGIONS) {
      const src = shader === 'blob' ? BLOB_FS : DISPLAY_FS;
      const body = glslExcerpt(src, name);
      expect(body.length).toBeGreaterThan(0);
      expect(body).not.toMatch(/#region|#endregion/);
    }
  });
});

describe('DEFAULT_EDGE', () => {
  it('keeps an empty mask hidden (threshold - amp/2 > 0)', () => {
    expect(DEFAULT_EDGE.threshold - DEFAULT_EDGE.noiseAmp / 2).toBeGreaterThan(0);
  });

  it('matches the pre-extraction constants', () => {
    expect(DEFAULT_EDGE).toEqual({ threshold: 0.15, noiseAmp: 0.14, octaves: 4, softness: 1.5 });
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm test src/components/reveal/shaders.test.ts`
Expected: FAIL — cannot resolve `./shaders`.

**Step 3: Implement**

```ts
// src/components/reveal/shaders.ts
import { PATH_SUBDIV } from './brush';

/** Display-shader edge parameters. The live site always uses DEFAULT_EDGE. */
export type EdgeParams = {
  /** Mask value where the reveal edge sits. */
  threshold: number;
  /** How far the noise pushes that edge in/out. threshold - amp/2 must stay > 0. */
  noiseAmp: number;
  /** fbm octaves, 0..4 (0 = no noise). */
  octaves: number;
  /** Edge antialias width in multiples of a screen pixel's field change. */
  softness: number;
};

export const DEFAULT_EDGE: EdgeParams = { threshold: 0.15, noiseAmp: 0.14, octaves: 4, softness: 1.5 };

/** Display shader output: 0 = composite, 1 = raw mask, 2 = mask + noise field. */
export type RevealView = 0 | 1 | 2;

/** The explainer's accent (#c8412b) as linear-ish 0..1 RGB for u_accent. */
export const ACCENT_RGB: readonly [number, number, number] = [0.784, 0.255, 0.169];

export const QUAD_VS = `#version 300 es
  in vec2 a_position;
  out vec2 vUv;
  void main() {
    vUv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Blob mask shader (ping-pong feedback).
export const BLOB_FS = `#version 300 es
  #define PATH_SUBDIV ${PATH_SUBDIV}
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform sampler2D u_prev;
  // This frame's brush path: a curve sampled into PATH_SUBDIV segments,
  // with the brush radius at each sample.
  uniform vec2 u_path[PATH_SUBDIV + 1];
  uniform float u_pathRadius[PATH_SUBDIV + 1];
  uniform float u_pointerDown;
  uniform float u_strength;
  uniform float u_dTime;
  uniform float u_duration;
  uniform float u_aspect;
  uniform float u_dwell;

  void main() {
    // #region decay
    float prev = texture(u_prev, vUv).r;
    prev -= clamp(u_dTime / u_duration, 0.0, 0.1);
    prev = clamp(prev, 0.0, 1.0);
    // #endregion

    // Paint the stroke along this frame's curved brush path, so there
    // are no gaps when the cursor moves a long way between frames and no
    // corners where one frame's stroke meets the next.
    if (u_pointerDown > 0.5) {
      // #region stroke
      vec2 aspectScale = vec2(u_aspect, 1.0);
      vec2 uv = (vUv - 0.5) * 2.0 * aspectScale;
      float f = 0.0;
      for (int i = 0; i < PATH_SUBDIV; i++) {
        vec2 a = u_path[i] * aspectScale;
        vec2 b = u_path[i + 1] * aspectScale;
        vec2 segment = b - a;
        float segmentLenSq = max(dot(segment, segment), 1e-10);
        float t = clamp(dot(uv - a, segment) / segmentLenSq, 0.0, 1.0);
        float d = distance(uv, a + segment * t);
        float r = mix(u_pathRadius[i], u_pathRadius[i + 1], t);
        f = max(f, 1.0 - smoothstep(r * 0.1, r, d));
      }
      // One pass fully reveals the brush footprint. Max (not add) so the
      // overlapping caps between consecutive frame segments don't stack:
      // stacked joints outlive the segment middles and a fading fast
      // trail breaks apart into a row of dots.
      prev = max(prev, f);
      // #endregion
      // #region dwell
      // Extra build-up only while the cursor dwells (slow/resting), so
      // hovering still spreads the reveal outward. Strength is tuned per
      // 60Hz frame; scale by dt so it's refresh-rate independent.
      prev += f * u_strength * u_dTime * 60.0 * u_dwell;
      prev = clamp(prev, 0.0, 1.0);
      // #endregion
    }

    fragColor = vec4(prev, 0.0, 0.0, 1.0);
  }
`;

// Display shader (reveal reference through mask).
export const DISPLAY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform sampler2D u_mask;
  uniform sampler2D u_refImage;
  uniform float u_refLoaded;
  uniform float u_canvasAspect;
  uniform float u_refAspect;
  uniform float u_time;
  // Edge parameters (see EdgeParams) and explainer debug views.
  uniform float u_threshold;
  uniform float u_noiseAmp;
  uniform float u_edgeSoftness;
  uniform int u_octaves;
  uniform int u_view;
  uniform vec3 u_accent;

  const vec3 PAPER = vec3(0.969, 0.969, 0.961); // #f7f7f5
  const vec3 INK = vec3(0.122, 0.094, 0.071);   // #1f1812

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // #region fbm
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p, int octaves) {
    if (octaves <= 0) return 0.5;
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      sum += amp * valueNoise(p);
      norm += amp;
      p = p * 2.03 + vec2(17.1, 9.2);
      amp *= 0.5;
    }
    return sum / norm;
  }
  // #endregion

  void main() {
    float mask = texture(u_mask, vUv).r;

    // #region edge
    // Page-anchored noise (aspect-corrected so blotches aren't stretched)
    // wobbles the edge like ink bleeding into paper. It drifts slowly
    // rather than following the cursor.
    vec2 noiseUv = vUv * vec2(u_canvasAspect, 1.0) * 6.0;
    float n = fbm(noiseUv + vec2(u_time * 0.04, -u_time * 0.03), u_octaves);
    float field = mask + (n - 0.5) * u_noiseAmp;

    // Screen-space AA: a constant ~1.5px edge regardless of how steep the
    // field is at that point (fading blobs, overlapping strokes, etc).
    float fw = fwidth(field);
    float w = max(fw * u_edgeSoftness, 1e-4);
    float edge = smoothstep(u_threshold - w, u_threshold + w, field);
    // #endregion

    if (u_view == 1) {
      fragColor = vec4(mix(PAPER, u_accent, mask), 1.0);
      return;
    }
    if (u_view == 2) {
      float contour = 1.0 - smoothstep(0.0, 1.5 * fw + 1e-4, abs(field - u_threshold));
      vec3 c = mix(PAPER, INK, clamp(field, 0.0, 1.0) * 0.85);
      fragColor = vec4(mix(c, u_accent, contour), 1.0);
      return;
    }

    vec2 fitUv = vUv;
    if (u_canvasAspect > u_refAspect) {
      float fitWidth = u_refAspect / u_canvasAspect;
      float marginX = (1.0 - fitWidth) * 0.5;
      fitUv.x = (vUv.x - marginX) / fitWidth;
    } else {
      float fitHeight = u_canvasAspect / u_refAspect;
      float marginY = (1.0 - fitHeight) * 0.5;
      fitUv.y = (vUv.y - marginY) / fitHeight;
    }

    float inBounds =
      step(0.0, fitUv.x) *
      step(fitUv.x, 1.0) *
      step(0.0, fitUv.y) *
      step(fitUv.y, 1.0);

    float reveal = edge * inBounds * u_refLoaded;

    // Flip Y for image (WebGL UV origin is bottom-left, image is top-left)
    vec2 refUv = vec2(clamp(fitUv.x, 0.0, 1.0), 1.0 - clamp(fitUv.y, 0.0, 1.0));
    vec4 ref = texture(u_refImage, refUv);

    // Composite ref image over page background so transparent ref pixels
    // still occlude the drawing underneath this canvas.
    // Ref texture is uploaded premultiplied to avoid white fringes on
    // transparent gradients.
    vec3 refOverBg = ref.rgb + PAPER * (1.0 - ref.a);
    // Alpha follows the same ramp as the reveal so the blob edge
    // cross-fades straight into the drawing underneath. (A binary alpha
    // here painted a ring of flat bg wherever the mask was above the
    // alpha cutoff but below the reveal ramp.)
    fragColor = vec4(refOverBg * reveal, reveal);
  }
`;

/** Every [shader, region] pair the explainer quotes. Tested to exist. */
export const GLSL_REGIONS = [
  ['blob', 'decay'],
  ['blob', 'stroke'],
  ['blob', 'dwell'],
  ['display', 'fbm'],
  ['display', 'edge'],
] as const;

/** The dedented lines between `// #region name` and the next `// #endregion`. */
export function glslExcerpt(src: string, name: string): string {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.trim() === `// #region ${name}`);
  if (start < 0) throw new Error(`glsl region not found: ${name}`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === '// #endregion');
  if (end < 0) throw new Error(`glsl region not closed: ${name}`);
  const body = lines.slice(start + 1, end);
  const indent = Math.min(
    ...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length),
  );
  return body.map((l) => l.slice(indent)).join('\n').trim();
}
```

Note: `vec3 bg` became the `PAPER` const — same value.

**Step 4: Run to verify it passes**

Run: `pnpm test src/components/reveal/shaders.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/reveal/shaders.ts src/components/reveal/shaders.test.ts
git commit -m "Move reveal GLSL into shaders.ts with edge uniforms, debug views and excerpt regions"
```

---

### Task 3: `revealRenderer.ts` — the GL pipeline as a reusable object

**Files:**
- Create: `src/components/reveal/revealRenderer.ts`

No unit test (needs a GL context); it's verified by `pnpm build` now and by Ryan's visual check at the checkpoint after Task 4. The code below is RevealFluid's existing setup moved verbatim into a factory, parameterized by viewport and edge params.

**Step 1: Implement**

```ts
// src/components/reveal/revealRenderer.ts
import { type Brush } from './brush';
import {
  ACCENT_RGB,
  BLOB_FS,
  DISPLAY_FS,
  QUAD_VS,
  type EdgeParams,
  type RevealView,
} from './shaders';

// The mask is a smooth field, so it looks the same at half resolution
// (bilinear upsampling) and costs a quarter of the fill rate.
const MASK_SCALE = 0.5;

export type PaintParams = {
  dt: number;
  /** Seconds a fully revealed pixel takes to fade. */
  fadeDuration: number;
  /** Dwell build-up per 60Hz frame. */
  strength: number;
  /** Aspect ratio (w/h) of the area the mask covers. */
  aspect: number;
};

export type DrawParams = {
  /** Device-pixel rect on the default framebuffer: x, y (from bottom), w, h. */
  viewport: readonly [number, number, number, number];
  aspect: number;
  time: number;
  view: RevealView;
  edge: EdgeParams;
  accent?: readonly [number, number, number];
};

export type RevealRenderer = {
  /** Size the mask for a drawing area of w×h device pixels (no-op if unchanged). */
  resize(w: number, h: number): void;
  /** Pass 1: decay the mask and paint this frame's brush path into it. */
  paint(brush: Brush, painting: boolean, p: PaintParams): void;
  /** Clear the whole default framebuffer to transparent. */
  clear(): void;
  /** Pass 2: composite (or a debug view) into a viewport of the canvas. */
  draw(p: DrawParams): void;
  setReference(img: HTMLImageElement): void;
  dispose(): void;
};

export function createRevealRenderer(gl: WebGL2RenderingContext): RevealRenderer | null {
  function createShader(type: number, src: string) {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function createProgram(vsSrc: string, fsSrc: string) {
    const vs = createShader(gl.VERTEX_SHADER, vsSrc);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  const blobProgram = createProgram(QUAD_VS, BLOB_FS);
  const displayProgram = createProgram(QUAD_VS, DISPLAY_FS);
  if (!blobProgram || !displayProgram) return null;

  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  function drawQuad(program: WebGLProgram) {
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const blobU = {
    prev: u(blobProgram, 'u_prev'),
    path: u(blobProgram, 'u_path'),
    pathRadius: u(blobProgram, 'u_pathRadius'),
    pointerDown: u(blobProgram, 'u_pointerDown'),
    strength: u(blobProgram, 'u_strength'),
    dTime: u(blobProgram, 'u_dTime'),
    duration: u(blobProgram, 'u_duration'),
    aspect: u(blobProgram, 'u_aspect'),
    dwell: u(blobProgram, 'u_dwell'),
  };
  const displayU = {
    mask: u(displayProgram, 'u_mask'),
    refImage: u(displayProgram, 'u_refImage'),
    refLoaded: u(displayProgram, 'u_refLoaded'),
    canvasAspect: u(displayProgram, 'u_canvasAspect'),
    refAspect: u(displayProgram, 'u_refAspect'),
    time: u(displayProgram, 'u_time'),
    threshold: u(displayProgram, 'u_threshold'),
    noiseAmp: u(displayProgram, 'u_noiseAmp'),
    edgeSoftness: u(displayProgram, 'u_edgeSoftness'),
    octaves: u(displayProgram, 'u_octaves'),
    view: u(displayProgram, 'u_view'),
    accent: u(displayProgram, 'u_accent'),
  };

  // Store the mask as half-float when we can render to it. With RGBA8 each
  // value is rounded to 1/255 per frame, so the per-frame decay rounds to
  // zero on high-refresh displays (the blob never fades on 240Hz) and the
  // reveal edge bands. R16F is filterable in core WebGL2.
  const floatMask = !!gl.getExtension('EXT_color_buffer_float');

  function createFBO(w: number, h: number) {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (floatMask) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }

  function deleteFBO(f: { tex: WebGLTexture; fbo: WebGLFramebuffer }) {
    gl.deleteTexture(f.tex);
    gl.deleteFramebuffer(f.fbo);
  }

  let fbW = 1;
  let fbH = 1;
  let fbA = createFBO(fbW, fbH);
  let fbB = createFBO(fbW, fbH);

  let refTexture: WebGLTexture | null = null;
  let refAspect = 1;

  return {
    resize(w, h) {
      const mw = Math.max(1, Math.floor(w * MASK_SCALE));
      const mh = Math.max(1, Math.floor(h * MASK_SCALE));
      if (mw === fbW && mh === fbH) return;
      deleteFBO(fbA);
      deleteFBO(fbB);
      fbW = mw;
      fbH = mh;
      fbA = createFBO(mw, mh);
      fbB = createFBO(mw, mh);
    },

    paint(brush, painting, p) {
      // Render to fbB, reading fbA, then swap.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbB.fbo);
      gl.viewport(0, 0, fbW, fbH);
      gl.useProgram(blobProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbA.tex);
      gl.uniform1i(blobU.prev, 0);
      gl.uniform2fv(blobU.path, brush.path);
      gl.uniform1fv(blobU.pathRadius, brush.radii);
      gl.uniform1f(blobU.pointerDown, painting ? 1.0 : 0.0);
      gl.uniform1f(blobU.strength, p.strength);
      gl.uniform1f(blobU.dTime, p.dt);
      gl.uniform1f(blobU.duration, p.fadeDuration);
      gl.uniform1f(blobU.aspect, p.aspect);
      gl.uniform1f(blobU.dwell, 1 - brush.speedT);
      drawQuad(blobProgram);
      const tmp = fbA;
      fbA = fbB;
      fbB = tmp;
    },

    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    draw(p) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(p.viewport[0], p.viewport[1], p.viewport[2], p.viewport[3]);
      gl.useProgram(displayProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbA.tex);
      gl.uniform1i(displayU.mask, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, refTexture);
      gl.uniform1i(displayU.refImage, 1);
      gl.uniform1f(displayU.refLoaded, refTexture ? 1.0 : 0.0);
      gl.uniform1f(displayU.canvasAspect, p.aspect);
      gl.uniform1f(displayU.refAspect, refAspect);
      gl.uniform1f(displayU.time, p.time);
      gl.uniform1f(displayU.threshold, p.edge.threshold);
      gl.uniform1f(displayU.noiseAmp, p.edge.noiseAmp);
      gl.uniform1f(displayU.edgeSoftness, p.edge.softness);
      gl.uniform1i(displayU.octaves, p.edge.octaves);
      gl.uniform1i(displayU.view, p.view);
      const a = p.accent ?? ACCENT_RGB;
      gl.uniform3f(displayU.accent, a[0], a[1], a[2]);
      drawQuad(displayProgram);
    },

    setReference(img) {
      refAspect = img.height > 0 ? img.width / img.height : 1;
      if (refTexture) gl.deleteTexture(refTexture);
      refTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, refTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    },

    dispose() {
      deleteFBO(fbA);
      deleteFBO(fbB);
      if (refTexture) gl.deleteTexture(refTexture);
      gl.deleteBuffer(quadBuf);
      gl.deleteProgram(blobProgram);
      gl.deleteProgram(displayProgram);
    },
  };
}
```

**Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/reveal/revealRenderer.ts
git commit -m "Add reusable reveal renderer (mask + display passes)"
```

---

### Task 4: Rewire `RevealFluid.tsx` onto the extracted modules

**Files:**
- Modify: `src/components/RevealFluid.tsx` (replace lines ~27–342 GL setup and ~463–605 frame loop; keep the pointer listeners ~347–440 as-is)

**Step 1: Replace the component body**

The whole `useEffect` becomes (props, JSX return and listener functions unchanged):

```tsx
'use client';
import React, { useEffect, useRef } from 'react';
import { createBrush, stepBrush } from '@/components/reveal/brush';
import { DEFAULT_EDGE } from '@/components/reveal/shaders';
import { createRevealRenderer } from '@/components/reveal/revealRenderer';

// … RevealFluidProps + defaults unchanged …

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    let animFrameId: number | null = null;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const renderer = createRevealRenderer(gl);
    if (!renderer) return;

    const refImg = new Image();
    refImg.crossOrigin = 'anonymous';
    refImg.onload = () => {
      if (!destroyed) renderer.setReference(refImg);
    };
    refImg.src = referenceImage;

    /* ------------------------------------------------------------------ */
    /*  Pointer state                                                      */
    /* ------------------------------------------------------------------ */

    let pointerX = 10;
    let pointerY = 10;
    // True while the mouse is over the page or a finger is down.
    let pointerActive = false;
    // Set when the pointer comes back after a release, so the next stroke
    // starts on the cursor instead of sweeping in from the old one.
    let newStroke = false;

    // The brush chases the raw pointer with a little lag, so the painted
    // path is a smooth curve instead of straight per-frame segments.
    const brush = createBrush(pointerRadius);

    // … getCanvasUV, isOverPlayer, setPointer, onPointerMove, onPointerOver,
    //   onPointerLeave, onMouseOut, onTouchMove and addEventListener calls
    //   exactly as before …

    /* ------------------------------------------------------------------ */
    /*  Animation loop                                                     */
    /* ------------------------------------------------------------------ */

    let lastTime = performance.now();
    const startTime = lastTime;

    // Freeze the edge noise drift for reduced-motion users.
    const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    function scaleByPixelRatio(v: number) {
      return Math.floor(v * (window.devicePixelRatio || 1));
    }

    function frame(now: number) {
      if (destroyed) return;

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Resize canvas to match layout
      const cw = scaleByPixelRatio(canvas!.clientWidth);
      const ch = scaleByPixelRatio(canvas!.clientHeight);
      if (canvas!.width !== cw || canvas!.height !== ch) {
        canvas!.width = cw;
        canvas!.height = ch;
      }
      renderer!.resize(canvas!.width, canvas!.height);

      const aspect = canvas!.width / canvas!.height;

      const painting = stepBrush(brush, {
        pointerX,
        pointerY,
        pointerActive,
        newStroke,
        dt,
        aspect,
        baseRadius: pointerRadius,
      });
      newStroke = false;

      renderer!.paint(brush, painting, {
        dt,
        fadeDuration,
        strength: blobStrength,
        aspect,
      });
      renderer!.clear();
      renderer!.draw({
        viewport: [0, 0, canvas!.width, canvas!.height],
        aspect,
        time: reducedMotionMq.matches ? 0 : (now - startTime) / 1000,
        view: 0,
        edge: DEFAULT_EDGE,
      });

      animFrameId = requestAnimationFrame(frame);
    }

    animFrameId = requestAnimationFrame(frame);

    return () => {
      destroyed = true;
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onPointerLeave);
      renderer.dispose();
    };
  }, [referenceImage, pointerRadius, fadeDuration, blobStrength]);
```

Delete from RevealFluid: `createShader`, `createProgramFromSources`, `quadVS`, `quadBuf`, `drawQuad`, `PATH_SUBDIV`, `blobFS`, `blobProgram`, `blobUniforms`, `displayFS`, `displayProgram`, `displayUniforms`, `floatMask`, `MASK_SCALE`, `createFBO`, `fbW/fbH/fbA/fbB`, `resizeFBOs`, `refTexture/refImageLoaded/refAspect`, `paintX…pathRadii` state, and the brush constants (`POINTER_FOLLOW`, `FAST_RADIUS_SCALE`, `SLOW_SPEED`, `FAST_SPEED`, `RADIUS_FOLLOW`, `CATCH_UP_EPS`).

Behavior notes (why this is equivalent):
- `renderer.resize` is called every frame and is a no-op when unchanged; the old code resized only when the canvas changed, but the mask size is a pure function of canvas size, so the result is the same. The very first frame now creates the mask at the right size rather than from the canvas's default 300×150 — invisible.
- `u_refLoaded` is now `refTexture !== null`, which becomes true at the same moment `refImageLoaded` did.

**Step 2: Verify**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all pass; `grep -n "createShader\|PATH_SUBDIV" src/components/RevealFluid.tsx` returns nothing.

**Step 3: Commit**

```bash
git add src/components/RevealFluid.tsx
git commit -m "RevealFluid: use shared brush, shaders and renderer (no behavior change)"
```

### CHECKPOINT 1 — hand to Ryan

Stop and ask Ryan to run `pnpm dev` and check, on the about page:
- [ ] The reveal paints, follows the cursor, and fades exactly as before.
- [ ] Fast strokes stay continuous (no dots, no loops); resting swells the blob.
- [ ] The ink edge wobbles and drifts; edge is crisp, not jagged.
- [ ] Leaving the window and coming back starts a fresh stroke (no sweep).
- [ ] Piano player still doesn't smear the reveal.
- [ ] No console errors.

Don't continue until Ryan confirms.

---

## Phase B — Entry point and takeover shell

### Task 5: Rich project body paragraphs + the new copy

**Files:**
- Modify: `src/components/story/storyData.ts:126-179`
- Modify: `src/components/story/storyData.test.ts` (append)

**Step 1: Write the failing test** (append to `storyData.test.ts`, adding `PROJECT_CONTENT` to the import)

```ts
describe('project body', () => {
  it('has exactly one shader explainer trigger, in "this website"', () => {
    const triggers = PROJECT_CONTENT.flatMap((project) =>
      project.body.flatMap((paragraph) =>
        typeof paragraph === 'string'
          ? []
          : paragraph
              .filter((segment) => segment.action === 'shaderExplainer')
              .map((segment) => ({ project: project.key, text: segment.text })),
      ),
    );
    expect(triggers).toEqual([{ project: 'thisWebsite', text: "here's how it works →" }]);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm test src/components/story/storyData.test.ts`
Expected: FAIL (type error surfaces as a runtime mismatch: `triggers` is `[]`).

**Step 3: Implement** — in `storyData.ts`, above `ProjectContent`:

```ts
// A run of text in a project paragraph; `action` makes it an in-page trigger.
export type ProjectBodySegment = { text: string; action?: 'shaderExplainer' };
// A paragraph is plain text, or a list of runs when part of it is interactive.
export type ProjectBodyParagraph = string | readonly ProjectBodySegment[];
```

Change `body: readonly string[];` → `body: readonly ProjectBodyParagraph[];`, and in the `thisWebsite` entry insert as the third paragraph (before "this project is where…"):

```ts
      [
        {
          text:
            'remember painting over my drawing on the about page? ' +
            "that's a custom webgl2 shader i wrote. ",
        },
        { text: "here's how it works →", action: 'shaderExplainer' },
      ],
```

**Step 4: Run to verify it passes**

Run: `pnpm test src/components/story/storyData.test.ts && pnpm exec tsc --noEmit`
Expected: test PASS. `tsc` will FAIL in `StoryPlayer.tsx` (paragraph used as a string/key) — fixed in Task 6.

**Step 5: Commit** (together with Task 6 so the tree typechecks — don't commit yet).

---

### Task 6: Render the trigger; open a lazily-loaded `ShaderExplainer` shell

**Files:**
- Modify: `app/layout.tsx` (Neuton)
- Modify: `app/globals.css` (append `.inline-trigger`)
- Create: `src/components/explainer/tokens.ts`
- Create: `src/components/explainer/explainerContext.ts`
- Create: `src/components/explainer/ShaderExplainer.tsx`
- Modify: `src/components/StoryPlayer.tsx` (imports; state near line 89; body render at ~675; mount near ~981)

**Step 1: Neuton in `app/layout.tsx`**

```tsx
import { Inconsolata, Neuton } from 'next/font/google';

// Serif for the shader explainer's body copy. Not preloaded: it's only used
// inside the lazily-loaded explainer takeover.
const neuton = Neuton({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-neuton',
  display: 'swap',
  preload: false,
});
```

and `className={`${GeistSans.variable} ${inconsolata.variable} ${neuton.variable}`}`.

If `pnpm build` fails fetching `Neuton:ital,wght@1,700`, split it: `Neuton({ weight: ['400','700'], style: 'normal', variable: '--font-neuton', … })` only, and drop italic 700 (we only use italic at 400 — browsers will then synthesize italic; acceptable fallback, but note it for Ryan).

**Step 2: `tokens.ts`**

```ts
// src/components/explainer/tokens.ts
// Shared look for the shader explainer: the site's ink-on-paper, one accent.
export const INK = '#1f1812';
export const PAPER = '#f7f7f5';
export const MUTED = '#6f655a';
export const RULE = 'rgba(31, 24, 18, 0.12)';
export const FAINT = 'rgba(31, 24, 18, 0.35)';
/** The one accent: "the thing under discussion" in every figure. */
export const ACCENT = '#c8412b';

export const SERIF = 'var(--font-neuton), Georgia, serif';
export const SANS = 'var(--font-geist-sans), sans-serif';
export const MONO = 'var(--font-inconsolata), monospace';

/** Text column and figure breakout widths. */
export const COLUMN = '42.5rem'; // ~680px
export const WIDE = '60rem'; // ~960px
```

**Step 3: `explainerContext.ts`**

```ts
// src/components/explainer/explainerContext.ts
import { createContext, useContext } from 'react';

/** Whether the takeover is open — figures pause while it's closed. */
export const ExplainerOpenContext = createContext(false);
export const useExplainerOpen = () => useContext(ExplainerOpenContext);
```

**Step 4: `ShaderExplainer.tsx` (shell only; chapters added in later tasks)**

Modeled on `TldrOverlay.tsx`. Differences: mounted on first open (so it must fade itself in after mount — `visible` lags `open` by a frame), serif article layout.

```tsx
// src/components/explainer/ShaderExplainer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { DOCKED_CENTER_Y } from '@/components/story/StoryNav';
import { useScrollFade } from '@/components/useScrollFade';
import { ExplainerOpenContext } from './explainerContext';
import { INK, MUTED, PAPER, SANS, SERIF, WIDE } from './tokens';
import { Prose } from './layout';

type ShaderExplainerProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen editorial takeover explaining the about-page reveal shader.
 * Loaded with next/dynamic and mounted on first open, then kept mounted so the
 * fade-out plays and reopening is instant. Story state underneath is
 * untouched. See docs/plans/2026-09-24-shader-explainer-design.md.
 */
export default function ShaderExplainer({ open, onClose }: ShaderExplainerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const { scrollRef, contentRef, onScroll, maskImage } = useScrollFade();

  // First mount arrives with open=true; start hidden and flip on the next
  // frame so the opacity transition actually runs.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (open) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const id = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    restoreFocusRef.current?.focus?.();
    return undefined;
  }, [open]);

  return (
    <ExplainerOpenContext.Provider value={open}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label="how the ink reveal works"
        aria-hidden={!open}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: PAPER,
          color: INK,
          opacity: visible ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="close"
          data-cursor-pad="-4"
          style={{
            position: 'absolute',
            top: DOCKED_CENTER_Y,
            right: '1.5rem',
            transform: 'translateY(-50%)',
            zIndex: 1,
            width: '2rem',
            height: '2rem',
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'transparent',
            color: INK,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div
          ref={scrollRef}
          className="custom-scroll"
          onScroll={onScroll}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitMaskImage: maskImage,
            maskImage,
          }}
        >
          <article
            ref={contentRef}
            style={{
              maxWidth: WIDE,
              margin: '0 auto',
              padding: 'clamp(4.5rem, 12vh, 7.5rem) 2rem 8rem',
              fontFamily: SERIF,
              fontSize: '1.25rem',
              lineHeight: 1.6,
              color: INK,
            }}
          >
            <Prose>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: '3.4rem', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
                how the ink reveal works
              </h1>
              <p style={{ margin: '1rem 0 0', fontStyle: 'italic', fontSize: '1.45rem', lineHeight: 1.45, color: MUTED }}>
                a walk through the webgl2 shader behind the about page: the math, a
                couple of bugs, and figures you can poke at.
              </p>
              <p style={{ margin: '1.4rem 0 0', fontFamily: SANS, fontSize: '0.78rem', letterSpacing: '0.06em', color: MUTED }}>
                webgl2 · glsl es 3.0 · ~8 min · interactive
              </p>
            </Prose>
            {/* Hero + chapters + outro are added in Phase D. */}
          </article>
        </div>
      </div>
    </ExplainerOpenContext.Provider>
  );
}
```

And `src/components/explainer/layout.tsx` (column + chapter primitives used everywhere):

```tsx
// src/components/explainer/layout.tsx
import { type ReactNode } from 'react';
import { ACCENT, COLUMN, SANS, SERIF } from './tokens';

/** The ~680px reading column, centered inside the wider article. */
export function Prose({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: COLUMN, margin: '0 auto' }}>{children}</div>;
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 1.1em' }}>{children}</p>;
}

export function Chapter({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} style={{ marginTop: '6rem' }}>
      <Prose>
        <div style={{ fontFamily: SANS, fontSize: '0.75rem', letterSpacing: '0.14em', color: ACCENT }}>
          {number}
        </div>
        <h2
          id={id}
          style={{ margin: '0.35rem 0 1.3rem', fontFamily: SERIF, fontWeight: 400, fontSize: '2.2rem', lineHeight: 1.15 }}
        >
          {title}
        </h2>
      </Prose>
      {children}
    </section>
  );
}

/** Inline code / symbols in running text. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code style={{ fontFamily: 'var(--font-inconsolata), monospace', fontSize: '0.88em', padding: '0 0.15em' }}>
      {children}
    </code>
  );
}
```

**Step 5: `globals.css` — append**

```css
/* Inline in-page trigger inside project copy (e.g. "here's how it works →").
   Bold against the 300-weight body to read as interactive; underline on hover. */
.inline-trigger {
  font: inherit;
  font-weight: 600;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 0.18em;
  transition: text-decoration-color 160ms ease;
}

.inline-trigger:hover,
.inline-trigger:focus-visible {
  text-decoration-color: currentColor;
}

.inline-trigger:focus-visible {
  outline: 2px solid #1f1812;
  outline-offset: 2px;
  border-radius: 2px;
}
```

**Step 6: `StoryPlayer.tsx`**

Imports:

```tsx
import dynamic from 'next/dynamic';
```

Module scope (after imports):

```tsx
// Heavy (figures, WebGL) and rarely opened: load on first open only.
const loadShaderExplainer = () => import('@/components/explainer/ShaderExplainer');
const ShaderExplainer = dynamic(loadShaderExplainer, { ssr: false });
```

State next to `tldrOpen` (~line 89):

```tsx
  const [explainerOpen, setExplainerOpen] = useState(false);
  // Mounted on first open, then kept so its fade-out plays and reopening is instant.
  const [explainerMounted, setExplainerMounted] = useState(false);
  const openExplainer = () => {
    setExplainerMounted(true);
    setExplainerOpen(true);
  };
```

Replace the body render (~line 675):

```tsx
                    {project.body.map((paragraph, index) => (
                      <p key={index} style={{ margin: 0 }}>
                        {typeof paragraph === 'string'
                          ? paragraph
                          : paragraph.map((segment, segmentIndex) =>
                              segment.action === 'shaderExplainer' ? (
                                <button
                                  key={segmentIndex}
                                  type="button"
                                  className="inline-trigger"
                                  onClick={openExplainer}
                                  // Warm the chunk while the pointer is on its way.
                                  onPointerEnter={() => void loadShaderExplainer()}
                                  onFocus={() => void loadShaderExplainer()}
                                >
                                  {segment.text}
                                </button>
                              ) : (
                                <span key={segmentIndex}>{segment.text}</span>
                              ),
                            )}
                      </p>
                    ))}
```

Mount next to `<TldrOverlay … />` (~line 981):

```tsx
      {explainerMounted ? (
        <ShaderExplainer open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      ) : null}
```

**Step 7: Verify**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all pass. The build output should list a separate chunk for the explainer (not required to check).

**Step 8: Commit (Tasks 5 + 6)**

```bash
git add app/layout.tsx app/globals.css src/components/story/storyData.ts src/components/story/storyData.test.ts src/components/StoryPlayer.tsx src/components/explainer
git commit -m "Add shader explainer entry point and takeover shell"
```

### CHECKPOINT 2 — hand to Ryan

- [ ] "this website" shows the new paragraph; "here's how it works →" is bold, underlines on hover, and the cursor wraps it.
- [ ] Clicking fades in the takeover (first open included) with the Neuton title block.
- [ ] Esc and X close it; focus returns to the link; you're still on "this website".
- [ ] Tab reaches the link; Enter opens it.
- [ ] The piano player is covered while open.
- [ ] Other projects' copy is unchanged.

---

## Phase C — Figure kit and figure math

### Task 7: `explainerMath.ts` — pure math behind the 2D figures

**Files:**
- Create: `src/components/explainer/explainerMath.ts`
- Create: `src/components/explainer/explainerMath.test.ts`

**Step 1: Write the failing test**

```ts
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
  it('half-float storage tracks the ideal at 240Hz', () => {
    expect(fadeTime(240, 2.5, 'r16f')).toBeCloseTo(2.5, 1);
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
    expect(mask.data[0]).toBeCloseTo(1 - 1 / 60 / 2.5, 9);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm test src/components/explainer/explainerMath.test.ts`
Expected: FAIL — cannot resolve `./explainerMath`.

**Step 3: Implement**

```ts
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
```

**Step 4: Run to verify it passes**

Run: `pnpm test src/components/explainer/explainerMath.test.ts`
Expected: PASS. (If `fadeTime(60,…,'rgba8')` lands at 2.12 vs 2.13 that's still within `toBeCloseTo(…, 1)`.)

**Step 5: Commit**

```bash
git add src/components/explainer/explainerMath.ts src/components/explainer/explainerMath.test.ts
git commit -m "Add explainer figure math: segment distance, precision, decay, CPU mask pass"
```

---

### Task 8: Figure kit — frame, controls, hooks

**Files:**
- Create: `src/components/explainer/hooks.ts`
- Create: `src/components/explainer/figure/Figure.tsx`
- Create: `src/components/explainer/figure/controls.tsx`
- Create: `src/components/explainer/figure/MathToggle.tsx`
- Modify: `app/globals.css` (append control styles)

No unit tests (React/DOM glue; vitest runs in node). Verified by typecheck/lint now and visually at Checkpoint 3.

**Step 1: `hooks.ts`**

```ts
// src/components/explainer/hooks.ts
'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** rAF loop that only runs while `active`. dt is clamped to 0.05s like the site. */
export function useAnimationFrame(active: boolean, cb: (dt: number, now: number) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!active) return undefined;
    let id = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      cbRef.current(dt, now);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** CSS-pixel size of an element, tracked with ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Size a canvas's backing store to its CSS box × DPR and return a 2D context
 * already scaled so drawing uses CSS pixels.
 */
export function prepareCanvas2D(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
```

**Step 2: `figure/Figure.tsx`**

```tsx
// src/components/explainer/figure/Figure.tsx
'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useExplainerOpen } from '../explainerContext';
import { COLUMN, INK, MUTED, RULE, SANS, SERIF, WIDE } from '../tokens';

const FigureActiveContext = createContext(false);

/** True while this figure is on screen and the takeover is open. */
export const useFigureActive = () => useContext(FigureActiveContext);

type FigureProps = {
  number: number;
  caption: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
};

/** A figure plate: hairline rules, controls row, numbered caption. */
export function Figure({ number, caption, controls, children }: FigureProps) {
  const ref = useRef<HTMLElement | null>(null);
  const open = useExplainerOpen();
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      rootMargin: '120px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <FigureActiveContext.Provider value={open && onScreen}>
      <figure
        ref={ref}
        style={{
          maxWidth: WIDE,
          margin: '2.8rem auto',
          padding: '1.6rem 0 1.1rem',
          borderTop: `1px solid ${RULE}`,
          borderBottom: `1px solid ${RULE}`,
        }}
      >
        {children}
        {controls ? (
          <div
            role="group"
            aria-label={`figure ${number} controls`}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.9rem 2.2rem',
              marginTop: '1.1rem',
              fontFamily: SANS,
              fontSize: '0.8rem',
              color: INK,
            }}
          >
            {controls}
          </div>
        ) : null}
        <figcaption
          style={{
            maxWidth: COLUMN,
            marginTop: '0.95rem',
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: '1.02rem',
            lineHeight: 1.5,
            color: MUTED,
          }}
        >
          <span
            style={{
              fontFamily: SANS,
              fontStyle: 'normal',
              fontSize: '0.7rem',
              letterSpacing: '0.12em',
              color: INK,
              marginRight: '0.7em',
            }}
          >
            FIG. {number}
          </span>
          {caption}
        </figcaption>
      </figure>
    </FigureActiveContext.Provider>
  );
}
```

**Step 3: `figure/controls.tsx`**

```tsx
// src/components/explainer/figure/controls.tsx
'use client';
import { type ReactNode } from 'react';
import { MONO, MUTED } from '../tokens';

export function Readout({ children, width = '4.5ch' }: { children: ReactNode; width?: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: '0.95rem',
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-block',
        minWidth: width,
      }}
    >
      {children}
    </span>
  );
}

/** A labeled readout: "speed 3.21". */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.5rem' }}>
      <span style={{ color: MUTED }}>{label}</span>
      <Readout>{children}</Readout>
    </span>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
};

export function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
      <span style={{ color: MUTED }}>{label}</span>
      <input
        type="range"
        className="ex-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <Readout>{format ? format(value) : value}</Readout>
    </label>
  );
}

type ToggleProps<T extends string | number> = {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
};

/** Segmented text toggle: "path  straight / hermite". */
export function Toggle<T extends string | number>({ label, value, options, onChange }: ToggleProps<T>) {
  return (
    <span role="radiogroup" aria-label={label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.65rem' }}>
      <span style={{ color: MUTED }}>{label}</span>
      {options.map((option, i) => (
        <span key={String(option.value)} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.65rem' }}>
          {i > 0 ? <span aria-hidden="true" style={{ color: MUTED }}>/</span> : null}
          <button
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className="ex-toggle"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        </span>
      ))}
    </span>
  );
}
```

**Step 4: `figure/MathToggle.tsx`**

```tsx
// src/components/explainer/figure/MathToggle.tsx
'use client';
import { useId, useState, type ReactNode } from 'react';
import { COLUMN, MONO, RULE, SANS } from '../tokens';

/** "show the math" — expands equations + real GLSL under a chapter. */
export function MathToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div style={{ maxWidth: COLUMN, margin: '1.6rem auto 0' }}>
      <button
        type="button"
        className="ex-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        style={{ fontFamily: SANS, fontSize: '0.82rem', letterSpacing: '0.04em' }}
      >
        {open ? '− hide the math' : '+ show the math'}
      </button>
      {/* 0fr → 1fr grid trick (same as the nav) for a height animation. */}
      <div
        id={id}
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ overflow: 'hidden' }} inert={!open ? true : undefined}>
          <div style={{ paddingTop: '1.1rem' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A display equation line. */
export function Eq({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: '1.05rem', margin: '0.9rem 0', paddingLeft: '1.2rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
      {children}
    </div>
  );
}

/** A code block (GLSL excerpt from the real shader source). */
export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure style={{ margin: '1rem 0 1.3rem' }}>
      {label ? (
        <figcaption style={{ fontFamily: SANS, fontSize: '0.7rem', letterSpacing: '0.1em', marginBottom: '0.4rem', opacity: 0.7 }}>
          {label}
        </figcaption>
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: '0.9rem 1.1rem',
          fontFamily: MONO,
          fontSize: '0.86rem',
          lineHeight: 1.55,
          borderLeft: `2px solid ${RULE}`,
          background: 'rgba(31, 24, 18, 0.035)',
          overflowX: 'auto',
        }}
      >
        <code>{children}</code>
      </pre>
    </figure>
  );
}
```

If `inert={… ? true : undefined}` trips React 19 typings, set it imperatively with a ref as `TldrOverlay` does.

**Step 5: `globals.css` — append**

```css
/* ---- shader explainer controls ---- */
.ex-toggle {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 160ms ease;
}
.ex-toggle:hover,
.ex-toggle[aria-checked='true'],
.ex-toggle[aria-expanded] {
  opacity: 1;
}
.ex-toggle[aria-checked='true'] {
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 0.25em;
}
.ex-toggle:focus-visible,
.ex-range:focus-visible {
  outline: 2px solid #1f1812;
  outline-offset: 3px;
  border-radius: 2px;
}

.ex-range {
  -webkit-appearance: none;
  appearance: none;
  width: 9rem;
  height: 1rem;
  background: transparent;
  cursor: pointer;
}
.ex-range::-webkit-slider-runnable-track {
  height: 1px;
  background: rgba(31, 24, 18, 0.35);
}
.ex-range::-moz-range-track {
  height: 1px;
  background: rgba(31, 24, 18, 0.35);
}
.ex-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 11px;
  height: 11px;
  margin-top: -5px;
  border-radius: 50%;
  background: #f7f7f5;
  border: 1.5px solid #1f1812;
}
.ex-range::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #f7f7f5;
  border: 1.5px solid #1f1812;
}
```

**Step 6: Verify & commit**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: pass.

```bash
git add src/components/explainer/hooks.ts src/components/explainer/figure app/globals.css
git commit -m "Add explainer figure kit: plate, controls, math toggle, hooks"
```

---

### Task 9: `useRevealCanvas` — the real shader inside a figure

**Files:**
- Create: `src/components/explainer/useRevealCanvas.ts`

Runs the shared renderer + brush in a figure canvas, split into one or more side-by-side panes that all read the same mask (Ch01 shows composite | mask). GL is created lazily on first activation and released on unmount.

```ts
// src/components/explainer/useRevealCanvas.ts
'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { createBrush, stepBrush } from '@/components/reveal/brush';
import { createRevealRenderer, type RevealRenderer } from '@/components/reveal/revealRenderer';
import { DEFAULT_EDGE, type EdgeParams, type RevealView } from '@/components/reveal/shaders';
import { ABOUT_REFERENCE_IMAGE } from '@/components/story/storyData';

export type RevealPane = { view: RevealView };

export type RevealCanvasOptions = {
  active: boolean;
  reducedMotion: boolean;
  panes: readonly RevealPane[];
  /** Gap between panes in CSS px. */
  gap?: number;
  edge?: EdgeParams;
  /** Scripted pointer when idle (not hovered). Given seconds, returns clip-space x,y. */
  autopilot?: (t: number) => { x: number; y: number };
  /** Runs right after each frame is drawn (e.g. a loupe copying pixels). */
  afterDraw?: (canvas: HTMLCanvasElement, brush: { x: number; y: number }) => void;
};

const BASE_RADIUS = 0.15;
const FADE_DURATION = 2.5;
const STRENGTH = 0.12;

export function useRevealCanvas(canvasRef: RefObject<HTMLCanvasElement | null>, opts: RevealCanvasOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const rendererRef = useRef<RevealRenderer | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  // Pointer state lives across activations.
  const pointer = useRef({ x: 0, y: 0, active: false, newStroke: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const paneAt = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const n = optsRef.current.panes.length;
      const gap = optsRef.current.gap ?? 0;
      const paneW = (rect.width - gap * (n - 1)) / n;
      const local = clientX - rect.left;
      const i = Math.min(n - 1, Math.max(0, Math.floor(local / (paneW + gap))));
      return { left: rect.left + i * (paneW + gap), width: paneW, rect };
    };
    const onMove = (e: PointerEvent) => {
      const { left, width, rect } = paneAt(e.clientX);
      const p = pointer.current;
      p.x = ((e.clientX - left) / width) * 2 - 1;
      p.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      if (!p.active) p.newStroke = true;
      p.active = true;
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [canvasRef]);

  useEffect(() => {
    if (!opts.active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    if (!rendererRef.current) {
      const gl = canvas.getContext('webgl2', {
        alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false,
      });
      if (!gl) return undefined;
      const renderer = createRevealRenderer(gl);
      if (!renderer) return undefined;
      glRef.current = gl;
      rendererRef.current = renderer;
      const img = new Image();
      img.onload = () => rendererRef.current?.setReference(img);
      img.src = ABOUT_REFERENCE_IMAGE;
    }
    const renderer = rendererRef.current;
    const brush = createBrush(BASE_RADIUS);
    let id = 0;
    let last = performance.now();
    let clock = 0;
    let autopilotWasOn = false;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const o = optsRef.current;
      if (!o.reducedMotion) clock += dt;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.floor(canvas.clientWidth * dpr);
      const ch = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const n = o.panes.length;
      const gap = Math.round((o.gap ?? 0) * dpr);
      const paneW = Math.floor((canvas.width - gap * (n - 1)) / n);
      const paneH = canvas.height;
      const aspect = paneW / paneH;
      renderer.resize(paneW, paneH);

      // Real pointer wins; otherwise the optional autopilot draws.
      const p = pointer.current;
      const auto = !p.active && o.autopilot && !o.reducedMotion ? o.autopilot(clock) : null;
      const painting = stepBrush(brush, {
        pointerX: auto ? auto.x : p.x,
        pointerY: auto ? auto.y : p.y,
        pointerActive: p.active || !!auto,
        newStroke: p.newStroke || (!!auto && !autopilotWasOn),
        dt,
        aspect,
        baseRadius: BASE_RADIUS,
      });
      p.newStroke = false;
      autopilotWasOn = !!auto;

      renderer.paint(brush, painting, { dt, fadeDuration: FADE_DURATION, strength: STRENGTH, aspect });
      renderer.clear();
      o.panes.forEach((pane, i) => {
        renderer.draw({
          viewport: [i * (paneW + gap), 0, paneW, paneH],
          aspect,
          time: clock,
          view: pane.view,
          edge: o.edge ?? DEFAULT_EDGE,
        });
      });
      o.afterDraw?.(canvas, brush);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [opts.active, canvasRef]);

  // Free the GL context when the figure unmounts.
  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      glRef.current?.getExtension('WEBGL_lose_context')?.loseContext();
    },
    [],
  );
}
```

Commit after typecheck:

```bash
pnpm exec tsc --noEmit
git add src/components/explainer/useRevealCanvas.ts
git commit -m "Add useRevealCanvas: run the real reveal shader inside explainer figures"
```

---

## Phase D — Chapters

Each chapter is its own file under `src/components/explainer/chapters/`, uses `Chapter`, `Prose`, `P`, `C` from `../layout`, `Figure` + controls from `../figure/*`, and `MathToggle`/`Eq`/`Code`. After each chapter: add it to `ShaderExplainer.tsx` (in order), run `pnpm lint && pnpm exec tsc --noEmit`, commit. Copy below is a draft in Ryan's voice — flag it for his edit at the checkpoint.

Shared canvas conventions for 2D figures:
- Canvas is `width: 100%`, fixed CSS height, `display: block`, `touchAction: 'none'`.
- Size via `useElementSize(wrapperRef)` → `prepareCanvas2D(canvas, w, h)` each draw.
- Clip-space ↔ CSS px: `px = (x + 1) / 2 * w`, `py = (1 - y) / 2 * h`.
- Colors from `tokens.ts` only. Accent = the subject; ink = structure; `FAINT` = history.

### Task 10: Hero — "go ahead, paint"

**File:** `chapters/Hero.tsx`

```tsx
'use client';
import { useRef } from 'react';
import { aboutFrames } from '@/components/story/storyData';
import { Figure, useFigureActive } from '../figure/Figure';
import { useReducedMotion } from '../hooks';
import { useRevealCanvas } from '../useRevealCanvas';

function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const active = useFigureActive();
  const reducedMotion = useReducedMotion();
  useRevealCanvas(canvasRef, { active, reducedMotion, panes: [{ view: 0 }] });
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9' }}>
      <img src={aboutFrames[0]} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none' }} />
      <canvas ref={canvasRef} aria-label="live reveal: move the pointer over the drawing to paint" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
    </div>
  );
}

export default function Hero() {
  return (
    <Figure number={1} caption="go ahead, paint. this is the same shader as the about page, running the same code.">
      <HeroCanvas />
    </Figure>
  );
}
```

Then a short lede under it (in `ShaderExplainer.tsx`, inside `<Prose>`):

> the effect looks like one thing, but it's really two small programs running on the gpu every frame, fed by a bit of math on the cpu. we'll build it up piece by piece: first the loop that remembers where you've been, then the brush, then the ink edge.

Figure numbering is manual: Hero = 1, Ch01 = 2 … Ch06 = 7.

### Task 11: Ch01 — "two passes and a feedback loop"

**File:** `chapters/Ch01Passes.tsx`

- **Idea (3 paragraphs):**
  1. a fragment shader can't remember anything between frames — every pixel is computed fresh. so the reveal keeps its memory in a texture: a grayscale **mask** where 1 means "revealed" and 0 means "hidden".
  2. each frame runs two passes. the **mask pass** reads last frame's mask, fades it a little, and paints the brush on top. the **display pass** uses the mask to decide where to show the colored drawing.
  3. a shader can't read and write the same texture at once, so there are two: read from a, write to b, then swap. that's called **ping-pong**.
- **Figure 2:** `useRevealCanvas` with `panes: [{ view: 0 }, { view: 1 }]`, `gap: 16`; wrapper is a 2-column grid (`gap: 16px`) where only the left cell has the `aboutFrames[0]` underlay; one canvas absolutely covers both cells. Labels above each pane in SANS 0.72rem: "what you see" / "the mask (red channel)". Below, an inline SVG (height 64, full width) showing two boxes `texture a` / `texture b` with arrows labelled `read` → `write`; while active and not reduced-motion, swap roles every 700ms (`setInterval`), with a MUTED note "slowed down — really 60–240× a second".
- **Caption:** "paint on either side. both panes read the same mask; the right one just draws it raw."
- **Controls:** none.
- **Math:**
  - `<Eq>{'maskₙ = max(maskₙ₋₁ − Δt/T, stroke)'}</Eq>`, explained in one sentence each for `Δt`, `T = 2.5s`.
  - `<Code label="blob pass · decay">{glslExcerpt(BLOB_FS, 'decay')}</Code>`
  - One sentence: the mask is stored at half resolution — it's a smooth field, so bilinear upsampling hides it and it costs a quarter of the fill rate.

### Task 12: Ch02 — "painting a stroke"

**File:** `chapters/Ch02Stroke.tsx`

- **Idea:**
  1. for every pixel, the mask pass asks one question: how far am i from the brush's path this frame? the path is a short polyline, so that's the distance to the nearest line segment.
  2. project the pixel onto the segment's line, clamp to the ends, measure. (show `t` as "how far along")
  3. turn distance into paint with `smoothstep`: solid near the middle, feathered at the rim. where segments overlap, take the **max** rather than adding — adding double-paints every joint, and those joints outlive the rest of the stroke as it fades, leaving a row of dots.
- **Figure 3 (2D canvas, 360px tall, + 240px side plot):**
  - State: points `A,B,C` (CSS px, init at 20%/60%, 50%/35%, 80%/60% of w/h), `radius` (slider 20–120, default 64), `combine: 'max' | 'add'` (Toggle), `probe` (pointer position or null), `drag` (index or null).
  - Pointer: `pointerdown` within 14px of a handle → `setPointerCapture`, drag it; `pointermove` updates probe/drag; `pointerleave` clears probe.
  - Draw (on any state change, via a `requestAnimationFrame`-coalesced redraw — no loop):
    1. Heatmap: cells of 5 CSS px; for each cell center compute `f1 = strokeFalloff(distToSegment(c, A, B).d, r)`, `f2` likewise for `B, C`; `f = combine === 'max' ? max(f1,f2) : f1 + f2`. Fill `ACCENT` with alpha `min(f,1)*0.85`; where `f > 1.001` fill `INK` at alpha `(f-1)*0.9` on top (over-painted).
    2. Segments: 1px `INK` lines A–B–C.
    3. Handles: 6px radius circles, `PAPER` fill, 1.5px `INK` stroke.
    4. Probe (if any): nearest segment by `d`; dashed 1px `INK` line from probe to closest point; 3px dot at closest point.
  - Side plot (SVG 240×140): curve `f(d)` for `d ∈ [0, 1.3r]`, x-axis in px, y in 0..1; faint vertical lines at `0.1r` and `r` labeled; accent dot at the probe's `(d, f)`.
  - Readouts (controls row): `Stat d`, `Stat t`, `Stat f`, and `Stat peak` = max f over the grid (shows `1.00` vs `~2.00`).
- **Caption:** "drag the points. hover to probe a pixel. switch to add and watch the joint double up."
- **Math:**
  - `<Eq>{'t = clamp( (p − a)·(b − a) / |b − a|² , 0, 1 )\nd = | p − (a + t(b − a)) |\nf = 1 − smoothstep(0.1r, r, d)'}</Eq>`
  - Note: the shader multiplies x by the aspect ratio first so distances are round, not stretched ovals.
  - `<Code label="blob pass · stroke">{glslExcerpt(BLOB_FS, 'stroke')}</Code>`

### Task 13: Ch03 — "smoothing the cursor"

**File:** `chapters/Ch03Smoothing.tsx`

- **Idea:**
  1. the browser only tells you where the pointer is once per frame. connect those samples with straight lines and fast strokes turn into polygons.
  2. so the brush doesn't sit on the pointer; it chases it. each frame it covers a fraction `k = 1 − e^(−λΔt)` of the gap. that exponent is what makes it frame-rate independent: two half-frames cover exactly as much as one full one.
  3. between frames the brush draws a **cubic hermite curve**: a curve defined by its two endpoints and the direction it's heading at each. if every segment starts in the direction the last one ended, the joins are invisible.
  4. the bug: i used to store last frame's end direction and reuse it as-is. after a long frame followed by a short one, that direction was far too big for the new segment, and the curve looped. the fix is to store velocity and scale it by *this* frame's Δt.
- **Figure 4 (2D canvas, 380px tall):**
  - Sim: own `createBrush(0.12)`; sim clock steps at `simHz` (slider 10–60, default 20) using a dt pattern: `even` → `1/simHz`; `uneven` → cycle `[2.2, 0.35, 1, 0.35, 1.8, 0.5] / simHz` (clamped to 0.05 like the site).
  - Input: pointer over canvas (clip space) → `pointerActive`; otherwise autopilot `x = 0.7 sin(1.3t), y = 0.55 sin(2.1t + 0.6)` unless reduced motion (then static until hovered).
  - Per sim frame: `stepBrush(brush, { …, follow, staleTangents: tangents === 'stale' })`; push `{ raw: pointer, brush: [x,y], path: Float32Array.from(brush.path) }` to a ring of 45.
  - Controls: `Toggle path: straight / hermite`, `Toggle tangents: velocity × Δt / stale (old bug)` (disabled look when path=straight), `Toggle timing: even / uneven`, `Slider follow λ 5–60 (default 25)`, `Slider frame rate 10–60`, `Stat k per frame` = `followFactor(1/simHz, λ).toFixed(2)`.
  - Draw each rAF (only while active): raw pointer samples as 2px `FAINT` dots joined by a 1px `FAINT` line; brush positions as 3px `ACCENT` dots; path as 2px `INK`: straight = polyline through brush positions, hermite = each entry's 13-point curve. Older entries fade: alpha `0.25 + 0.75 * (i / n)`.
- **Caption:** "move over the pad (or watch the autopilot). switch timing to uneven, then tangents to the old bug."
- **Math:**
  - `<Eq>{'k = 1 − e^(−λΔt)\np ← p + (target − p)·k'}</Eq>`
  - `<Eq>{'h(u) = (2u³−3u²+1)p₀ + (u³−2u²+u)m₀ + (−2u³+3u²)p₁ + (u³−u²)m₁\nm = v·Δt'}</Eq>`
  - One line: this part runs on the cpu in typescript; the 13 samples are uploaded as a uniform array.

### Task 14: Ch04 — "speed and dwell"

**File:** `chapters/Ch04Dwell.tsx`

- **Idea:**
  1. a brush that's the same size at every speed looks mechanical. this one thins out when you move fast (down to 70%) and swells back when you slow down.
  2. when you stop, it keeps adding a little paint each frame. the footprint's soft rim creeps past the edge threshold, so the reveal spreads outward like ink soaking in.
  3. both hang off one number, `speedT`: speed smoothstepped between 0.5 and 5 screen-heights per second.
- **Figure 5:** grid `1fr 220px`.
  - Left: canvas (16:9) showing a `createCpuMask(192, 108)` stepped each frame with `stepCpuMask` (strength slider value, dwell toggle → pass strength 0 when off). Render: offscreen 192×108 canvas → `putImageData` → `drawImage` scaled with smoothing on. View toggle `field` (mask as `ACCENT` alpha = value) / `reveal` (`ACCENT` where value > 0.15, else paper; plus `FAINT` field underneath).
  - Input: pointer, or autopilot that alternates 1.6s of fast figure-eight with 1.6s parked (so dwell build-up is visible without interaction); none under reduced motion.
  - Right: three stacked SVG sparklines (3s history, 180 samples): `speed` (0–8, dashed lines at 0.5 and 5), `radius` (0.7r–r), `dwell = 1 − speedT` (0–1). Accent line, INK axes labels in SANS 0.7rem.
  - Controls: `Toggle dwell build-up: on / off`, `Slider strength 0–0.3 (0.12)`, `Toggle view: field / reveal`.
- **Caption:** "move fast, then stop. with build-up off, a resting brush never spreads."
- **Math:**
  - `<Eq>{'speedT = smoothstep( (s − 0.5) / 4.5 )\nr = r₀ · (1 − 0.3·speedT)\nmask += f · strength · Δt·60 · (1 − speedT)'}</Eq>`
  - `<Code label="blob pass · dwell">{glslExcerpt(BLOB_FS, 'dwell')}</Code>`
  - Note: `Δt·60` makes "strength" mean "per 60Hz frame" on any display.

### Task 15: Ch05 — "the bug that only happened at 240hz"

**File:** `chapters/Ch05Precision.tsx`

- **Idea:**
  1. every frame, every pixel fades by `Δt / 2.5s`. at 60hz that's 0.0067, at 240hz it's 0.0017.
  2. an ordinary 8-bit texture stores values in steps of 1/255 ≈ 0.0039. write back `1 − 0.0017` and it rounds straight back to 1. on a 240hz monitor the reveal never faded. (and at 60hz it fades 15% too fast, because 1.7 steps rounds up to 2.)
  3. the fix is one line: store the mask as a 16-bit float (`R16F`), whose steps near 1 are ~0.0005.
- **Figure 6:** SVG (full width × 300). x: time 0–4s; y: value 0–1. Series from `simulateDecay(hz, 2.5, precision, 4)`: `ideal` (1px FAINT dashed), `r16f` (1.5px INK), `rgba8` (2px ACCENT, drawn as a step path). Right of chart: three 44px swatches labeled `ideal / r16f / rgba8` filled `rgba(200,65,43,value)` at the playhead time.
  - Playhead: vertical line sweeping 0→4s in 4s, looping, only while active and not reduced motion (reduced motion: parked at 1.5s, draggable by clicking the chart).
  - Controls: `Toggle refresh rate: 30 / 60 / 120 / 144 / 240`, `Toggle zoom: full / top 5%` (zoom = x 0–0.3s, y 0.95–1), `Stat per-frame fade` (`(1/hz/2.5).toFixed(4)`), `Stat 8-bit fades in` (`fadeTime(...)` → `"never"` or `"2.13s"`), `Stat half-float fades in`.
- **Caption:** "pick 240. the orange line never leaves the top."
- **Math:**
  - `<Eq>{'8-bit step = 1/255 ≈ 0.0039\nrounds away when Δt/T < 1/510  →  refresh > 510/T ≈ 204hz'}</Eq>`
  - `<Code label="blob pass · decay">{glslExcerpt(BLOB_FS, 'decay')}</Code>`
  - One line: webgl2 can render to `R16F` when `EXT_color_buffer_float` is available; the site falls back to RGBA8 otherwise.

### Task 16: Ch06 — "the ink edge"

**File:** `chapters/Ch06Edge.tsx`

- **Idea:**
  1. a hard threshold on the mask gives you clean circles. real ink bleeds unevenly into paper, so the edge gets noise.
  2. **value noise**: random numbers on a grid, smoothly blended between. one layer looks like blobs. **fbm** stacks layers, each twice as fine and half as strong, until it looks organic.
  3. the noise nudges the mask up or down before the threshold: `field = mask + (n − 0.5)·amp`. the edge is wherever `field` crosses 0.15. keep `0.15 − amp/2 > 0` or empty paper starts showing through.
  4. last, antialiasing: `fwidth` tells the shader how much `field` changes across one screen pixel, so the edge is always ~1.5px soft — whether the blob is fresh and steep or fading and shallow.
- **Figure 7:** `useRevealCanvas` single pane over `aboutFrames[0]` underlay (16:9), `edge` from state, `autopilot` = slow circle `x = 0.45 cos(0.6t), y = 0.4 sin(0.6t)`. Right of it (grid `1fr 200px`): a 200×200 **loupe** canvas; `afterDraw` copies a 20×20 device-px region around the brush (or pointer) with `imageSmoothingEnabled = false` over a PAPER fill and the underlay image region (the pane is 16:9 like the image, so map proportionally).
  - Controls: `Toggle octaves: 0 / 1 / 2 / 3 / 4` (default 4), `Slider threshold 0.02–0.5 (0.15)`, `Slider noise 0–0.3 (0.14)`, `Toggle view: composite / field` (`view` 0 / 2), `Toggle antialiasing: on / off` (softness 1.5 / 0).
  - Warning line (MUTED italic, shown when `threshold − noise/2 ≤ 0`): "the noise can now push empty paper past the threshold — see the speckles?"
- **Caption:** "add octaves one at a time. turn antialiasing off and look in the loupe."
- **Math:**
  - `<Eq>{'fbm(p) = Σᵢ 0.5ⁱ·noise(2.03ⁱ p) / Σᵢ 0.5ⁱ\nfield = mask + (fbm − 0.5)·amp\nw = 1.5·fwidth(field)\nreveal = smoothstep(0.15 − w, 0.15 + w, field)'}</Eq>`
  - `<Code label="display pass · fbm">{glslExcerpt(DISPLAY_FS, 'fbm')}</Code>`
  - `<Code label="display pass · edge">{glslExcerpt(DISPLAY_FS, 'edge')}</Code>`

### Task 17: Outro + assemble

**File:** `chapters/Outro.tsx`, and wire all chapters into `ShaderExplainer.tsx` in order: title block → Hero + lede → Ch01 → Ch02 → Ch03 → Ch04 → Ch05 → Ch06 → Outro.

Outro (Prose, ends with a hairline rule and SANS links):

> that's the whole thing: two passes, one texture that remembers, a brush that chases, and some noise at the edge. about 150 lines of glsl.
>
> _[ryan: a sentence or two on what you'd try next — leave as a placeholder]_

Links: `source on github →` → `https://github.com/minjunminji/mywebsite/blob/main/src/components/reveal/shaders.ts` (opens new tab, `rel="noopener noreferrer"`), and `back to the site` (button calling `onClose`; pass `onClose` into `Outro`).

**Verify:** `pnpm test && pnpm lint && pnpm build` — all pass.

**Commit:** one per chapter as you go (e.g. `git commit -m "Explainer: ch02 painting a stroke"`), and a final `git commit -m "Explainer: outro and assembly"`.

### CHECKPOINT 3 — final handoff to Ryan

- [ ] Open/close/Esc/focus as in checkpoint 2, now with full content.
- [ ] Scroll: top fade appears once scrolled; figures only animate when on screen (CPU idle when parked on text — check Activity Monitor or DevTools performance).
- [ ] Fig 1 paints like the about page.
- [ ] Fig 2: painting either pane shows up in both; ping-pong diagram swaps.
- [ ] Fig 3: handles drag; probe readouts sane; add mode doubles the joint.
- [ ] Fig 4: uneven timing + stale tangents produces loops; velocity × Δt doesn't.
- [ ] Fig 5: resting spreads the reveal; build-up off doesn't; sparklines move.
- [ ] Fig 6: 240 → orange line flat; 60 → orange fades early.
- [ ] Fig 7: octaves change the edge; low threshold + high noise speckles; AA off is jagged in the loupe.
- [ ] Every "show the math" expands/collapses; GLSL matches the real shader.
- [ ] Reduced motion (System Settings → Accessibility → Display → Reduce motion): nothing autoplays; figures still respond to input.
- [ ] Copy is Ryan's voice — edit the drafts, fill in the outro placeholder.
- [ ] About-page reveal is still unchanged.
