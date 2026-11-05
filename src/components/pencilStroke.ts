// The living line's pencil stroke on a 2D canvas: white with speckled alpha so
// it reads drawn rather than vector. Shared by the piano player's outline, the
// project media frame and the experience line.

import type { Pt } from '@/components/piano/sketchOutline';
import { INK } from '@/theme';

/** Strokes `loop` (closed unless `closed` is false, for an open line). */
export type PencilStroke = (loop: readonly Pt[], seed: number, lineWidth: number, closed?: boolean) => void;

/** A stroker for `ctx`. The grain shifts with `seed`, so it boils with the line. */
export function createPencilStroke(ctx: CanvasRenderingContext2D): PencilStroke {
  const grain = document.createElement('canvas');
  grain.width = grain.height = 64;
  const gctx = grain.getContext('2d');
  if (gctx) {
    const img = gctx.createImageData(64, 64);
    for (let i = 0; i < 64 * 64; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(255 * (0.72 + 0.28 * Math.random()));
    }
    gctx.putImageData(img, 0, 0);
  }
  const pattern = ctx.createPattern(grain, 'repeat');

  return (loop, seed, lineWidth, closed = true) => {
    ctx.beginPath();
    loop.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (closed) ctx.closePath();
    pattern?.setTransform(new DOMMatrix().translate((seed * 23) % 64, (seed * 41) % 64));
    ctx.strokeStyle = pattern ?? INK;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
}
