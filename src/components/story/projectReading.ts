// Pure logic for reading a project one chunk at a time: which chunk is lit,
// which media is up, and how that media enters and leaves. No React, no DOM.

import type { ProjectChunk, ProjectMedia } from './storyData';

/**
 * The lit chunk: the last one whose first line has reached the reading spot.
 * `tops` are each chunk's first-line top, relative to the text viewport.
 * Before anything reaches the spot, the first chunk is lit.
 */
export function activeChunkIndex(tops: readonly number[], readingY: number): number {
  let active = 0;
  tops.forEach((top, index) => {
    if (top <= readingY) active = index;
  });
  return active;
}

/**
 * The media to show while `active` is lit: that of the nearest chunk at or
 * before it that says anything about media (a media, or `null` to clear it),
 * or none above the first such chunk. A pure function of position, so
 * scrolling back up restores earlier media.
 */
export function mediaForChunk(chunks: readonly ProjectChunk[], active: number): ProjectMedia | null {
  for (let index = Math.min(active, chunks.length - 1); index >= 0; index--) {
    const media = chunks[index].media;
    if (media !== undefined) return media;
  }
  return null;
}

/** Stable identity for a media item, so re-renders don't re-trigger it. */
export function mediaKey(media: ProjectMedia | null): string {
  if (!media) return '';
  return media.kind === 'component' ? `component:${media.id}` : `${media.kind}:${media.src}`;
}

/* ---- Enter / leave sequencing ----------------------------------------- */

/**
 * One media on screen at a time. `progress` is how far the shown media is
 * open (0 = gone, 1 = fully open). When a different media is wanted, the shown
 * one closes first, then the wanted one opens from nothing.
 */
export type MediaSequence = {
  shown: ProjectMedia | null;
  wanted: ProjectMedia | null;
  progress: number;
  /** 1 opening, -1 closing, 0 at rest. */
  direction: 1 | -1 | 0;
};

export const EMPTY_SEQUENCE: MediaSequence = { shown: null, wanted: null, progress: 0, direction: 0 };

export function requestMedia(state: MediaSequence, wanted: ProjectMedia | null): MediaSequence {
  if (mediaKey(wanted) === mediaKey(state.wanted)) return state;
  if (state.shown && state.progress > 0) {
    // Close what's up first (or keep closing it).
    if (mediaKey(wanted) === mediaKey(state.shown)) return { ...state, wanted, direction: 1 };
    return { ...state, wanted, direction: -1 };
  }
  return { shown: wanted, wanted, progress: 0, direction: wanted ? 1 : 0 };
}

/** Advance by `dt` ms. Opening takes `openMs`, closing `closeMs`. */
export function stepMedia(state: MediaSequence, dt: number, openMs: number, closeMs: number): MediaSequence {
  if (state.direction === 1) {
    // Snap the last hair so float drift can't leave it a step short of open.
    const raw = state.progress + dt / openMs;
    const progress = raw > 1 - 1e-6 ? 1 : raw;
    return { ...state, progress, direction: progress >= 1 ? 0 : 1 };
  }
  if (state.direction === -1) {
    const raw = state.progress - dt / closeMs;
    const progress = raw < 1e-6 ? 0 : raw;
    if (progress > 0) return { ...state, progress };
    // Closed: swap in whatever is wanted now and open it.
    return { shown: state.wanted, wanted: state.wanted, progress: 0, direction: state.wanted ? 1 : 0 };
  }
  return state;
}

/* ---- Scroll input ------------------------------------------------------ */

/** A wheel event's vertical delta in px, whatever unit the device reported. */
export function wheelDeltaPx(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return deltaY * 16; // lines
  if (deltaMode === 2) return deltaY * pageHeight; // pages
  return deltaY;
}
