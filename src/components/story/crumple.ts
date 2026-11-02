// The project media's entrance: a sheet that starts as a small crumpled ball
// and unfolds unevenly into its frame (and the reverse to leave). Pure
// geometry; the frame component draws it. Ported from the approved prototype,
// docs/plans/2026-11-01-project-reading-prototype.html ("bloom").

import type { Pt } from '@/components/piano/sketchOutline';

/** Points every ~3px clockwise around a w×h rounded rect, from its top-left. */
export function roundRectLoop(w: number, h: number, r: number): Pt[] {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const pts: Pt[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 3));
    for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]);
  };
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i < 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  line(rr, 0, w - rr, 0);
  arc(w - rr, rr, -Math.PI / 2);
  line(w, rr, w, h - rr);
  arc(w - rr, h - rr, 0);
  line(w - rr, h, rr, h);
  arc(rr, h - rr, Math.PI / 2);
  line(0, h - rr, 0, rr);
  arc(rr, rr, Math.PI);
  return pts;
}

/** One random crumple. A fresh one per entrance, so no two look alike. */
export type Crumple = {
  /** Angular facets around the edge, -1..1, read piecewise-linearly. */
  jag: readonly number[];
  /** How late each part of the edge opens, 0..1, read smoothly. */
  lag: readonly number[];
  /** Starting tilt, degrees. */
  rot: number;
  /** Crease lines across the sheet, in 0..1 of its width and height. */
  creases: readonly (readonly [number, number, number, number])[];
};

export function newCrumple(random: () => number = Math.random): Crumple {
  const edge = () => (random() < 0.5 ? 0 : 1);
  return {
    jag: Array.from({ length: 9 }, () => random() * 2 - 1),
    lag: Array.from({ length: 6 }, () => random()),
    rot: (random() < 0.5 ? -1 : 1) * (8 + random() * 8),
    creases: Array.from({ length: 5 }, () => [random(), edge(), random(), 1 - edge()] as const),
  };
}

/** Progress → how unfolded: holds crumpled for a beat, opens, eases flat. */
export function unfold(progress: number): number {
  const x = Math.min(Math.max(progress, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const facet = (values: readonly number[], u: number) => {
  const n = values.length;
  const x = u * n;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return values[i] + (values[(i + 1) % n] - values[i]) * f;
};
const smooth = (values: readonly number[], u: number) => {
  const n = values.length;
  const x = u * n;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return values[i] + (values[(i + 1) % n] - values[i]) * f * f * (3 - 2 * f);
};

/** Late-opening parts of the edge start up to this far tucked toward the middle. */
const MAX_PULL = 0.7;
/** Facet depth at fully crumpled, as a fraction of the sheet's height. */
const MAX_JAG = 0.34;

/**
 * The sheet's outline at unfold amount `e` (0 crumpled, 1 flat): the clean
 * `base` loop of a w×h sheet, with its late parts pulled in and its edge
 * folded into facets, both relaxing to nothing as it flattens.
 */
export function crumpleLoop(base: readonly Pt[], crumple: Crumple, e: number, w: number, h: number): Pt[] {
  const loose = 1 - Math.min(Math.max(e, 0), 1);
  if (loose === 0) return base.slice();
  const cx = w / 2;
  const cy = h / 2;
  const n = base.length;
  return base.map(([x, y], k) => {
    const a = base[(k - 2 + n) % n];
    const b = base[(k + 2) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // Outward normal of a clockwise loop (y down).
    const nx = (b[1] - a[1]) / len;
    const ny = -(b[0] - a[0]) / len;
    const u = (Math.atan2((y - cy) / h, (x - cx) / w) + Math.PI) / (2 * Math.PI);
    const pull = MAX_PULL * Math.pow(loose, 1.1) * smooth(crumple.lag, u);
    const jag = MAX_JAG * h * Math.pow(loose, 1.4) * facet(crumple.jag, u);
    return [cx + (x - cx) * (1 - pull) + nx * jag, cy + (y - cy) * (1 - pull) + ny * jag] as const;
  });
}

/** The whole sheet's tilt (degrees) and scale at unfold amount `e`. */
export function crumpleTransform(crumple: Crumple, e: number): { rotate: number; scale: number } {
  const k = Math.min(Math.max(e, 0), 1);
  return { rotate: crumple.rot * (1 - k), scale: 0.14 + 0.86 * k };
}

/** How visible the creases are at unfold amount `e`: gone once flat. */
export function creaseOpacity(e: number): number {
  return Math.pow(1 - Math.min(Math.max(e, 0), 1), 1.1);
}
