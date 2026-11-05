// The piano player's living outline: one pencil line around the tab and the
// video, re-wobbled a few times a second like the cursor. Pure geometry — the
// player measures its own layout and passes it in, so this stays testable.

import type { Rect } from './pianoGeometry';

export type Pt = readonly [number, number];
type Radii = { tl: number; tr: number; br: number; bl: number };

/** What the outline wraps, in window coords (origin = the tab's top-left). */
export type OutlineLayout = {
  /** The tab's right edge. Grows to the window's width while the hint is out. */
  tabRight: number;
  tabHeight: number;
  /** The video frame's live rect (it eases between expanded and collapsed). */
  frame: Rect;
  /** 0 = expanded, 1 = collapsed. */
  collapse: number;
  /** Corner radius of the window's outer corners. */
  radius: number;
};

/** Grid step (px) for tracing the outline. Smaller is smoother and slower. */
const CELL = 2;
/** How far the tab reaches down into the video, so the two overlap instead of
 *  merely touching (a shared edge would trace as two separate shapes). */
const TAB_OVERLAP = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Rounded box with a radius per corner; `x, y` is its top-left. */
function sdRoundBox(px: number, py: number, x: number, y: number, w: number, h: number, r: Radii) {
  const dx = px - (x + w / 2);
  const dy = py - (y + h / 2);
  const rr = dx > 0 ? (dy < 0 ? r.tr : r.br) : dy < 0 ? r.tl : r.bl;
  const qx = Math.abs(dx) - w / 2 + rr;
  const qy = Math.abs(dy) - h / 2 + rr;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - rr;
}

/** Signed distance to the window shape: tab ∪ video, plus the concave fillet
 *  where the tab's right wall meets the video's top edge (negative inside). */
export function outlineSdf(px: number, py: number, l: OutlineLayout): number {
  const { frame: f, collapse: c, radius: R } = l;
  // How much of the video's top edge is left of the tab's wall. The hint pulls
  // the wall out toward the video's right edge, so the video's corner squares
  // off and the fillet shrinks to nothing as the wall arrives.
  const gap = f.left + f.width - l.tabRight;
  const vidTr = R * clamp(gap / R, 0, 1);
  const fillet = clamp(gap - vidTr, 0, R) * (1 - c);

  const tab = sdRoundBox(px, py, 0, 0, l.tabRight, l.tabHeight + TAB_OVERLAP * (1 - c), {
    tl: R,
    tr: R * (1 - c),
    br: 0,
    bl: R * c,
  });
  const video = sdRoundBox(px, py, f.left, f.top, f.width, f.height, {
    tl: 0,
    tr: c > 0 ? R : vidTr,
    br: R,
    bl: R * (1 - c),
  });
  let d = Math.min(tab, video);
  if (fillet > 0.5) {
    const cx = l.tabRight;
    const cy = f.top;
    const square = Math.max(Math.max(cx - px, px - (cx + fillet)), Math.max(cy - fillet - py, py - cy));
    d = Math.min(d, Math.max(square, fillet - Math.hypot(px - (cx + fillet), py - (cy - fillet))));
  }
  return d;
}

/**
 * Traces the zero contour of `sdf` over `bounds` (marching squares) and returns
 * the longest closed loop, in order. The grid is offset half a cell so samples
 * never land exactly on an edge.
 */
export function traceLoop(sdf: (x: number, y: number) => number, bounds: Rect): Pt[] {
  const x0 = bounds.left + CELL / 4;
  const y0 = bounds.top + CELL / 4;
  const nx = Math.ceil(bounds.width / CELL) + 1;
  const ny = Math.ceil(bounds.height / CELL) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = sdf(x0 + i * CELL, y0 + j * CELL);

  // A crossing is keyed by its grid edge: o = 0 horizontal, 1 vertical.
  const points = new Map<number, Pt>();
  const links = new Map<number, number[]>();
  const edge = (o: number, i: number, j: number) => {
    const k = (j * nx + i) * 2 + o;
    if (!points.has(k)) {
      const a = v[j * nx + i];
      const b = o === 0 ? v[j * nx + i + 1] : v[(j + 1) * nx + i];
      const s = a / (a - b);
      points.set(k, o === 0 ? [x0 + (i + s) * CELL, y0 + j * CELL] : [x0 + i * CELL, y0 + (j + s) * CELL]);
    }
    return k;
  };
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c =
        (v[j * nx + i] < 0 ? 8 : 0) |
        (v[j * nx + i + 1] < 0 ? 4 : 0) |
        (v[(j + 1) * nx + i + 1] < 0 ? 2 : 0) |
        (v[(j + 1) * nx + i] < 0 ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = () => edge(0, i, j);
      const B = () => edge(0, i, j + 1);
      const L = () => edge(1, i, j);
      const Rt = () => edge(1, i + 1, j);
      switch (c) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), Rt()); break;
        case 3: case 12: link(L(), Rt()); break;
        case 4: case 11: link(T(), Rt()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(L(), T()); break;
        case 5: link(L(), T()); link(B(), Rt()); break;
        case 10: link(T(), Rt()); link(L(), B()); break;
      }
    }
  }

  const seen = new Set<number>();
  let best: Pt[] = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: Pt[] = [];
    let prev = -1;
    let cur: number | undefined = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(points.get(cur)!);
      const nb: number[] = links.get(cur)!;
      const next: number | undefined = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
    }
    if (loop.length > best.length) best = loop;
  }
  return best;
}

// Value noise, same recipe as the cursor shader's.
const fract = (x: number) => x - Math.floor(x);
function hash(x: number, y: number) {
  x = fract(x * 123.34);
  y = fract(y * 345.45);
  const d = x * (x + 34.345) + y * (y + 34.345);
  return fract((x + d) * (y + d));
}
export function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * ux;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * ux;
  return top + (bottom - top) * uy;
}

/** Pushes each point along the loop's normal by up to ±(amp + fineAmp)/2 px of
 *  noise. `seed` re-rolls the noise; the same seed always gives the same line. */
export function wobbleLoop(loop: readonly Pt[], seed: number, amp: number, fineAmp: number): Pt[] {
  const n = loop.length;
  const sx = seed * 17.31;
  const sy = seed * 9.13;
  return loop.map(([x, y], k) => {
    const a = loop[(k - 2 + n) % n];
    const b = loop[(k + 2) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / len;
    const ty = (b[1] - a[1]) / len;
    const d =
      (noise(x * 0.07 + sx, y * 0.07 + sy) - 0.5) * amp +
      (noise(x * 0.21 + sx * 1.7, y * 0.21 + sy * 1.7) - 0.5) * fineAmp;
    return [x - ty * d, y + tx * d] as const;
  });
}

/** The loop as a CSS `clip-path` for an element whose top-left sits at `origin`. */
export function clipPathFor(loop: readonly Pt[], origin: { x: number; y: number }): string {
  const d = loop.map(([x, y]) => `${(x - origin.x).toFixed(1)} ${(y - origin.y).toFixed(1)}`).join('L');
  return `path("M${d}Z")`;
}
