'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { activeChunkIndex, wheelDeltaPx } from './projectReading';
import { chunkSegments, type ProjectChunk } from './storyData';
import { INK, inkAlpha } from '@/theme';

/*
 * ProjectReader — a project's copy as one continuous block, lit one chunk at a
 * time. The text scrolls like a normal page (it glides; nothing snaps), and
 * the lit chunk is the last one whose first line has reached the reading spot
 * near the top. While `active`, wheel and scroll keys anywhere on the page
 * drive this text, unless they belong to something else that scrolls.
 */

/** The reading spot, as a fraction of the text viewport's height from its top. */
const READING_SPOT = 0.24;
/** Faint (unlit) text. */
const FAINT = inkAlpha(0.22);
/** Wheel input eases toward its target this much per 60fps frame. */
const WHEEL_EASE = 0.22;
const KEY_LINE_PX = 48;

type Props = {
  chunks: readonly ProjectChunk[];
  /** True while this project is on screen and nothing covers it. */
  active: boolean;
  onActiveChunk: (index: number) => void;
  onAction: (action: 'shaderExplainer') => void;
  onActionIntent?: (action: 'shaderExplainer') => void;
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
    target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"], [role="dialog"]') !== null
  );
}

export default function ProjectReader({ chunks, active, onActiveChunk, onAction, onActionIntent }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const chunkRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lit, setLit] = useState(0);
  const [height, setHeight] = useState(0);
  const litRef = useRef(lit);

  const readingY = Math.round(height * READING_SPOT);

  const measure = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    const top = vp.getBoundingClientRect().top;
    const tops = chunkRefs.current.map((el) => (el ? el.getClientRects()[0]?.top ?? Infinity : Infinity) - top);
    const next = activeChunkIndex(tops, Math.round(vp.clientHeight * READING_SPOT));
    if (next !== litRef.current) {
      litRef.current = next;
      setLit(next);
      onActiveChunk(next);
    }
  };

  // Size the padding so chunk 1 starts on the reading spot and the last chunk
  // can scroll up to it.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;
    const update = () => setHeight(vp.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onActiveChunk(litRef.current);
    // Report the starting chunk once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(measure, [height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel and keys anywhere drive the text while this project is up.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!active || !vp) return undefined;
    let target = vp.scrollTop;
    let raf = 0;
    let gliding = false;

    const glide = () => {
      const max = vp.scrollHeight - vp.clientHeight;
      target = Math.min(Math.max(target, 0), max);
      const next = vp.scrollTop + (target - vp.scrollTop) * WHEEL_EASE;
      if (Math.abs(target - next) < 0.5) {
        vp.scrollTop = target;
        gliding = false;
        return;
      }
      vp.scrollTop = next;
      raf = requestAnimationFrame(glide);
    };
    const scrollBy = (delta: number) => {
      if (!gliding) target = vp.scrollTop;
      target += delta;
      if (!gliding) {
        gliding = true;
        raf = requestAnimationFrame(glide);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch zoom
      const el = e.target instanceof Element ? e.target : null;
      // Over the text itself the browser scrolls it natively.
      if (!el || vp.contains(el) || scrollsElsewhere(el, vp)) return;
      scrollBy(wheelDeltaPx(e.deltaY, e.deltaMode, vp.clientHeight));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || ownsKeys(e.target)) return;
      const page = vp.clientHeight * 0.8;
      const delta =
        e.key === 'ArrowDown' ? KEY_LINE_PX
        : e.key === 'ArrowUp' ? -KEY_LINE_PX
        : e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey) ? page
        : e.key === 'PageUp' || (e.key === ' ' && e.shiftKey) ? -page
        : e.key === 'Home' ? -vp.scrollHeight
        : e.key === 'End' ? vp.scrollHeight
        : 0;
      if (!delta) return;
      e.preventDefault();
      scrollBy(delta);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return (
    <div
      ref={viewportRef}
      className="reader-scroll"
      onScroll={measure}
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
      }}
    >
      <p
        style={{
          margin: 0,
          paddingTop: readingY,
          // Enough room under the last line for it to reach the reading spot.
          paddingBottom: Math.max(0, height - readingY - 40),
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
            style={{ color: index === lit ? INK : FAINT, transition: 'color 240ms ease' }}
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
                    style={{ textDecorationColor: 'currentColor', textDecorationThickness: '2px' }}
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
      </p>
    </div>
  );
}
