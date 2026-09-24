// src/components/explainer/figure/MathToggle.tsx
'use client';
import { useId, useState, type ReactNode } from 'react';
import { COLUMN, MONO, RULE, SANS } from '../tokens';

/** "show the math" — expands equations + real GLSL under a chapter. */
export function MathToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div style={{ maxWidth: COLUMN, margin: '1.6rem 0 0' }}>
      <button
        type="button"
        className="ex-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        style={{ fontFamily: SANS, fontSize: '0.82rem', letterSpacing: '0.04em' }}
      >
        {open ? '− hide the math' : '+ show the math'}
      </button>
      {/* 0fr → 1fr grid trick (same as the nav) for a height animation. */}
      <div
        id={id}
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ overflow: 'hidden' }} inert={!open ? true : undefined}>
          <div style={{ paddingTop: '1.1rem' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A display equation line. */
export function Eq({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: '1.05rem', margin: '0.9rem 0', paddingLeft: '1.2rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
      {children}
    </div>
  );
}

/** A code block (GLSL excerpt from the real shader source). */
export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure style={{ margin: '1rem 0 1.3rem' }}>
      {label ? (
        <figcaption style={{ fontFamily: SANS, fontSize: '0.7rem', letterSpacing: '0.1em', marginBottom: '0.4rem', opacity: 0.7 }}>
          {label}
        </figcaption>
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: '0.9rem 1.1rem',
          fontFamily: MONO,
          fontSize: '0.86rem',
          lineHeight: 1.55,
          borderLeft: `2px solid ${RULE}`,
          background: 'rgba(31, 24, 18, 0.035)',
          overflowX: 'auto',
        }}
      >
        <code>{children}</code>
      </pre>
    </figure>
  );
}
