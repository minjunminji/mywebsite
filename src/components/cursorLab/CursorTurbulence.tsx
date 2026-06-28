'use client';

import { useEffect, useRef } from 'react';
import { stepSpring, type Spring } from '../cursorMath';

/* ------------------------------------------------------------------ */
/*  Technique 2 — Turbulence (SVG filter).                            */
/*                                                                    */
/*  Same shape-conforming white rounded-rect as the jelly (springed to */
/*  the hovered rect, mix-blend-mode:difference), but its edges get an  */
/*  organic watery ripple from an SVG <filter>: feTurbulence           */
/*  (fractalNoise) feeding feDisplacementMap with a SMALL scale. The    */
/*  turbulence baseFrequency drifts slowly via rAF so the edge wobbles  */
/*  like a living membrane. Displacement scale is gated by grow so the  */
/*  free dot stays a crisp circle and the difference blend never        */
/*  muddies.                                                            */
/* ------------------------------------------------------------------ */

/* ---- Tunables (dial "subtle" by eye) ----------------------------- */

/** Diameter of the free cursor dot, in px. */
const DOT_SIZE = 18;
/** Padding around the hovered element's rect, in px. */
const HOVER_PAD = 8;
/** Max corner radius of the wrap, in px. */
const MAX_RADIUS = 16;

/** Grow / wrap spring (slight overshoot from low damping). */
const SPRING_STIFFNESS = 0.18;
const SPRING_DAMPING = 0.72;
const RELEASE_STIFFNESS = 0.45;

/**
 * Displacement strength in px when fully wrapped. Keep small — large values
 * fray the alpha and the difference blend goes muddy. ~5–8 reads as a living
 * edge.
 */
const TURB_SCALE = 6;
/** Base spatial frequency of the noise (lower = larger, lazier ripples). */
const TURB_BASE_FREQ = 0.014;
/** How far the frequency drifts each cycle, and how fast it drifts. */
const TURB_FREQ_DELTA = 0.004;
const TURB_DRIFT_SPEED = 0.6;
/** Octaves of fractal noise (1–2 keeps it gentle). */
const TURB_OCTAVES = 2;

const RELEASE_EPSILON = 0.5;
const TARGET_SELECTOR = 'a, button, [role="button"]';

type Mode = 'free' | 'pinned' | 'releasing';

export default function CursorTurbulence() {
  const rectRef = useRef<SVGRectElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const rectEl = rectRef.current;
    const turbEl = turbRef.current;
    const dispEl = dispRef.current;
    const svgEl = svgRef.current;
    if (!rectEl || !turbEl || !dispEl || !svgEl) return;

    let mode: Mode = 'free';
    let activeEl: Element | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let hasPointer = false;
    let lastVisible = false;
    let rafId: number | null = null;

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
      let rect: DOMRect | null = null;
      if (mode === 'pinned') {
        rect = activeEl && activeEl.isConnected ? activeEl.getBoundingClientRect() : null;
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          activeEl = null;
          mode = 'releasing';
          rect = null;
        }
      }

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

      if (mode === 'releasing') {
        const back =
          Math.abs(w.value - DOT_SIZE) < RELEASE_EPSILON &&
          Math.abs(cx.value - pointerX) < RELEASE_EPSILON &&
          Math.abs(cy.value - pointerY) < RELEASE_EPSILON &&
          grow.value < 0.02;
        if (back) mode = 'free';
      }

      const visible = hasPointer;
      if (visible !== lastVisible) {
        svgEl.style.opacity = visible ? '1' : '0';
        lastVisible = visible;
      }

      const g = grow.value;

      // Drift the turbulence frequency slowly so the ripple flows over time.
      const t = now * 0.001;
      const fx = TURB_BASE_FREQ + Math.sin(t * TURB_DRIFT_SPEED) * TURB_FREQ_DELTA;
      const fy = TURB_BASE_FREQ + Math.sin(t * TURB_DRIFT_SPEED * 0.8 + 1.7) * TURB_FREQ_DELTA;
      turbEl.setAttribute('baseFrequency', `${fx.toFixed(5)} ${fy.toFixed(5)}`);
      // Displacement gated by grow → crisp free dot, rippling wrap.
      dispEl.setAttribute('scale', (TURB_SCALE * g).toFixed(2));

      const radius = Math.min(h.value / 2, MAX_RADIUS);
      rectEl.setAttribute('x', (cx.value - w.value / 2).toFixed(2));
      rectEl.setAttribute('y', (cy.value - h.value / 2).toFixed(2));
      rectEl.setAttribute('width', Math.max(0, w.value).toFixed(2));
      rectEl.setAttribute('height', Math.max(0, h.value).toFixed(2));
      rectEl.setAttribute('rx', radius.toFixed(2));

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
    <svg
      ref={svgRef}
      aria-hidden
      width="100%"
      height="100%"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        mixBlendMode: 'difference',
        pointerEvents: 'none',
        opacity: 0,
        zIndex: 2147483647,
      }}
    >
      <defs>
        {/* Generous filter region so displaced edges aren't clipped. */}
        <filter id="cursorLiquid" x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence
            ref={turbRef}
            type="fractalNoise"
            baseFrequency={TURB_BASE_FREQ}
            numOctaves={TURB_OCTAVES}
            seed={2}
            result="noise"
          />
          <feDisplacementMap
            ref={dispRef}
            in="SourceGraphic"
            in2="noise"
            scale={0}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
      <rect
        ref={rectRef}
        x={-100}
        y={-100}
        width={DOT_SIZE}
        height={DOT_SIZE}
        rx={DOT_SIZE / 2}
        fill="#fff"
        filter="url(#cursorLiquid)"
      />
    </svg>
  );
}
