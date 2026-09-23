// Timing shared by StoryNav's dock choreography and the player's ink sweep.
// Docking: the bar glides to the corner, then its connector lines draw in.
// Undocking runs the same two beats in reverse.
export const NAV_GLIDE_MS = 600;
export const NAV_DRAW_MS = 300;
export const NAV_ASSEMBLY_MS = NAV_GLIDE_MS + NAV_DRAW_MS;

// Map elapsed time in a transition to 0..1 sweep progress, holding at 0 for
// the first `holdStartMs` and arriving at 1 `holdEndMs` before the end.
export function fillWindowT(
  elapsedMs: number,
  totalMs: number,
  holdStartMs: number,
  holdEndMs: number,
): number {
  const span = Math.max(totalMs - holdStartMs - holdEndMs, 1);
  return Math.max(0, Math.min(1, (elapsedMs - holdStartMs) / span));
}
