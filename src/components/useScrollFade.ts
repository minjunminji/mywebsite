'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Depth of the top/bottom fade on a scrollable pane.
const FADE = '2.5rem';

/**
 * Drives a scrollable pane with a thin custom scrollbar (pair with the
 * `.custom-scroll` class) and a mask that fades the top edge once content has
 * scrolled up out of view (no fade while parked at the top; the bottom never
 * fades).
 *
 * Wire it up: put `scrollRef` + `onScroll` on the scroll container, apply
 * `maskImage` to its `mask-image`/`-webkit-mask-image`, and put `contentRef` on
 * the inner content wrapper so the fade tracks reflow and late-loading media.
 * The pane resets to the top whenever its content element remounts.
 */
export function useScrollFade() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Fade the top only, and only once content has scrolled up out of view.
    const next = el.scrollTop > 1;
    setShowTopFade((prev) => (prev === next ? prev : next));
  }, []);

  // Observe the content so the fade tracks reflow and late-loading media changing
  // the scroll height. Resets the pane to the top whenever a new content element
  // mounts (e.g. switching projects).
  const contentRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => recompute());
        observer.observe(node);
        observerRef.current = observer;
      }
      recompute();
    },
    [recompute],
  );

  // A pure viewport-height change alters the container's clientHeight (whether it
  // overflows) without reflowing the content, so the ResizeObserver won't catch
  // it — listen for resize too.
  useEffect(() => {
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      observerRef.current?.disconnect();
    };
  }, [recompute]);

  const maskImage =
    `linear-gradient(to bottom, rgba(0,0,0,${showTopFade ? 0 : 1}) 0, ` +
    `rgba(0,0,0,1) ${FADE}, rgba(0,0,0,1) 100%)`;

  return { scrollRef, contentRef, onScroll: recompute, maskImage };
}
