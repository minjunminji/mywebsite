// Pure decryption timing — no React, no rAF, no Math.random (so it is testable
// and deterministic). The hook layer supplies the clock; this decides what each
// character renders at a given time.

export const SCRAMBLE_CHARS =
  '!<>-_\\/[]{}=+*^?#$%&ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Deterministic glyph from an integer seed (xorshift spread so sequential seeds
// don't return adjacent chars).
export function scrambleGlyph(seed: number): string {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return SCRAMBLE_CHARS[x % SCRAMBLE_CHARS.length];
}

// Ripple: ms before a monospace cell (col,row) resolves, given the wave origin
// cell, the cell dimensions (px), and the wave speed (px/ms). Euclidean → circular.
export function rippleDelayMs(
  col: number,
  row: number,
  originCol: number,
  originRow: number,
  cellW: number,
  lineH: number,
  speedPxPerMs: number,
): number {
  const dx = (col - originCol) * cellW;
  const dy = (row - originRow) * lineH;
  return Math.hypot(dx, dy) / Math.max(speedPxPerMs, 1e-6);
}

// Scan: ms before a char resolves — left-to-right with a per-line stagger.
export function scanDelayMs(
  charIndex: number,
  lineIndex: number,
  perCharMs: number,
  perLineStaggerMs: number,
): number {
  return lineIndex * perLineStaggerMs + charIndex * perCharMs;
}

// What one character renders at time t. Spaces stay spaces (so word shape reads
// through the scramble); resolved chars show their final glyph; otherwise a
// scramble glyph that cycles every `cycleMs`.
export function displayChar(
  finalChar: string,
  t: number,
  delay: number,
  positionSeed: number,
  cycleMs = 45,
): string {
  if (finalChar === ' ') return ' ';
  if (t >= delay) return finalChar;
  const bucket = Math.floor(t / cycleMs);
  return scrambleGlyph(positionSeed * 131 + bucket);
}

// Render a whole line at time t against its per-character delays.
export function renderLine(
  text: string,
  delays: number[],
  t: number,
  lineSeed: number,
  cycleMs?: number,
): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    out += displayChar(text[i], t, delays[i] ?? 0, lineSeed * 977 + i, cycleMs);
  }
  return out;
}
