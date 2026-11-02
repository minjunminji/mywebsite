'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { glideStep, readingAt, readingTimeline, wheelDeltaPx, type ReadingTimeline } from './projectReading';
import { chunkSegments, type ProjectChunk } from './storyData';
import { INK, inkAlpha } from '@/theme';

/*
 * ProjectReader — a project's copy as one continuous block, lit one chunk at a
 * time. The page scrolls over a track (readingTimeline) where every chunk owns
 * a stretch of at least MIN_DWELL_LINES, however the paragraph happens to wrap;
 * the text is held in view and moved to match, so it glides and nothing snaps.
 * Wheel, keys, trackpad and touch all scroll the same track. While `active`, wheel and scroll keys anywhere on the page
 * drive this text (slowed by SCROLL_SPEED, over the text too), unless they
 * belong to something else that scrolls.
 */

/** The reading spot, as a fraction of the text viewport's height from its top. */
const READING_SPOT = 0.24;
/** Faint (unlit) text. */
const FAINT = inkAlpha(0.22);
const KEY_LINE_PX = 48;
/** How far the text moves per unit of wheel or key input. Under 1 reads
 *  slower than the browser's own scrolling, so each sentence and its media
 *  get time on screen. */
const SCROLL_SPEED = 0.55;
/** The least scroll, in lines of text, any chunk stays lit for. */
const MIN_DWELL_LINES = 2;

const EMPTY_TIMELINE: ReadingTimeline = { starts: [], budgets: [], total: 0 };

type Props = {
  chunks: readonly ProjectChunk[];
  /** True while this project is on screen and nothing covers it. */
  active: boolean;
  onActiveChunk: (index: number) => void;
  onAction: (action: 'shaderExplainer') => void;
  onActionIntent?: (action: 'shaderExplainer') => void;
  nextProject?: { title: string; onNavigate: () => void };
};

/** True if `target` sits inside something else that can scroll vertically. */
function scrollsElsewhere(target: Element | null, stopAt: Element): boolean {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el === stopAt) return false;
    if (el.matches('[role="dialog"], [data-piano-player]')) return true;
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

/** Keys that type or activate shouldn't scroll the page instead. */
function ownsKeys(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [role="dialog"]') !==
      null
  );
}

