'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { remapClamped, stepSpring, type Spring } from './cursorMath';

/* ------------------------------------------------------------------ */
/*  Tunables — group every knob here for experimentation.             */
/* ------------------------------------------------------------------ */

/** Diameter of the free cursor circle, in px. Dial in by eye (reference uses 15). */
const CURSOR_DIAMETER = 18;

/** Diameter of the grown blob while hovering a clickable label, in px. */
const CURSOR_HOVER_SIZE = 56;

/**
 * How far the stuck blob leans toward the pointer, as a fraction of the
 * pointer-to-center distance. 0 = sits dead-center on the label; ~0.1 = a subtle
 * lean that reads as the blob "reaching" toward the cursor.
 */
const STICK_LEAN = 0.1;

/**
 * Squash-and-stretch caps for the hover blob, applied directly each frame (not
 * springed). The blob stretches along the pointer direction up to STRETCH_X_MAX
 * and thins across it down to STRETCH_Y_MIN as the pointer pulls toward the
 * label's edge. The height-for-X / width-for-Y pairing is deliberate (matches
 * the reference): scaleX maps over half the label height, scaleY over half its
 * width.
 */
const STRETCH_X_MAX = 1.3;
const STRETCH_Y_MIN = 0.8;

/**
 * Leaky-integrator spring used for the grow → blob morph (and the melt back).
 * Stiffness pulls toward the target; damping (<1) bleeds velocity so it settles
 * with a slight elastic overshoot rather than ringing forever.
 */
const SPRING_STIFFNESS = 0.2;
const SPRING_DAMPING = 0.76;

/**
 * Stiffer pull used for the center + size springs ONLY while 'releasing', so the
 * melt-back catches a still-moving pointer quickly instead of trailing — keeps
 * the crisp 1:1 promise. Damping stays SPRING_DAMPING everywhere.
 */
const RELEASE_STIFFNESS = 0.45;

/** Per-frame lerp easing rotation + stretch back to neutral while releasing. */
const RELEASE_NEUTRALIZE_EASE = 0.25;

/** Within this many px of the free circle (size + center), 'releasing' → 'free'. */
const RELEASE_EPSILON = 0.5;

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

/** Selector for the clickable things the cursor sticks to (all text labels). */
const TARGET_SELECTOR = 'a, button, [role="button"]';
/** Marker on clickable non-text controls (icon buttons) that must NOT stick. */
const SKIP_SELECTOR = '[data-cursor-skip]';

/**
 * The cursor is driven by a small state machine inside one rAF loop:
 *   'free'      — snap 1:1 to the pointer as a plain, un-stretched negative dot.
 *   'pinned'    — spring center + size onto a hovered label, growing into a blob
 *                 that rotates to face the pointer and stretches toward it.
 *   'releasing' — spring back to the dot-at-pointer, then hand back to 'free'.
 */
type CursorMode = 'free' | 'pinned' | 'releasing';

