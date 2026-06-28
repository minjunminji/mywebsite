'use client';

/* ------------------------------------------------------------------ */
/*  PROTOTYPE — /cursor-lab                                            */
/*                                                                    */
/*  A scratch lab page (NOT part of the real site, not linked from any */
/*  nav) for comparing three "liquid cursor that wraps a button's      */
/*  shape with a subtle wobble" techniques. Pick one with the          */
/*  segmented toggle; exactly one technique component is mounted at a   */
/*  time so switching tears the previous one down. The global          */
/*  CustomCursor is guarded off on this route (see CustomCursor.tsx).  */
/* ------------------------------------------------------------------ */

import { useState, type CSSProperties } from 'react';
import CursorSpringJelly from '@/components/cursorLab/CursorSpringJelly';
import CursorTurbulence from '@/components/cursorLab/CursorTurbulence';
import CursorSDF from '@/components/cursorLab/CursorSDF';

type Technique = 'jelly' | 'turbulence' | 'sdf';

const TECHNIQUES: { id: Technique; label: string; description: string }[] = [
  {
    id: 'jelly',
    label: 'Spring jelly (CSS)',
    description:
      'A single DOM div springs to hug the button (landing with a tiny elastic jiggle), then a low-amplitude sine wobbles its scale and corner radius. Lightest technique — no filters, no WebGL.',
  },
  {
    id: 'turbulence',
    label: 'Turbulence (SVG)',
    description:
      'The same springed rounded-rect, but its edges ripple through an SVG feTurbulence + feDisplacementMap filter whose frequency drifts over time, like a living watery membrane.',
  },
  {
    id: 'sdf',
    label: 'SDF blob (WebGL)',
    description:
      'A full-screen WebGL shader evaluates the signed distance to a rounded box, smooth-min’d with the cursor dot and domain-warped by noise, so the dot melts into the button as one liquid body.',
  },
];

const INK = '#1f1812';
const CREAM = '#f7f7f5';

const ink = (alpha = 1) => `rgba(31, 24, 18, ${alpha})`;

export default function CursorLabPage() {
  const [technique, setTechnique] = useState<Technique>('jelly');
  const active = TECHNIQUES.find((t) => t.id === technique)!;

  const targetBase: CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: INK,
    fontFamily: 'var(--font-inconsolata), monospace',
    padding: '10px 16px',
    letterSpacing: '0.02em',
    lineHeight: 1.1,
    cursor: 'none',
  };

  return (
    // `cursor-hidden` (from globals.css) forces cursor:none on this wrapper and
    // every descendant with !important, so UA pointer/hand cursors don't show.
    <main
      className="cursor-hidden"
      style={{
        minHeight: '100vh',
        background: CREAM,
        color: INK,
        fontFamily: 'var(--font-inconsolata), monospace',
        padding: '48px 40px 120px',
        cursor: 'none',
      }}
    >
      <h1
        style={{
          fontSize: 14,
          fontWeight: 400,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: ink(0.55),
          margin: 0,
        }}
      >
        cursor lab
      </h1>

      {/* Segmented toggle */}
      <div
        role="group"
        aria-label="Technique"
        style={{
          display: 'inline-flex',
          marginTop: 24,
          border: `1px solid ${ink(0.25)}`,
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        {TECHNIQUES.map((t) => {
          const isActive = t.id === technique;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTechnique(t.id)}
              aria-pressed={isActive}
              style={{
                appearance: 'none',
                border: 'none',
                background: isActive ? INK : 'transparent',
                color: isActive ? CREAM : ink(0.7),
                fontFamily: 'var(--font-inconsolata), monospace',
                fontSize: 13,
                letterSpacing: '0.02em',
                padding: '10px 18px',
                cursor: 'none',
                transition: 'background 160ms ease, color 160ms ease',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active technique description */}
      <p
        style={{
          maxWidth: 620,
          marginTop: 16,
          marginBottom: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: ink(0.65),
        }}
      >
        {active.description}
      </p>

      {/* Sample targets — varied shapes/sizes so wrapping is obvious. */}
      <section
        style={{
          marginTop: 72,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 48,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 56, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...targetBase, fontSize: 15 }}>
            ok
          </button>
          <button type="button" style={{ ...targetBase, fontSize: 22 }}>
            about
          </button>
          <button type="button" style={{ ...targetBase, fontSize: 18 }}>
            view the full project
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 56, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...targetBase, fontSize: 40, fontWeight: 500 }}>
            big hello
          </button>
          <button type="button" style={{ ...targetBase, fontSize: 12, letterSpacing: '0.22em' }}>
            tiny caps label
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 56, flexWrap: 'wrap' }}>
          <a
            href="https://example.com/work"
            onClick={(e) => e.preventDefault()}
            style={{
              ...targetBase,
              padding: '6px 2px',
              fontSize: 18,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
            }}
          >
            a text link
          </a>
          <a
            href="https://example.com/reel"
            onClick={(e) => e.preventDefault()}
            style={{
              ...targetBase,
              padding: '6px 2px',
              fontSize: 28,
              textDecoration: 'underline',
              textUnderlineOffset: 6,
            }}
          >
            watch the reel
          </a>
        </div>
      </section>

      {/* Mount exactly ONE technique; switching unmounts (and cleans up) the rest. */}
      {technique === 'jelly' && <CursorSpringJelly />}
      {technique === 'turbulence' && <CursorTurbulence />}
      {technique === 'sdf' && <CursorSDF />}
    </main>
  );
}
