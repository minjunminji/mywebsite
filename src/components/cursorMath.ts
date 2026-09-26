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
 * Note: these springs are tuned per-frame for ~60Hz with no dt-scaling, so they
 * settle faster on 120–144Hz displays. Intended, not a bug.
 */
export function stepSpring(spring: Spring, target: number, stiffness: number, damping: number) {
  spring.velocity += (target - spring.value) * stiffness;
  spring.velocity *= damping;
  spring.value += spring.velocity;
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
