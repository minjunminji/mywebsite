import { describe, expect, it } from 'vitest';
import {
  EMPTY_SEQUENCE,
  activeChunkIndex,
  mediaForChunk,
  mediaKey,
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

describe('activeChunkIndex', () => {
  it('lights the first chunk before anything reaches the spot', () => {
    expect(activeChunkIndex([150, 200, 260], 150)).toBe(0);
    expect(activeChunkIndex([170, 200, 260], 150)).toBe(0);
  });

  it('lights the last chunk that has reached the spot', () => {
    expect(activeChunkIndex([-80, 40, 149, 200], 150)).toBe(2);
    expect(activeChunkIndex([-300, -200, -100, -10], 150)).toBe(3);
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