export default function CustomCursor() {
  const elementRef = useRef<HTMLDivElement>(null);

  // PROTOTYPE-ONLY: the cursor lab (/cursor-lab) mounts its own experimental
  // cursors, so the global one would fight them and hide the native cursor.
  // Bail entirely on that route (no activation, no native-cursor hiding).
  // Remove this guard when the prototype is gone.
  const pathname = usePathname();
  const isCursorLab = pathname === '/cursor-lab';

  useEffect(() => {
    if (isCursorLab) return;

    // Device gating: do nothing on touch / coarse-pointer devices. We neither
    // render a visible cursor nor hide the native one.
    if (!window.matchMedia(FINE_POINTER_QUERY).matches) return;

    const el = elementRef.current;
    if (!el) return;

    const root = document.documentElement;
    root.classList.add(HIDE_NATIVE_CURSOR_CLASS);

    // Reduced motion: keep the grow-to-blob on hover but snap size/center to
    // target each frame (no spring) and apply no rotation/stretch. Tracked live.
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
    // Springable shape: center (cx/cy) and size (diameter). The center stays a
    // CENTER point; the element is drawn at center - size/2. Border-radius is a
    // constant 50% (always a circle); the blob's shape comes from scale instead.
    const cx: Spring = { value: 0, velocity: 0 };
    const cy: Spring = { value: 0, velocity: 0 };
    const size: Spring = { value: CURSOR_DIAMETER, velocity: 0 };
    // Rotation + stretch applied to the blob. Set directly from geometry while
    // pinned, eased back to neutral while releasing, neutral while free.
    let angle = 0;
    let scaleX = 1;
    let scaleY = 1;
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
    const settle = (spring: Spring, target: number, stiffness: number) => {
      if (reducedMotion) snap(spring, target);
      else stepSpring(spring, target, stiffness, SPRING_DAMPING);
    };

    const render = () => {
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

      // Resolve this frame's targets. Default = the free dot at the pointer.
      let targetCX = pointerX;
      let targetCY = pointerY;
      let targetSize = CURSOR_DIAMETER;
      if (mode === 'pinned' && pinnedRect) {
        // Re-read every frame: the nav docks/animates, Experience is its own
        // scroll container, and the window can resize — a cached rect would drift.
        const centerX = pinnedRect.left + pinnedRect.width / 2;
        const centerY = pinnedRect.top + pinnedRect.height / 2;
        const dxToPointer = pointerX - centerX;
        const dyToPointer = pointerY - centerY;
        // Stuck center: sit on the label, leaning STICK_LEAN toward the pointer.
        targetCX = centerX + dxToPointer * STICK_LEAN;
        targetCY = centerY + dyToPointer * STICK_LEAN;
        targetSize = CURSOR_HOVER_SIZE;
        // Rotation + stretch are set directly (not springed) from the geometry.
        if (reducedMotion) {
          angle = 0;
          scaleX = 1;
          scaleY = 1;
        } else {
          angle = Math.atan2(dyToPointer, dxToPointer);
          const absDistance = Math.max(Math.abs(dxToPointer), Math.abs(dyToPointer));
          scaleX = remapClamped(absDistance, 0, pinnedRect.height / 2, 1, STRETCH_X_MAX);
          scaleY = remapClamped(absDistance, 0, pinnedRect.width / 2, 1, STRETCH_Y_MIN);
        }
      }

      // Stiffer pull while releasing so the melt-back catches a moving pointer fast.
      const stiffness = mode === 'releasing' ? RELEASE_STIFFNESS : SPRING_STIFFNESS;

      // Center: snap 1:1 in free mode (no easing/lag); spring in pinned/releasing.
      if (mode === 'free') {
        snap(cx, targetCX);
        snap(cy, targetCY);
      } else {
        settle(cx, targetCX, stiffness);
        settle(cy, targetCY, stiffness);
      }
      // Size always settles toward its target (dot, or blob when pinned).
      settle(size, targetSize, stiffness);

      // Neutralize rotation/stretch when not pinned: snap to neutral while free;
      // ease back smoothly while releasing (the shrinking size masks the rest).
      if (mode === 'free') {
        angle = 0;
        scaleX = 1;
        scaleY = 1;
      } else if (mode === 'releasing') {
        if (reducedMotion) {
          angle = 0;
          scaleX = 1;
          scaleY = 1;
        } else {
          angle += (0 - angle) * RELEASE_NEUTRALIZE_EASE;
          scaleX += (1 - scaleX) * RELEASE_NEUTRALIZE_EASE;
          scaleY += (1 - scaleY) * RELEASE_NEUTRALIZE_EASE;
        }
      }

      // Releasing → free once the shape is back to a dot sitting on the pointer.
      if (mode === 'releasing') {
        const sizeBack = Math.abs(size.value - CURSOR_DIAMETER) < RELEASE_EPSILON;
        const centerBack =
          Math.abs(cx.value - pointerX) < RELEASE_EPSILON &&
          Math.abs(cy.value - pointerY) < RELEASE_EPSILON;
        if (sizeBack && centerBack) mode = 'free';
      }

      // Reveal only once a real pointer position is known, so re-entry/refocus
      // never flashes the cursor at (0,0).
      const visible = hasPointer && inWindow;
      if (visible !== lastVisible) {
        el.style.opacity = visible ? '1' : '0';
        lastVisible = visible;
      }

      // Center-based draw: top-left = center - size/2, then rotate + stretch the
      // blob about its center (transformOrigin: 'center'). The difference blend
      // inverts whatever sits under the blob — no text is rendered.
      const half = size.value / 2;
      el.style.transform =
        `translate3d(${cx.value - half}px, ${cy.value - half}px, 0)` +
        ` rotate(${angle}rad) scale(${scaleX}, ${scaleY})`;
      el.style.width = `${size.value}px`;
      el.style.height = `${size.value}px`;

      rafId = requestAnimationFrame(render);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (!hasPointer) {
        // Seed the center so the first frame doesn't lurch in from (0,0).
        cx.value = pointerX;
        cy.value = pointerY;
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
  }, [isCursorLab]);

  // PROTOTYPE-ONLY: render nothing on the cursor lab route.
  if (isCursorLab) return null;

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
