// src/components/explainer/layout.tsx
import { type CSSProperties, type ReactNode } from 'react';
import { ACCENT, COLUMN, PAGE_TOP, RAIL, RAIL_GAP, SANS } from './tokens';

/** The ~680px reading measure, left-aligned in the main pane. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: COLUMN, fontFamily: SANS, fontSize: '1.05rem', lineHeight: 1.7 }}>
      {children}
    </div>
  );
}

/**
 * One row of the two-pane layout: a thin rail on the left whose content is
 * sticky — it starts level with the row's first line and stays pinned while
 * the row scrolls by, until the next row pushes it out — and the main pane
 * (body text + figures) on the right. The rail cell stretches to the row's
 * full height, which is what bounds the sticky element to its own section.
 */
export function Row({
  rail,
  children,
  labelledBy,
  style,
}: {
  rail: ReactNode;
  children: ReactNode;
  labelledBy?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      style={{
        display: 'grid',
        gridTemplateColumns: `${RAIL} minmax(0, 1fr)`,
        columnGap: RAIL_GAP,
        ...style,
      }}
    >
      <div>
        <div style={{ position: 'sticky', top: PAGE_TOP }}>{rail}</div>
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}

/** Small uppercase-feel label in the rail ("01", "end"). */
export function RailLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: '0.75rem', letterSpacing: '0.14em', color: ACCENT }}>
      {children}
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 1.1em' }}>{children}</p>;
}

export function Chapter({
  id,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Row
      labelledBy={id}
      style={{ marginTop: '6rem' }}
      rail={
        <h2
          id={id}
          style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.2 }}
        >
          {title}
        </h2>
      }
    >
      {children}
    </Row>
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
