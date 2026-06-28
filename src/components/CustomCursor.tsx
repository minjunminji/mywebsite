'use client';

import { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Tunables — group every knob here for experimentation.             */
/* ------------------------------------------------------------------ */

/** Diameter of the free cursor circle, in px. Dial in by eye. */
const CURSOR_DIAMETER = 18;

/** Padding the pill adds around a hovered label, per side, in px. */
const PILL_PAD_X = 12;
const PILL_PAD_Y = 7;

/**
 * Leaky-integrator spring used for the circle → pill morph (and the melt back).
 * Stiffness pulls toward the target; damping (<1) bleeds velocity so it settles
 * with a slight elastic overshoot rather than ringing forever.
 */
const SPRING_STIFFNESS = 0.2;
const SPRING_DAMPING = 0.76;

/** Within this many px of the free circle (size + center), 'releasing' → 'free'. */
const RELEASE_EPSILON = 0.5;

/**
 * Liquid feel: a subtle velocity-based squash-and-stretch, free mode only.
 * `STRETCH_MAX` caps how far it stretches; `STRETCH_SPEED_REF` is the per-frame
 * pointer travel (px) that maps to (near) full stretch; `STRETCH_EASE` smooths
 * the value so it grows quickly and decays as the pointer slows; `STRETCH_SQUASH`
 * is how much it thins across the travel direction relative to the stretch.
 */
const STRETCH_MAX = 0.3;
const STRETCH_SPEED_REF = 45;
const STRETCH_EASE = 0.2;
const STRETCH_SQUASH = 0.55;
/** Below this per-frame speed we hold the last stretch angle (avoids jitter). */
const STRETCH_MIN_SPEED = 0.5;

/**
 * Only activate on devices with a real hovering, fine pointer (mouse/trackpad).
 * On touch / coarse-pointer devices we render nothing and leave the OS cursor
 * untouched.
 */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/** Media query for users who asked the OS to reduce motion. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Class added to <html> to hide the native cursor while ours is active. */
const HIDE_NATIVE_CURSOR_CLASS = 'cursor-hidden';

/** Selector for the clickable things the cursor pills around (all text labels). */
const TARGET_SELECTOR = 'a, button, [role="button"]';
/** Marker on clickable non-text controls (icon buttons) that must NOT pill. */
const SKIP_SELECTOR = '[data-cursor-skip]';

/**
 * The cursor is driven by a small state machine inside one rAF loop:
 *   'free'      — snap 1:1 to the pointer, with a subtle velocity stretch.
 *   'pinned'    — spring center + size toward a hovered label's padded rect (pill).
 *   'releasing' — spring back to the circle-at-pointer, then hand back to 'free'.
 */
type CursorMode = 'free' | 'pinned' | 'releasing';

/** One springable scalar (a value chasing a target with its own velocity). */
type Spring = { value: number; velocity: number };

/**
 * Advance a spring one frame with a leaky integrator (slight elastic overshoot).
 * Pure-ish: mutates the passed spring in place, no other side effects.
 */
function stepSpring(spring: Spring, target: number, stiffness: number, damping: number) {
  spring.velocity += (target - spring.value) * stiffness;
  spring.velocity *= damping;
  spring.value += spring.velocity;
}

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

    // Reduced motion: keep the cursor AND pill, but snap morphs to target each
    // frame (no spring overshoot) and apply no velocity stretch. Tracked live.
    const reducedMotionMq = window.matchMedia(REDUCED_MOTION_QUERY);
    let reducedMotion = reducedMotionMq.matches;

    /* --- mutable animation state (never triggers a React re-render) --- */
    // Current mode of the state machine.
    let mode: CursorMode = 'free';
    // The label currently pinned (or being released from), null when free.
    let activeEl: Element | null = null;
    // Latest known pointer position (viewport coords).
    let pointerX = 0;
    let pointerY = 0;
    // Pointer position sampled on the previous frame — drives the velocity stretch.
    let lastPointerX = 0;
    let lastPointerY = 0;
    // Springable shape: center (cx/cy), size (w/h), and corner radius (cr). The
    // center stays a CENTER point; the element is drawn at center - size/2.
    const cx: Spring = { value: 0, velocity: 0 };
    const cy: Spring = { value: 0, velocity: 0 };
    const w: Spring = { value: CURSOR_DIAMETER, velocity: 0 };
    const h: Spring = { value: CURSOR_DIAMETER, velocity: 0 };
    const cr: Spring = { value: radius, velocity: 0 };
    // Smoothed liquid-stretch magnitude (0..STRETCH_MAX) and its travel angle.
    let stretch = 0;
    let stretchAngle = 0;
    // True once we've seen a real pointer position (avoids a flash at 0,0).
    let hasPointer = false;
    // True while the pointer is inside the window and the window is focused.
    let inWindow = false;
    // Last opacity we wrote, so we only touch the DOM when visibility flips.
    // Matches the element's initial inline opacity: 0 (hidden).
    let lastVisible = false;
    let rafId: number | null = null;

    // Snap a spring straight to its target (reduced motion / free-mode center).
    const snap = (spring: Spring, target: number) => {
      spring.value = target;
      spring.velocity = 0;
    };
    // Settle a spring toward its target — instant under reduced motion, else spring.
    const settle = (spring: Spring, target: number) => {
      if (reducedMotion) snap(spring, target);
      else stepSpring(spring, target, SPRING_STIFFNESS, SPRING_DAMPING);
    };

    const render = () => {
      // Per-frame pointer travel — used only for the free-mode liquid stretch.
      const dx = pointerX - lastPointerX;
      const dy = pointerY - lastPointerY;
      lastPointerX = pointerX;
      lastPointerY = pointerY;

      // If a pinned target was unmounted/hidden mid-hover (detached or its rect
      // collapsed), bail to releasing so we melt back instead of sticking.
      let pinnedRect: DOMRect | null = null;
      if (mode === 'pinned') {
        pinnedRect = activeEl && activeEl.isConnected ? activeEl.getBoundingClientRect() : null;
        if (!pinnedRect || (pinnedRect.width === 0 && pinnedRect.height === 0)) {
          activeEl = null;
          mode = 'releasing';
          pinnedRect = null;
        }
      }

      // Resolve this frame's targets. Default = the free circle at the pointer.
      let targetCX = pointerX;
      let targetCY = pointerY;
      let targetW = CURSOR_DIAMETER;
      let targetH = CURSOR_DIAMETER;
      let targetR = radius;
      if (mode === 'pinned' && pinnedRect) {
        // Re-read every frame: the nav docks/animates, Experience is its own
        // scroll container, and the window can resize — a cached rect would drift.
        targetW = pinnedRect.width + PILL_PAD_X * 2;
        targetH = pinnedRect.height + PILL_PAD_Y * 2;
        targetCX = pinnedRect.left + pinnedRect.width / 2;
        targetCY = pinnedRect.top + pinnedRect.height / 2;
        targetR = targetH / 2; // full pill
      }

      // Center: snap 1:1 in free mode (no easing/lag); spring in pinned/releasing.
      if (mode === 'free') {
        snap(cx, targetCX);
        snap(cy, targetCY);
      } else {
        settle(cx, targetCX);
        settle(cy, targetCY);
      }
      // Size + radius always settle toward their target (circle, or pill when pinned).
      settle(w, targetW);
      settle(h, targetH);
      settle(cr, targetR);

      // Releasing → free once the shape is back to a circle sitting on the pointer.
      if (mode === 'releasing') {
        const sizeBack =
          Math.abs(w.value - CURSOR_DIAMETER) < RELEASE_EPSILON &&
          Math.abs(h.value - CURSOR_DIAMETER) < RELEASE_EPSILON;
        const centerBack =
          Math.abs(cx.value - pointerX) < RELEASE_EPSILON &&
          Math.abs(cy.value - pointerY) < RELEASE_EPSILON;
        if (sizeBack && centerBack) mode = 'free';
      }

      // Liquid stretch — free mode only, off under reduced motion. Always smooth
      // the value (so it decays even after pinning) but only apply it when free.
      let stretchTarget = 0;
      if (mode === 'free' && !reducedMotion) {
        const speed = Math.hypot(dx, dy);
        const n = Math.min(1, speed / STRETCH_SPEED_REF);
        stretchTarget = STRETCH_MAX * (1 - (1 - n) * (1 - n)); // ease-out: grows fast
        if (speed > STRETCH_MIN_SPEED) stretchAngle = Math.atan2(dy, dx);
      }
      stretch += (stretchTarget - stretch) * STRETCH_EASE;
      const appliedStretch = mode === 'free' && !reducedMotion ? stretch : 0;

      // Reveal only once a real pointer position is known, so re-entry/refocus
      // never flashes the cursor at (0,0).
      const visible = hasPointer && inWindow;
      if (visible !== lastVisible) {
        el.style.opacity = visible ? '1' : '0';
        lastVisible = visible;
      }

      // Center-based draw: top-left = center - size/2, plus an optional stretch
      // composed about the element center (transformOrigin: 'center') along travel.
      let transform = `translate3d(${cx.value - w.value / 2}px, ${cy.value - h.value / 2}px, 0)`;
      if (appliedStretch > 0) {
        transform +=
          ` rotate(${stretchAngle}rad)` +
          ` scale(${1 + appliedStretch}, ${1 - appliedStretch * STRETCH_SQUASH})` +
          ` rotate(${-stretchAngle}rad)`;
      }
      el.style.transform = transform;
      el.style.width = `${w.value}px`;
      el.style.height = `${h.value}px`;
      el.style.borderRadius = `${cr.value}px`;

      rafId = requestAnimationFrame(render);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (!hasPointer) {
        // Seed the center + velocity baseline so the first frame doesn't lurch
        // in from (0,0) or register a huge phantom stretch.
        cx.value = pointerX;
        cy.value = pointerY;
        lastPointerX = pointerX;
        lastPointerY = pointerY;
      }
      hasPointer = true;
      inWindow = true;
    };

    // Delegated targeting (capture phase): pin when the pointer enters a clickable
    // text label, ignoring icon controls flagged with data-cursor-skip.
    const onPointerOver = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest(TARGET_SELECTOR) ?? null;
      if (target && !target.closest(SKIP_SELECTOR)) {
        activeEl = target;
        mode = 'pinned';
      }
    };
    const onPointerOut = (e: PointerEvent) => {
      if (!activeEl) return;
      // Moving onto a descendant of the active element is still "inside" — ignore.
      const related = e.relatedTarget;
      if (related instanceof Node && activeEl.contains(related)) return;
      activeEl = null;
      mode = 'releasing';
    };

    // Pointer entered / left the window entirely.
    const onPointerEnter = () => {
      inWindow = true;
    };
    const onPointerLeave = () => {
      inWindow = false;
    };

    // Window gained / lost focus (e.g. tab/app switch). `focus` restores the
    // cursor after alt-tabbing back without moving the pointer; `visible` still
    // gates on hasPointer so this never flashes at (0,0).
    const onFocus = () => {
      inWindow = true;
    };
    const onBlur = () => {
      inWindow = false;
    };

    const onReducedMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    root.addEventListener('pointerenter', onPointerEnter);
    root.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    reducedMotionMq.addEventListener('change', onReducedMotionChange);

    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      root.removeEventListener('pointerenter', onPointerEnter);
      root.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      reducedMotionMq.removeEventListener('change', onReducedMotionChange);
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
