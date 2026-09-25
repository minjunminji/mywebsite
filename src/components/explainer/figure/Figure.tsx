// src/components/explainer/figure/Figure.tsx
'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useExplainerOpen } from '../explainerContext';
import { COLUMN, INK, MUTED, RULE, SANS } from '../tokens';
import { ControlShelf } from './controls';

const FigureActiveContext = createContext(false);

/** True while this figure is on screen and the takeover is open. */
export const useFigureActive = () => useContext(FigureActiveContext);

type FigureProps = {
  number: number;
  caption: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
};

/** A figure plate: hairline rules, controls row, numbered caption. */
export function Figure({ number, caption, controls, children }: FigureProps) {
  const ref = useRef<HTMLElement | null>(null);
  const open = useExplainerOpen();
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      rootMargin: '120px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <FigureActiveContext.Provider value={open && onScreen}>
      <figure
        ref={ref}
        style={{
          margin: '2.8rem 0',
          padding: '1.6rem 0 1.1rem',
          borderTop: `1px solid ${RULE}`,
          borderBottom: `1px solid ${RULE}`,
        }}
      >
        {children}
        {controls ? (
          <div
            role="group"
            aria-label={`figure ${number} controls`}
            style={{ marginTop: '1.1rem', fontFamily: SANS, fontSize: '0.8rem', color: INK }}
          >
            <ControlShelf>{controls}</ControlShelf>
          </div>
        ) : null}
        <figcaption
          style={{
            maxWidth: COLUMN,
            marginTop: '0.95rem',
            fontFamily: SANS,
            fontStyle: 'italic',
            fontSize: '1.02rem',
            lineHeight: 1.5,
            color: MUTED,
          }}
        >
          {caption}
        </figcaption>
      </figure>
    </FigureActiveContext.Provider>
  );
}
