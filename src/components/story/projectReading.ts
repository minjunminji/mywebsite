// Pure logic for reading a project one chunk at a time: how scrolling maps to
// the lit chunk and the text's travel, which media is up, and how that media
// enters and leaves. No React, no DOM.

import type { ProjectChunk, ProjectMedia } from './storyData';

/* ---- Reading timeline --------------------------------------------------- */

/**
 * How scrolling maps onto the text. Scrolling moves along a track; each chunk
 * owns a stretch of it, and while you're in a chunk's stretch that chunk is
 * lit and the text travels from where the chunk sits on the reading spot to
 * where the next one does. A stretch is the chunk's natural travel, but never
 * less than `minDwell`, so a chunk that shares its first line with the next
 * (no travel at all) still stays lit for a fair amount of scroll.
 */
export type ReadingTimeline = {
  /** Text travel (px) at which each chunk's first line sits on the reading spot. */
  starts: readonly number[];
  /** Scroll (px) each chunk stays lit for. */
  budgets: readonly number[];
  /** Total scroll from the first chunk to the end of the last. */
  total: number;
};

export function readingTimeline(rawStarts: readonly number[], minDwell: number): ReadingTimeline {
  // Never backwards, never above the top.
  const starts: number[] = [];
  rawStarts.forEach((start, i) => starts.push(Math.max(start, i ? starts[i - 1] : 0)));
  const budgets = starts.map((start, i) =>
    i + 1 < starts.length ? Math.max(starts[i + 1] - start, minDwell) : minDwell,
  );
  return { starts, budgets, total: budgets.reduce((sum, b) => sum + b, 0) };
}

/** The lit chunk and how far the text has travelled at `scroll` along the track. */
export function readingAt(t: ReadingTimeline, scroll: number): { chunk: number; offset: number } {
  const n = t.starts.length;
  if (!n) return { chunk: 0, offset: 0 };
  let from = 0;
  for (let i = 0; i < n; i++) {
    const budget = t.budgets[i];
    if (scroll < from + budget || i === n - 1) {
      const next = i + 1 < n ? t.starts[i + 1] : t.starts[i];
      const along = Math.min(Math.max((scroll - from) / budget, 0), 1);
      return { chunk: i, offset: t.starts[i] + (next - t.starts[i]) * along };
    }
    from += budget;
  }
  return { chunk: n - 1, offset: t.starts[n - 1] };
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

/** Wheel input eases toward its target this much per frame. */
export const GLIDE_EASE = 0.22;

/**
 * One frame of the eased wheel glide, given where the text is `now`, where
 * it's headed, and what the last frame read and wrote. Returns where to
 * scroll (`done` when that's the target), or null to let go without writing:
 * when the last step didn't move the text at all (pinned against an edge the
 * browser won't pass, e.g. a computed bottom a fraction of a px past the real
 * one), or when something else moved it (the reader scrolling by hand), since
 * holding on would drag the text back against them.
 */
export function glideStep(
  now: number,
  target: number,
  last: { read: number; wrote: number } | null,
  ease = GLIDE_EASE,
): { to: number; done: boolean } | null {
  if (last) {
    if (Math.abs(now - last.wrote) > 2) return null;
    if (Math.abs(now - last.read) < 0.01) return null;
  }
  const next = now + (target - now) * ease;
  if (Math.abs(target - next) < 0.5) return { to: target, done: true };
  return { to: next, done: false };
}
