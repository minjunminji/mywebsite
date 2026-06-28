'use client';

import { useEffect, useRef } from 'react';
import { stepSpring, type Spring } from '../cursorMath';

/* ------------------------------------------------------------------ */
/*  Technique 1 — Spring jelly (pure CSS/DOM).                         */
/*                                                                    */
/*  One white position:fixed div with mix-blend-mode:difference. When  */
/*  free it snaps 1:1 to the pointer as a small dot. On hover it       */
/*  springs its width/height/position to wrap a padded rounded-rect of */
/*  the hovered element, landing with a tiny elastic jiggle, then adds */
/*  a continuous low-amplitude sine wobble on scaleX/scaleY (out of    */
/*  phase) plus a gently breathing border-radius. No SVG / no WebGL —  */
/*  the lightest of the three.                                         */
/* ------------------------------------------------------------------ */

/* ---- Tunables (dial "subtle" by eye) ----------------------------- */

/** Diameter of the free cursor dot, in px. */
const DOT_SIZE = 18;
/** Padding added around the hovered element's rect, in px (how loosely it hugs). */
const HOVER_PAD = 8;
/** Max corner radius of the wrap, in px (capped so wide rects stay rounded-rect). */
const MAX_RADIUS = 16;

/**
 * Grow / wrap spring. Lower damping = more overshoot = bigger "land" jiggle.
 * (CustomCursor uses 0.2 / 0.76; we drop damping a touch for extra bounce.)
 */
const SPRING_STIFFNESS = 0.18;
const SPRING_DAMPING = 0.7;
/** Stiffer pull while melting back so it catches a moving pointer. */
const RELEASE_STIFFNESS = 0.45;

/** Continuous wobble: amplitude as a fraction of scale (0.03 = ±3%). */
const WOBBLE_AMP = 0.03;
/** Wobble angular speed (rad/s-ish). Keep low for a slow living breathe. */
const WOBBLE_SPEED = 2.2;
/** Border-radius breathing amplitude (px) and speed. */
const RADIUS_WOBBLE_AMP = 2;
const RADIUS_WOBBLE_SPEED = 1.6;

/** Within this many px of the resting dot, 'releasing' hands back to 'free'. */
const RELEASE_EPSILON = 0.5;

/** What the cursor sticks to. */
const TARGET_SELECTOR = 'a, button, [role="button"]';

type Mode = 'free' | 'pinned' | 'releasing';

export default function CursorSpringJelly() {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let mode: Mode = 'free';
    let activeEl: Element | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let hasPointer = false;
    let lastVisible = false;
    let rafId: number | null = null;

    // Springable geometry: center (cx/cy) + size (w/h). `grow` (0→1) gates the
    // wobble so the free dot stays a clean, still circle.
    const cx: Spring = { value: 0, velocity: 0 };
    const cy: Spring = { value: 0, velocity: 0 };
    const w: Spring = { value: DOT_SIZE, velocity: 0 };
    const h: Spring = { value: DOT_SIZE, velocity: 0 };
    const grow: Spring = { value: 0, velocity: 0 };

    const snap = (s: Spring, target: number) => {
      s.value = target;
      s.velocity = 0;
    };

    const render = (now: number) => {
      // Re-read the pinned rect every frame (robust to layout shifts); bail to
      // releasing if the target vanished.
      let rect: DOMRect | null = null;
      if (mode === 'pinned') {
        rect = activeEl && activeEl.isConnected ? activeEl.getBoundingClientRect() : null;
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          activeEl = null;
          mode = 'releasing';
          rect = null;
        }
      }

      // This frame's targets: free dot at pointer, or padded rect when pinned.
      let tCX = pointerX;
      let tCY = pointerY;
      let tW = DOT_SIZE;
      let tH = DOT_SIZE;
      let tGrow = 0;
      if (mode === 'pinned' && rect) {
        tCX = rect.left + rect.width / 2;
        tCY = rect.top + rect.height / 2;
        tW = rect.width + HOVER_PAD * 2;
        tH = rect.height + HOVER_PAD * 2;
        tGrow = 1;
      }

      const stiffness = mode === 'releasing' ? RELEASE_STIFFNESS : SPRING_STIFFNESS;

      if (mode === 'free') {
        // Snappy, lag-free dot.
        snap(cx, tCX);
        snap(cy, tCY);
        snap(w, tW);
        snap(h, tH);
        snap(grow, tGrow);
      } else {
        stepSpring(cx, tCX, stiffness, SPRING_DAMPING);
        stepSpring(cy, tCY, stiffness, SPRING_DAMPING);
        stepSpring(w, tW, stiffness, SPRING_DAMPING);
        stepSpring(h, tH, stiffness, SPRING_DAMPING);
        stepSpring(grow, tGrow, stiffness, SPRING_DAMPING);
      }

      // Releasing → free once we're back to a dot sitting on the pointer.
      if (mode === 'releasing') {
        const back =
          Math.abs(w.value - DOT_SIZE) < RELEASE_EPSILON &&
          Math.abs(cx.value - pointerX) < RELEASE_EPSILON &&
          Math.abs(cy.value - pointerY) < RELEASE_EPSILON &&
          grow.value < 0.02;
        if (back) mode = 'free';
      }

      // Reveal only after a real pointer position is known (no flash at 0,0).
      const visible = hasPointer;
      if (visible !== lastVisible) {
        el.style.opacity = visible ? '1' : '0';
        lastVisible = visible;
      }

      // Continuous wobble, scaled by grow so the dot is unaffected.
      const t = now * 0.001;
      const g = grow.value;
      const sx = 1 + Math.sin(t * WOBBLE_SPEED) * WOBBLE_AMP * g;
      const sy = 1 + Math.sin(t * WOBBLE_SPEED + Math.PI * 0.5) * WOBBLE_AMP * g;
      const radius =
        Math.min(h.value / 2, MAX_RADIUS) + Math.sin(t * RADIUS_WOBBLE_SPEED) * RADIUS_WOBBLE_AMP * g;

      el.style.width = `${w.value}px`;
      el.style.height = `${h.value}px`;
      el.style.borderRadius = `${Math.max(0, radius)}px`;
      el.style.transform =
        `translate3d(${cx.value - w.value / 2}px, ${cy.value - h.value / 2}px, 0)` +
        ` scale(${sx}, ${sy})`;

      rafId = requestAnimationFrame(render);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (!hasPointer) {
        cx.value = pointerX;
        cy.value = pointerY;
      }
      hasPointer = true;
    };

    const onPointerOver = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest(TARGET_SELECTOR) ?? null;
      if (target) {
        activeEl = target;
        mode = 'pinned';
      }
    };
    const onPointerOut = (e: PointerEvent) => {
      if (!activeEl) return;
      const related = e.relatedTarget;
      if (related instanceof Node && activeEl.contains(related)) return;
      activeEl = null;
      mode = 'releasing';
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
    };
  }, []);

  return (
    <div
      ref={elRef}
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: '50%',
        background: '#fff',
        mixBlendMode: 'difference',
        pointerEvents: 'none',
        transform: 'translate3d(-100px, -100px, 0)',
        transformOrigin: 'center',
        willChange: 'transform',
        opacity: 0,
        zIndex: 2147483647,
      }}
    />
  );
}
