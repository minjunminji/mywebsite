// Pure geometry and formatting for the floating piano player. No React, no DOM
// reads — callers pass in measured rects so all of this stays testable.

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Viewport = { width: number; height: number };

/** The subset of DOMRect we actually need from a measured element. */
export type Rect = { left: number; top: number; width: number; height: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Keeps the whole window inside the viewport with `margin` px of breathing room
 * on every edge.
 *
 * When the window is larger than the viewport the two edges can't both be
 * satisfied, and the lower bound wins — the top-left corner is where the header
 * and all its controls live, so that's the half worth keeping reachable.
 */
export function clampToViewport(
  pos: Point,
  size: Size,
  viewport: Viewport,
  margin: number,
): Point {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: clamp(pos.x, margin, maxX),
    y: clamp(pos.y, margin, maxY),
  };
}

/**
 * Where the window lands when summoned from the trigger word: its top-left
 * corner sits at the word's bottom-left, so the word appears to rest on the
 * corner and the window unfolds down-and-right from it.
 *
 * The about copy is vertically centred and "piano" sits on its last line, so on
 * a short viewport the word is low enough to push the window off the bottom —
 * hence the clamp.
 */
export function spawnPosition(
  anchor: Rect,
  size: Size,
  viewport: Viewport,
  margin: number,
): Point {
  return clampToViewport(
    { x: anchor.left, y: anchor.top + anchor.height },
    size,
    viewport,
    margin,
  );
}

/**
 * Seconds to `m:ss`. No hours field — the recording is ~18 minutes.
 *
 * getCurrentTime() returns NaN before the player is ready, so anything that
 * isn't a positive finite number renders as 0:00 rather than leaking junk into
 * the header.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Pointer x over the scrub track, as a 0..1 fraction of the track's width. */
export function scrubFraction(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
): number {
  if (trackWidth <= 0) return 0;
  return clamp((clientX - trackLeft) / trackWidth, 0, 1);
}
