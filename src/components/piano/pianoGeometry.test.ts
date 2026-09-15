import { describe, expect, it } from 'vitest';
import {
  clampToViewport,
  formatTime,
  scrubFraction,
  spawnPosition,
  type Rect,
  type Size,
  type Viewport,
} from './pianoGeometry';

const VIEWPORT: Viewport = { width: 1440, height: 900 };
const WINDOW: Size = { width: 400, height: 265 };
const MARGIN = 12;

describe('clampToViewport', () => {
  it('leaves a window that already fits well inside untouched', () => {
    expect(clampToViewport({ x: 300, y: 200 }, WINDOW, VIEWPORT, MARGIN)).toEqual({
      x: 300,
      y: 200,
    });
  });

  it('pulls a window back in when it overhangs the right edge', () => {
    const { x } = clampToViewport({ x: 1300, y: 200 }, WINDOW, VIEWPORT, MARGIN);
    // 1440 - 400 - 12 = 1028
    expect(x).toBe(1028);
  });

  it('shifts a window up when it overhangs the bottom edge', () => {
    const { y } = clampToViewport({ x: 300, y: 800 }, WINDOW, VIEWPORT, MARGIN);
    // 900 - 265 - 12 = 623
    expect(y).toBe(623);
  });

  it('pushes a window right when it overhangs the left edge', () => {
    expect(clampToViewport({ x: -80, y: 200 }, WINDOW, VIEWPORT, MARGIN).x).toBe(MARGIN);
  });

  it('pushes a window down when it overhangs the top edge', () => {
    expect(clampToViewport({ x: 300, y: -40 }, WINDOW, VIEWPORT, MARGIN).y).toBe(MARGIN);
  });

  it('favours the top-left corner when the window is larger than the viewport', () => {
    // A tiny viewport cannot satisfy both edges; keeping the top-left visible
    // matters more, since that is where the header and its controls live.
    const tiny: Viewport = { width: 320, height: 200 };
    expect(clampToViewport({ x: 50, y: 50 }, WINDOW, tiny, MARGIN)).toEqual({
      x: MARGIN,
      y: MARGIN,
    });
  });
});

describe('spawnPosition', () => {
  it("puts the window's top-left corner at the trigger word's bottom-left", () => {
    const word: Rect = { left: 180, top: 500, width: 52, height: 22 };
    expect(spawnPosition(word, WINDOW, VIEWPORT, MARGIN)).toEqual({ x: 180, y: 522 });
  });

  it('clamps the spawn instead of letting the window hang off a short viewport', () => {
    // The about copy is vertically centred and "piano" sits on the last line,
    // so on a short viewport the word is low enough to push the window off.
    const shortViewport: Viewport = { width: 1440, height: 640 };
    const word: Rect = { left: 180, top: 420, width: 52, height: 22 };
    const { y } = spawnPosition(word, WINDOW, shortViewport, MARGIN);
    expect(y).toBe(640 - 265 - MARGIN);
    expect(y).toBeLessThan(442); // shifted up, not spawned at the word
  });
});

describe('formatTime', () => {
  it('pads seconds to two digits', () => {
    expect(formatTime(4)).toBe('0:04');
  });

  it('formats a whole-minute boundary', () => {
    expect(formatTime(60)).toBe('1:00');
  });

  it('formats the concerto length without an hours field', () => {
    expect(formatTime(1087)).toBe('18:07');
  });

  it('floors fractional seconds rather than rounding up past the duration', () => {
    expect(formatTime(59.9)).toBe('0:59');
  });

  it('renders zero, negatives, and NaN as 0:00 so the header never shows junk', () => {
    // getCurrentTime() can return NaN before the player is ready.
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});

describe('scrubFraction', () => {
  it('maps a pointer at the track midpoint to one half', () => {
    expect(scrubFraction(300, 200, 200)).toBeCloseTo(0.5);
  });

  it('clamps a pointer dragged past either end of the track', () => {
    expect(scrubFraction(50, 200, 200)).toBe(0);
    expect(scrubFraction(900, 200, 200)).toBe(1);
  });

  it('returns 0 for a zero-width track instead of dividing by zero', () => {
    expect(scrubFraction(300, 200, 0)).toBe(0);
  });
});
