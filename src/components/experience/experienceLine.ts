// Pure logic for the experience line: where the stations sit, how wheel input
// turns into one stop per gesture, and the open pencil line the map is drawn
// with. No React, no DOM.

import { noise, type Pt } from '../piano/sketchOutline';

/* ---- Layout ------------------------------------------------------------- */

/** The line's top, px from the top of the section (clear of the nav). */
const LINE_TOP = 140;
/** Room under the line for the "now" label. */
const LINE_BOTTOM_GAP = 110;
/** The first station sits this far below the line's top. */
const FIRST_STATION_GAP = 36;
/** The last station sits this far above the "now" terminus. */
const LAST_STATION_GAP = 80;
/** The line's x, as a fraction of the section's width (the left half's middle). */
const LINE_X = 0.25;

export type LineLayout = {
  x: number;
  top: number;
  /** The "now" terminus. */
  bottom: number;
  /** Each station's y, evenly spaced, oldest first. */
  stations: readonly number[];
};

/** Where the line and its `count` evenly spaced stations sit in a w×h section. */
export function lineLayout(width: number, height: number, count: number): LineLayout {
  const top = LINE_TOP;
  const bottom = Math.max(top + 240, height - LINE_BOTTOM_GAP);
  const first = top + FIRST_STATION_GAP;
  const last = bottom - LAST_STATION_GAP;
  const stations = Array.from({ length: count }, (_, i) =>
    count === 1 ? first : first + ((last - first) * i) / (count - 1),
  );
  return { x: Math.round(width * LINE_X), top, bottom, stations };
}

/* ---- Stepping ----------------------------------------------------------- */

/** Wheel travel that moves one stop. */
export const STEP_PX = 60;
/** After a step, the wheel has to go quiet this long before it can step again. */
const QUIET_MS = 180;
/** ...and the lock holds at least this long, whatever the wheel does. */
const MIN_LOCK_MS = 450;
/** Travel that sits unused this long is forgotten. */
const RESET_MS = 300;

export type WheelGate = { acc: number; last: number; locked: boolean; lockedAt: number };
export const OPEN_GATE: WheelGate = { acc: 0, last: -Infinity, locked: false, lockedAt: 0 };

/**
 * One wheel event through the one-gesture-one-stop gate. Travel adds up until
 * it passes STEP_PX, which steps once and locks the gate. While locked, events
 * are swallowed (and keep it locked) until the wheel has been quiet for
 * QUIET_MS and MIN_LOCK_MS have passed, so a trackpad's momentum tail can't
 * carry the train past the next stop.
 */
export function gateWheel(gate: WheelGate, deltaPx: number, now: number): { gate: WheelGate; step: -1 | 0 | 1 } {
  let g = gate;
  if (g.locked) {
    if (now - g.last > QUIET_MS && now - g.lockedAt > MIN_LOCK_MS) g = { ...g, locked: false };
    else return { gate: { ...g, last: now }, step: 0 };
  }
  const acc = (now - g.last > RESET_MS ? 0 : g.acc) + deltaPx;
  if (Math.abs(acc) >= STEP_PX) {
    return { gate: { acc: 0, last: now, locked: true, lockedAt: now }, step: acc > 0 ? 1 : -1 };
  }
  return { gate: { ...g, acc, last: now }, step: 0 };
}

/** A stop index kept on the line. */
export const clampStop = (index: number, count: number): number => Math.min(Math.max(index, 0), count - 1);

/* ---- Motion ------------------------------------------------------------- */

/** Eases `current` toward `target` over roughly `tauMs`; lands exactly once close. */
export function easeToward(current: number, target: number, dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return target;
  const next = current + (target - current) * Math.min(1, dtMs / tauMs);
  return Math.abs(target - next) < 0.5 ? target : next;
}

/** How far the line has drafted itself in, 0..1, `t` ms into a `duration` draft. */
export function draftProgress(t: number, duration: number): number {
  const x = Math.min(Math.max(t / duration, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/* ---- The pencil line ------------------------------------------------------ */

/**
 * An open line through `pts`, resampled every `step` px and pushed along its
 * normal by up to ±(amp + fineAmp)/2 px of noise, so it boils like the
 * cursor's and the piano player's outline. `seed` re-rolls the noise; the same
 * seed always gives the same line.
 */
export function wobbleLine(pts: readonly Pt[], seed: number, amp: number, fineAmp: number, step = 5): Pt[] {
  const out: Pt[] = [];
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = out.length ? 1 : 0; k <= n; k++) {
      const t = k / n;
      const s = along + len * t;
      const d =
        (noise(s * 0.045 + seed * 17.31, seed * 9.13) - 0.5) * amp +
        (noise(s * 0.17 + seed * 29.7, seed * 3.1 + 7.7) - 0.5) * fineAmp;
      out.push([ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d]);
    }
    along += len;
  }
  return out;
}

/** Points around a circle, for a station ring to wobble. */
export function circleLoop(cx: number, cy: number, r: number, points = 18): Pt[] {
  return Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
  });
}
