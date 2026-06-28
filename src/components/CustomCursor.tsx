'use client';

import { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Tunables — group every knob here for experimentation.             */
/* ------------------------------------------------------------------ */

/** Diameter of the free cursor circle, in px. Dial in by eye. */
const CURSOR_DIAMETER = 18;

/**
 * Only activate on devices with a real hovering, fine pointer (mouse/trackpad).
 * On touch / coarse-pointer devices we render nothing and leave the OS cursor
 * untouched.
 */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** Class added to <html> to hide the native cursor while ours is active. */
const HIDE_NATIVE_CURSOR_CLASS = 'cursor-hidden';

/**
 * The cursor is driven by a small state machine inside one rAF loop. Today the
 * only mode is 'free' (snap 1:1 to the pointer). A later task will add 'pinned'
 * and 'releasing' (spring toward a label's rect) without restructuring the loop.
 */
type CursorMode = 'free' | 'pinned' | 'releasing';

export default function CustomCursor() {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Device gating: do nothing on touch / coarse-pointer devices. We neither
    // render a visible cursor nor hide the native one.
    if (!window.matchMedia(FINE_POINTER_QUERY).matches) return;

    const el = elementRef.current;
    if (!el) return;

    const root = document.documentElement;
    root.classList.add(HIDE_NATIVE_CURSOR_CLASS);

    const radius = CURSOR_DIAMETER / 2;

    /* --- mutable animation state (never triggers a React re-render) --- */
    // Current mode of the state machine. Only ever 'free' in this task.
    let mode: CursorMode = 'free';
    // Latest known pointer position (viewport coords).
    let pointerX = 0;
    let pointerY = 0;
    // Center the circle currently renders at. Kept separate from the pointer so
    // future spring modes can integrate toward a target instead of snapping.
    let renderX = 0;
    let renderY = 0;
    // True once we've seen a real pointer position (avoids a flash at 0,0).
    let hasPointer = false;
    // True while the pointer is inside the window and focused.
    let inWindow = false;
    let rafId: number | null = null;

    const render = () => {
      switch (mode) {
        case 'free':
        default:
          // Snap the circle's center 1:1 to the pointer — no easing, no lag.
          renderX = pointerX;
          renderY = pointerY;
          break;
        // 'pinned' / 'releasing' will spring renderX/renderY toward a label
        // rect in a follow-up task; the loop below stays unchanged.
      }

      const visible = hasPointer && inWindow;
      el.style.opacity = visible ? '1' : '0';
      el.style.transform = `translate3d(${renderX - radius}px, ${renderY - radius}px, 0)`;

      rafId = requestAnimationFrame(render);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      hasPointer = true;
      inWindow = true;
    };

    // Pointer left the window entirely.
    const onMouseLeave = () => {
      inWindow = false;
    };

    // Window lost focus (e.g. tab/app switch).
    const onBlur = () => {
      inWindow = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    root.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('blur', onBlur);

    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('blur', onBlur);
      root.classList.remove(HIDE_NATIVE_CURSOR_CLASS);
    };
  }, []);

  return (
    <div
      ref={elementRef}
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: CURSOR_DIAMETER,
        height: CURSOR_DIAMETER,
        borderRadius: '50%',
        background: '#fff',
        mixBlendMode: 'difference',
        pointerEvents: 'none',
        // Start off-screen and invisible; the rAF loop reveals it on first move.
        transform: 'translate3d(-100px, -100px, 0)',
        transformOrigin: 'center',
        willChange: 'transform',
        opacity: 0,
        zIndex: 2147483647,
      }}
    />
  );
}
