// Pure cursor math — no React, no DOM, no rAF (so it is unit-testable and
// deterministic). The component layer drives these each frame; this module only
// advances a spring and remaps numbers.

/** One springable scalar (a value chasing a target with its own velocity). */
export type Spring = { value: number; velocity: number };

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
 * Clamped linear remap: map `value` from [inMin, inMax] onto [outMin, outMax],
 * clamping the normalized input to [0, 1] first so the output never leaves its
 * range. Mirrors framer-motion's `transform()` clamp the reference relies on.
 */
export function remapClamped(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = Math.min(1, Math.max(0, (value - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}
