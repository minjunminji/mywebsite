import { describe, expect, it } from 'vitest';
import {
  SCRAMBLE_CHARS,
  scrambleGlyph,
  rippleDelayMs,
  scanDelayMs,
  displayChar,
  renderLine,
} from './decrypt';

describe('scrambleGlyph', () => {
  it('is deterministic and always within the charset', () => {
    for (let s = 0; s < 200; s += 1) {
      const g = scrambleGlyph(s);
      expect(SCRAMBLE_CHARS).toContain(g);
      expect(scrambleGlyph(s)).toBe(g); // stable
    }
  });
});

describe('rippleDelayMs', () => {
  it('is zero at the origin and grows with distance', () => {
    expect(rippleDelayMs(3, 2, 3, 2, 10, 20, 1)).toBe(0);
    const near = rippleDelayMs(4, 2, 3, 2, 10, 20, 1);
    const far = rippleDelayMs(9, 2, 3, 2, 10, 20, 1);
    expect(far).toBeGreaterThan(near);
  });
});

describe('scanDelayMs', () => {
  it('increases left-to-right and line-by-line', () => {
    expect(scanDelayMs(0, 0, 8, 120)).toBe(0);
    expect(scanDelayMs(5, 0, 8, 120)).toBe(40);
    expect(scanDelayMs(0, 1, 8, 120)).toBe(120);
  });
});

describe('displayChar', () => {
  it('keeps spaces as spaces', () => {
    expect(displayChar(' ', 0, 999, 1)).toBe(' ');
  });
  it('shows the final char once resolved (t >= delay)', () => {
    expect(displayChar('a', 100, 100, 1)).toBe('a');
    expect(displayChar('a', 250, 100, 1)).toBe('a');
  });
  it('shows a scramble glyph before resolving', () => {
    const g = displayChar('a', 0, 100, 1);
    expect(g).not.toBe('a');
    expect(SCRAMBLE_CHARS).toContain(g);
  });
});

describe('renderLine', () => {
  it('fully resolves when t exceeds all delays', () => {
    const text = 'hello world';
    const delays = text.split('').map((_, i) => i * 10);
    expect(renderLine(text, delays, 10_000, 0)).toBe(text);
  });
  it('preserves length while scrambling', () => {
    const text = 'abc def';
    const delays = text.split('').map(() => 1000);
    expect(renderLine(text, delays, 0, 0)).toHaveLength(text.length);
  });
});
