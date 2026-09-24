// src/components/explainer/layout.tsx
import { type ReactNode } from 'react';
import { ACCENT, COLUMN, SANS, SERIF } from './tokens';

/** The ~680px reading column, centered inside the wider article. */
export function Prose({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: COLUMN, margin: '0 auto' }}>{children}</div>;
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 1.1em' }}>{children}</p>;
}

export function Chapter({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} style={{ marginTop: '6rem' }}>
      <Prose>
        <div style={{ fontFamily: SANS, fontSize: '0.75rem', letterSpacing: '0.14em', color: ACCENT }}>
          {number}
        </div>
        <h2
          id={id}
          style={{ margin: '0.35rem 0 1.3rem', fontFamily: SERIF, fontWeight: 400, fontSize: '2.2rem', lineHeight: 1.15 }}
        >
          {title}
        </h2>
      </Prose>
      {children}
    </section>
  );
}

/** Inline code / symbols in running text. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code style={{ fontFamily: 'var(--font-inconsolata), monospace', fontSize: '0.88em', padding: '0 0.15em' }}>
      {children}
    </code>
  );
}
