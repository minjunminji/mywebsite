import { describe, expect, it } from 'vitest';
import {
  EMPTY_SEQUENCE,
  glideStep,
  mediaForChunk,
  mediaKey,
  readingAt,
  readingTimeline,
  requestMedia,
  stepMedia,
  wheelDeltaPx,
  type MediaSequence,
} from './projectReading';
import type { ProjectChunk, ProjectMedia } from './storyData';

const A: ProjectMedia = { kind: 'image', src: '/a.webp', alt: 'a', width: 16, height: 9 };
const B: ProjectMedia = { kind: 'video', src: '/b.mp4', title: 'b', width: 16, height: 9 };
const C: ProjectMedia = { kind: 'component', id: 'sceneFrames', label: 'c', width: 16, height: 10 };

const CHUNKS: ProjectChunk[] = [
  { text: 'zero' },
  { text: 'one', media: A },
  { text: 'two' },
  { text: 'three', media: B },
  { text: 'four' },
];

describe('reading timeline', () => {
  // Where each chunk's first line reaches the reading spot, in px of text travel.
  // Chunks 1 and 2 start on the same line; chunk 3 starts three lines on.
  const STARTS = [0, 30, 30, 120];
  const t = readingTimeline(STARTS, 60);

  it('gives every chunk at least the minimum dwell, however it wraps', () => {
    expect(t.budgets).toEqual([60, 60, 90, 60]);
    expect(t.total).toBe(270);
  });

  it('lights each chunk for its whole budget', () => {
    expect(readingAt(t, 0).chunk).toBe(0);
    expect(readingAt(t, 59).chunk).toBe(0);
    expect(readingAt(t, 60).chunk).toBe(1);
    expect(readingAt(t, 119).chunk).toBe(1);
    expect(readingAt(t, 120).chunk).toBe(2);
    expect(readingAt(t, 210).chunk).toBe(3);
    expect(readingAt(t, 9999).chunk).toBe(3);
  });

  it('brings each chunk to the reading spot as it lights', () => {
    expect(readingAt(t, 0).offset).toBe(0);
    expect(readingAt(t, 60).offset).toBe(30);
    expect(readingAt(t, 120).offset).toBe(30);
    expect(readingAt(t, 210).offset).toBe(120);
  });

  it('holds the text still while a chunk on the same line is lit', () => {
    expect(readingAt(t, 90).offset).toBe(30);
  });

  it('moves the text slower through a short chunk, never backwards', () => {
    expect(readingAt(t, 30).offset).toBe(15);
    let prev = -Infinity;
    for (let scroll = 0; scroll <= t.total; scroll += 3) {
      const { offset } = readingAt(t, scroll);
      expect(offset).toBeGreaterThanOrEqual(prev);
      prev = offset;
    }
  });

  it('copes with nothing measured yet', () => {
    const empty = readingTimeline([], 60);
    expect(empty.total).toBe(0);
    expect(readingAt(empty, 50)).toEqual({ chunk: 0, offset: 0 });
  });
});

describe('mediaForChunk', () => {
  it('shows nothing above the first chunk with media', () => {
    expect(mediaForChunk(CHUNKS, 0)).toBeNull();
  });

  it('keeps the latest media through chunks without any', () => {
    expect(mediaForChunk(CHUNKS, 1)).toBe(A);
    expect(mediaForChunk(CHUNKS, 2)).toBe(A);
    expect(mediaForChunk(CHUNKS, 3)).toBe(B);
    expect(mediaForChunk(CHUNKS, 4)).toBe(B);
  });

  it('clears the media from a chunk that sets it to null', () => {
    const chunks: ProjectChunk[] = [...CHUNKS, { text: 'five', media: null }, { text: 'six' }];
    expect(mediaForChunk(chunks, 5)).toBeNull();
    expect(mediaForChunk(chunks, 6)).toBeNull();
    expect(mediaForChunk(chunks, 4)).toBe(B);
  });

  it('is a function of position, so scrolling back restores earlier media', () => {
    expect(mediaForChunk(CHUNKS, 4)).toBe(B);
    expect(mediaForChunk(CHUNKS, 2)).toBe(A);
  });
});

