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
