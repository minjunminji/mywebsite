// Pure cursor math — no React, no DOM, no rAF (so it is unit-testable and
// deterministic). The component layer drives these each frame; this module only
// advances a spring and remaps numbers.

/** One springable scalar (a value chasing a target with its own velocity). */
export type Spring = { value: number; velocity: number };

export type PinnedTargetState = {
  connected: boolean;
  inert: boolean;
  pointerInside: boolean;
};

/** A pinned cursor must release when its control leaves the live interaction
 * tree, including when a full-screen takeover makes that control inert. */
export function shouldReleasePinnedTarget(state: PinnedTargetState): boolean {
  return !state.connected || state.inert || !state.pointerInside;
}

/**
 * Advance a spring one frame with a leaky integrator (slight elastic overshoot).
 * Pure-ish: mutates the passed spring in place, no other side effects.
 *
 * `stiffness` and `damping` are per-frame constants at 60Hz. Use stepSpringDt to
 * advance by real elapsed time so the feel is the same at any refresh rate.
 */
export function stepSpring(spring: Spring, target: number, stiffness: number, damping: number) {
  spring.velocity += (target - spring.value) * stiffness;
  spring.velocity *= damping;
  spring.value += spring.velocity;
}

/** The frame length (ms) the per-frame spring constants were tuned at (60Hz). */
export const SPRING_FRAME_MS = 1000 / 60;
/** Longest gap one call integrates. A longer stall (GC, tab restore) is clamped
 *  so the spring doesn't leap. */
const MAX_SPRING_DT_MS = 64;

/**
 * Advance a spring by `dtMs` of real time using the 60Hz-tuned constants, landing
 * exactly on the trajectory stepSpring traces at 60Hz. A 16.7ms call equals one
 * stepSpring, two 8.3ms calls (120Hz) equal it too, and a dropped frame catches
 * up instead of slowing the animation down.
 *
 * One stepSpring is linear in (offset from target, velocity):
 *   M = [[1 − dk, d], [−dk, d]]   (d = damping, k = stiffness)
 * so advancing f frames is M^f. For a 2×2 matrix M^f = a·I + b·M, with a and b
 * from M's eigenvalues (complex for a bouncy spring, real for an overdamped one).
 */
export function stepSpringDt(spring: Spring, target: number, stiffness: number, damping: number, dtMs: number) {
  const f = Math.min(Math.max(dtMs, 0), MAX_SPRING_DT_MS) / SPRING_FRAME_MS;
  if (f === 0) return;

  const d = damping;
  const dk = damping * stiffness;
  const m11 = 1 - dk;
  const m12 = d;
  const m21 = -dk;
  const m22 = d;
  const trace = m11 + m22;
  const det = d; // (1 − dk)·d + dk·d
  const disc = trace * trace - 4 * det;

  let a: number;
  let b: number;
  if (disc < -1e-12) {
    // Underdamped: eigenvalues r·e^(±iθ).
    const r = Math.sqrt(det);
    const theta = Math.acos(trace / (2 * r));
    const sinTheta = Math.sin(theta);
    a = (Math.pow(r, f) * Math.sin((1 - f) * theta)) / sinTheta;
    b = (Math.pow(r, f - 1) * Math.sin(f * theta)) / sinTheta;
  } else if (disc > 1e-12) {
    // Overdamped: two real eigenvalues.
    const s = Math.sqrt(disc);
    const l1 = (trace + s) / 2;
    const l2 = (trace - s) / 2;
    if (l2 <= 0) {
      // A negative eigenvalue has no real fractional power (the discrete spring
      // flips sign every frame). Not reachable with sane constants; fall back to
      // whole frames.
      for (let i = Math.round(f); i > 0; i -= 1) stepSpring(spring, target, stiffness, damping);
      return;
    }
    const p1 = Math.pow(l1, f);
    const p2 = Math.pow(l2, f);
    b = (p1 - p2) / (l1 - l2);
    a = (l1 * p2 - l2 * p1) / (l1 - l2);
  } else {
    // Critically damped: one repeated eigenvalue.
    const l = trace / 2;
    b = f * Math.pow(l, f - 1);
    a = Math.pow(l, f) - b * l;
  }

  const x = spring.value - target;
  const v = spring.velocity;
  spring.value = target + a * x + b * (m11 * x + m12 * v);
  spring.velocity = a * v + b * (m21 * x + m22 * v);
}

/**
 * How much of the full wrap "inflation" a target of this size gets, 0..1-ish.
 * Targets whose shorter side is at least `fullSize` get 1 (full pad + full
 * smooth-min bulge); smaller ones scale down linearly, floored at `minScale`,
 * so tiny icon buttons get a snug blob instead of one twice their size.
 */
export function wrapScaleForTarget(width: number, height: number, fullSize: number, minScale: number): number {
  const side = Math.min(width, height);
  if (!(side > 0) || !(fullSize > 0)) return minScale;
  return Math.min(1, Math.max(minScale, side / fullSize));
}