export default function ProjectReader({ chunks, active, onActiveChunk, onAction, onActionIntent, nextProject }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const chunkRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lit, setLit] = useState(0);
  const [height, setHeight] = useState(0);
  const [timeline, setTimeline] = useState<ReadingTimeline>(EMPTY_TIMELINE);
  const litRef = useRef(lit);
  const timelineRef = useRef(timeline);

  const readingY = Math.round(height * READING_SPOT);
  const showNext = active && lit === chunks.length - 1;

  /** Place the text and light the chunk for the current scroll position. */
  const sync = () => {
    const vp = viewportRef.current;
    const text = textRef.current;
    if (!vp || !text) return;
    const { chunk, offset } = readingAt(timelineRef.current, vp.scrollTop);
    text.style.transform = `translate3d(0, ${-offset}px, 0)`;
    if (chunk !== litRef.current) {
      litRef.current = chunk;
      setLit(chunk);
      onActiveChunk(chunk);
    }
  };

  /** Measure where each chunk starts and rebuild the track from it. */
  const layout = () => {
    const vp = viewportRef.current;
    const text = textRef.current;
    if (!vp || !text) return;
    setHeight(vp.clientHeight);
    // Both rects carry the same transform, so the difference is layout only.
    const textTop = text.getBoundingClientRect().top;
    const spot = Math.round(vp.clientHeight * READING_SPOT);
    const starts = chunkRefs.current
      .slice(0, chunks.length)
      .map((el) => (el?.getClientRects()[0]?.top ?? textTop) - textTop - spot);
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 32;
    const next = readingTimeline(starts, lineHeight * MIN_DWELL_LINES);
    timelineRef.current = next;
    setTimeline(next);
    sync();
  };

  // Re-measure whenever the text or its window changes size (and once the
  // fonts land, since they change where lines wrap).
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const text = textRef.current;
    if (!vp || !text) return undefined;
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(vp);
    ro.observe(text);
    let live = true;
    void document.fonts?.ready.then(() => live && layout());
    return () => {
      live = false;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks]);

  useEffect(() => {
    onActiveChunk(litRef.current);
    // Report the starting chunk once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel and keys anywhere drive the text while this project is up.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!active || !vp) return undefined;
    let target = vp.scrollTop;
    let raf = 0;
    let gliding = false;
    let last: { read: number; wrote: number } | null = null;

    const stop = () => {
      cancelAnimationFrame(raf);
      gliding = false;
      last = null;
    };
    const glide = () => {
      const max = vp.scrollHeight - vp.clientHeight;
      target = Math.min(Math.max(target, 0), max);
      const read = vp.scrollTop;
      const step = glideStep(read, target, last);
      if (!step) {
        stop();
        return;
      }
      vp.scrollTop = step.to;
      if (step.done) {
        stop();
        return;
      }
      last = { read, wrote: step.to };
      raf = requestAnimationFrame(glide);
    };
    const scrollBy = (delta: number) => {
      if (!gliding) target = vp.scrollTop;
      target += delta;
      if (!gliding) {
        gliding = true;
        last = null;
        raf = requestAnimationFrame(glide);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch zoom
      const el = e.target instanceof Element ? e.target : null;
      if (!el || scrollsElsewhere(el, vp)) return;
      // Over the text too, so it scrolls at the same slowed pace everywhere.
      if (vp.contains(el)) e.preventDefault();
      scrollBy(wheelDeltaPx(e.deltaY, e.deltaMode, vp.clientHeight) * SCROLL_SPEED);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || ownsKeys(e.target)) return;
      const page = vp.clientHeight * 0.8;
      const delta =
        e.key === 'ArrowDown'
          ? KEY_LINE_PX
          : e.key === 'ArrowUp'
            ? -KEY_LINE_PX
            : e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)
              ? page
              : e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)
                ? -page
                : e.key === 'Home'
                  ? -vp.scrollHeight
                  : e.key === 'End'
                    ? vp.scrollHeight
                    : 0;
      if (!delta) return;
      e.preventDefault();
      // Home and End still go all the way.
      scrollBy(e.key === 'Home' || e.key === 'End' ? delta : delta * SCROLL_SPEED);
    };

    // Not passive: over the text it replaces the browser's own scrolling.
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      stop();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return (
    <div
      ref={viewportRef}
      className="reader-scroll"
      onScroll={sync}
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
      }}
    >
      {/* The track: as tall as the scroll it takes to read every chunk. */}
      <div style={{ position: 'relative', height: height + timeline.total }}>
        {/* The text stays in view; sync() moves it to match the track. */}
        <div style={{ position: 'sticky', top: 0, height, overflow: 'hidden' }}>
          <p
            ref={textRef}
            style={{
              margin: 0,
              paddingTop: readingY,
              willChange: 'transform',
              fontSize: 'clamp(1.35rem, 2.1vw, 1.9rem)',
              lineHeight: 1.22,
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
          >
            {chunks.map((chunk, index) => (
              <span
                key={index}
                ref={(el) => {
                  chunkRefs.current[index] = el;
                }}
                style={{
                  color: index === lit ? INK : FAINT,
                  transition: 'color 240ms ease',
                }}
              >
                {chunkSegments(chunk).map((segment, segmentIndex) =>
                  segment.action ? (
                    // Inline links get a line of their own. A span with button
                    // semantics rather than a <button>, so it sits in the text flow.
                    <span key={segmentIndex}>
                      <br />
                      <span
                        role="button"
                        tabIndex={0}
                        className="inline-trigger"
                        onClick={() => onAction(segment.action!)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onAction(segment.action!);
                          }
                        }}
                        onPointerEnter={() => onActionIntent?.(segment.action!)}
                        onFocus={() => onActionIntent?.(segment.action!)}
                        // Visibly a link in the block, lit or not.
                        style={{
                          textDecorationColor: 'currentColor',
                          textDecorationThickness: '2px',
                        }}
                      >
                        {segment.text}
                      </span>
                      <br />
                    </span>
                  ) : (
                    <span key={segmentIndex}>{segment.text}</span>
                  ),
                )}{' '}
              </span>
            ))}
            {nextProject ? (
              <button
                type="button"
                className="inline-trigger reader-next"
                onClick={nextProject.onNavigate}
                disabled={!showNext}
                aria-hidden={!showNext}
                tabIndex={showNext ? 0 : -1}
                style={{
                  display: 'block',
                  marginTop: '1.5rem',
                  color: INK,
                  fontSize: 'clamp(1rem, 1.2vw, 1.125rem)',
                  lineHeight: 1.4,
                  textAlign: 'left',
                  opacity: showNext ? 1 : 0,
                  visibility: showNext ? 'visible' : 'hidden',
                }}
              >
                next project: {nextProject.title} →
              </button>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