describe('mediaKey', () => {
  it('identifies media by kind and source', () => {
    expect(mediaKey(A)).toBe('image:/a.webp');
    expect(mediaKey(C)).toBe('component:sceneFrames');
    expect(mediaKey(null)).toBe('');
  });

  it("ignores a component's state, so stepping through states never crumples it", () => {
    const a: ProjectMedia = { ...C, state: 'files' };
    const b: ProjectMedia = { ...C, state: 'tailor' };
    expect(mediaKey(a)).toBe(mediaKey(b));
    const open: MediaSequence = { shown: a, wanted: a, progress: 1, direction: 0 };
    expect(requestMedia(open, b)).toBe(open);
  });
});

describe('media sequence', () => {
  const run = (state: MediaSequence, ms: number) => {
    let s = state;
    for (let t = 0; t < ms; t += 10) s = stepMedia(s, 10, 900, 420);
    return s;
  };

  it('opens the first media from nothing', () => {
    const s = requestMedia(EMPTY_SEQUENCE, A);
    expect(s).toMatchObject({ shown: A, progress: 0, direction: 1 });
    expect(run(s, 900)).toMatchObject({ shown: A, progress: 1, direction: 0 });
  });

  it('closes the current media before opening the next', () => {
    const open = run(requestMedia(EMPTY_SEQUENCE, A), 900);
    const swapping = requestMedia(open, B);
    expect(swapping).toMatchObject({ shown: A, wanted: B, direction: -1 });
    const midClose = run(swapping, 200);
    expect(midClose.shown).toBe(A);
    const afterClose = run(swapping, 430);
    expect(afterClose).toMatchObject({ shown: B, direction: 1 });
    expect(run(afterClose, 900)).toMatchObject({ shown: B, progress: 1, direction: 0 });
  });

  it('closes to nothing when no media is wanted', () => {
    const open = run(requestMedia(EMPTY_SEQUENCE, A), 900);
    const closed = run(requestMedia(open, null), 430);
    expect(closed).toEqual(EMPTY_SEQUENCE);
  });

  it('reopens the same media if it is wanted again mid-close', () => {
    const open = run(requestMedia(EMPTY_SEQUENCE, A), 900);
    const closing = run(requestMedia(open, B), 100);
    const back = requestMedia(closing, A);
    expect(back).toMatchObject({ shown: A, wanted: A, direction: 1 });
  });

  it('ignores a request for what is already wanted', () => {
    const s = requestMedia(EMPTY_SEQUENCE, A);
    expect(requestMedia(s, { ...A })).toBe(s);
  });
});

describe('wheelDeltaPx', () => {
  it('converts line and page deltas to px', () => {
    expect(wheelDeltaPx(3, 0, 800)).toBe(3);
    expect(wheelDeltaPx(3, 1, 800)).toBe(48);
    expect(wheelDeltaPx(1, 2, 800)).toBe(800);
  });
});

describe('glideStep', () => {
  /** Glide like the reader does, against a text that can't scroll past `limit`. */
  const glide = (from: number, target: number, limit: number, interfere?: (frame: number, at: number) => number) => {
    let at = from;
    let last: { read: number; wrote: number } | null = null;
    for (let frame = 0; frame < 1000; frame++) {
      if (interfere) at = interfere(frame, at);
      const step = glideStep(at, target, last);
      if (!step) return { at, frames: frame, stopped: true };
      last = { read: at, wrote: step.to };
      at = Math.min(step.to, limit); // the browser clamps at its real limit
      if (step.done) return { at, frames: frame + 1, stopped: true };
    }
    return { at, frames: 1000, stopped: false };
  };

  it('eases to the target and stops there', () => {
    const run = glide(0, 300, 10_000);
    expect(run.stopped).toBe(true);
    expect(run.at).toBe(300);
  });

  it('stops when pinned short of a target the browser won’t reach', () => {
    // The computed bottom is a hair past where the text can actually scroll.
    const run = glide(900, 1000, 999.3);
    expect(run.stopped).toBe(true);
    expect(run.frames).toBeLessThan(100);
  });

  it('lets go as soon as something else moves the text', () => {
    // Mid-glide, the reader scrolls back up over the text by hand.
    const run = glide(0, 1000, 10_000, (frame, at) => (frame === 5 ? at - 120 : at));
    expect(run.stopped).toBe(true);
    expect(run.frames).toBe(5);
  });
});
