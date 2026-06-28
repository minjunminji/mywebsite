'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  NAV,
  isProjectStop,
  stopIndexById,
} from '@/components/story/storyData';

const INK = '#1f1812';
const PALE = 'rgba(31, 24, 18, 0.28)';

type StoryNavProps = {
  position: number; // current stop, or the target while transitioning
  visible: boolean; // false during the intro
  isTransitioning: boolean;
  onNavigate: (stopIndex: number) => void;
};

export default function StoryNav({
  position,
  visible,
  isTransitioning,
  onNavigate,
}: StoryNavProps) {
  const docked = position !== 0;
  const projectsExpanded = isProjectStop(position);

  const colorAt = (stopIndex: number): string => (position >= stopIndex ? INK : PALE);

  const handleClick = (stopIndex: number): void => {
    if (isTransitioning) {
      return;
    }
    onNavigate(stopIndex);
  };

  const connector = (key: string, stopIndex: number): ReactNode => (
    <span
      key={key}
      aria-hidden
      style={{
        display: 'inline-block',
        width: docked ? '2rem' : '3rem',
        height: '2px',
        background: colorAt(stopIndex),
        transition: 'background 360ms ease, width 520ms ease',
      }}
    />
  );

  const node = (
    key: string,
    label: string,
    stopIndex: number,
    extraStyle?: CSSProperties,
  ): ReactNode => (
    <button
      key={key}
      type="button"
      onClick={() => handleClick(stopIndex)}
      style={{
        border: 'none',
        background: 'transparent',
        padding: '0.1rem 0.15rem',
        margin: 0,
        cursor: 'pointer',
        color: colorAt(stopIndex),
        fontFamily: 'inherit',
        fontWeight: 'inherit',
        fontSize: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        transition: 'color 360ms ease',
        ...extraStyle,
      }}
    >
      {label}
    </button>
  );

  const items: ReactNode[] = [];

  NAV.forEach((entry, entryIndex) => {
    const entryStopIndex = stopIndexById(entry.stopId);
    // No leading connector before the first node — the bar starts at "home".
    if (entryIndex > 0) {
      items.push(connector(`conn-${entry.label}`, entryStopIndex));
    }

    if (entry.children && projectsExpanded) {
      entry.children.forEach((child, childIndex) => {
        const childStopIndex = stopIndexById(child.stopId);
        if (childIndex > 0) {
          items.push(connector(`conn-${child.stopId}`, childStopIndex));
        }
        items.push(
          node(`node-${child.stopId}`, child.label, childStopIndex, {
            fontSize: '0.82em',
            opacity: 0,
            animation: 'storyChildIn 320ms ease forwards',
            animationDelay: `${childIndex * 90}ms`,
          }),
        );
      });
    } else {
      items.push(node(`node-${entry.label}`, entry.label, entryStopIndex));
    }
  });

  return (
    <nav
      aria-label="Story navigation"
      style={{
        position: 'fixed',
        left: '50%',
        top: docked ? '1.6rem' : '33.333%',
        transform: docked ? 'translate(-50%, 0)' : 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        gap: docked ? '0.55rem' : '0.9rem',
        fontFamily: "'Cascadia Mono', monospace",
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'lowercase',
        fontSize: docked ? 'clamp(0.78rem, 1vw, 0.95rem)' : 'clamp(1.05rem, 1.8vw, 1.6rem)',
        opacity: visible ? 1 : 0,
        transition:
          'top 520ms cubic-bezier(0.65,0,0.35,1), font-size 520ms ease, gap 520ms ease, opacity 360ms ease',
        pointerEvents: visible && !isTransitioning ? 'auto' : 'none',
        userSelect: 'none',
        zIndex: 25,
        whiteSpace: 'nowrap',
      }}
    >
      {items}
    </nav>
  );
}
