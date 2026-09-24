// src/components/explainer/ShaderExplainer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { DOCKED_CENTER_Y } from '@/components/story/StoryNav';
import { useScrollFade } from '@/components/useScrollFade';
import { useInertOutside } from '@/components/useInertOutside';
import Ch01Passes from './chapters/Ch01Passes';
import Ch02Stroke from './chapters/Ch02Stroke';
import Hero from './chapters/Hero';
import { ExplainerOpenContext } from './explainerContext';
import { INK, MUTED, PAPER, SANS, SERIF, WIDE } from './tokens';
import { P, Prose } from './layout';

type ShaderExplainerProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen editorial takeover explaining the about-page reveal shader.
 * Loaded with next/dynamic and mounted on first open, then kept mounted so the
 * fade-out plays and reopening is instant. Story state underneath is
 * untouched. See docs/plans/2026-09-24-shader-explainer-design.md.
 */
export default function ShaderExplainer({ open, onClose }: ShaderExplainerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const { scrollRef, contentRef, onScroll, maskImage } = useScrollFade();
  // Keep Tab inside the takeover while it's open.
  useInertOutside(rootRef, open);

  // First mount arrives with open=true; start hidden and flip on the next
  // frame so the opacity transition actually runs.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (open) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const id = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    restoreFocusRef.current?.focus?.();
    return undefined;
  }, [open]);

  return (
    <ExplainerOpenContext.Provider value={open}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label="how the ink reveal works"
        aria-hidden={!open}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: PAPER,
          color: INK,
          opacity: visible ? 1 : 0,
          transition: 'opacity 300ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="close"
          data-cursor-pad="-4"
          style={{
            position: 'absolute',
            top: DOCKED_CENTER_Y,
            right: '1.5rem',
            transform: 'translateY(-50%)',
            zIndex: 1,
            width: '2rem',
            height: '2rem',
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'transparent',
            color: INK,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div
          ref={scrollRef}
          className="custom-scroll"
          onScroll={onScroll}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitMaskImage: maskImage,
            maskImage,
          }}
        >
          <article
            ref={contentRef}
            style={{
              maxWidth: WIDE,
              margin: '0 auto',
              padding: 'clamp(4.5rem, 12vh, 7.5rem) 2rem 8rem',
              fontFamily: SERIF,
              fontSize: '1.25rem',
              lineHeight: 1.6,
              color: INK,
            }}
          >
            <Prose>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 400, fontSize: '3.4rem', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
                how the ink reveal works
              </h1>
              <p style={{ margin: '1rem 0 0', fontStyle: 'italic', fontSize: '1.45rem', lineHeight: 1.45, color: MUTED }}>
                a walk through the webgl2 shader behind the about page: the math, a
                couple of bugs, and figures you can poke at.
              </p>
              <p style={{ margin: '1.4rem 0 0', fontFamily: SANS, fontSize: '0.78rem', letterSpacing: '0.06em', color: MUTED }}>
                webgl2 · glsl es 3.0 · ~8 min · interactive
              </p>
            </Prose>

            <Hero />
            <Prose>
              <P>
                the effect looks like one thing, but it&apos;s really two small programs running on
                the gpu every frame, fed by a bit of math on the cpu. we&apos;ll build it up piece
                by piece: first the loop that remembers where you&apos;ve been, then the brush, then
                the ink edge.
              </P>
            </Prose>

            <Ch01Passes />
            <Ch02Stroke />
            {/* Ch03–06 + outro are added in the rest of Phase D. */}
          </article>
        </div>
      </div>
    </ExplainerOpenContext.Provider>
  );
}
