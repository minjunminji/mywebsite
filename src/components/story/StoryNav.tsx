'use client';

import type { CSSProperties, ReactNode } from 'react';
import { NAV, isProjectStop, stopIndexById } from '@/components/story/storyData';

const INK = '#1f1812';
const PALE = 'rgba(31, 24, 18, 0.28)';
const EXPAND_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const CHILD_STAGGER_MS = 70;
const NODE_PAD_PX = 5;
// One curve/duration for the whole dock move (position, scale, spacing) so it
// settles as a single smooth motion instead of parts easing out of sync.
const LAYOUT_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const LAYOUT_MS = 600;
const EXPAND_MS = 560;

type StoryNavProps = {
  position: number; // dock position (top/size); holds until arrival when going back
  expandPosition: number; // expansion position (projects sub-nodes); follows target
  fillProgress: number; // continuous playhead in stop-space (drives the black fill)
  visible: boolean; // false during the intro
  isTransitioning: boolean;
  onNavigate: (stopIndex: number) => void;
};

type Piece = {
  key: string;
  kind: 'conn' | 'node';
  stopIndex: number;
  label: string;
  small: boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export default function StoryNav({
  position,
  expandPosition,
  fillProgress,
  visible,
  isTransitioning,
  onNavigate,
}: StoryNavProps) {
  const docked = position !== 0;
  const projectsExpanded = isProjectStop(expandPosition);
  const gapValue = docked ? '0.55rem' : '0.9rem';
  // Project sub-nodes sit tighter than the main row (30% less spacing).
  const childGapValue = docked ? '0.385rem' : '0.63rem';
  const connectorWidth = docked ? '1.5rem' : '2.25rem';
  // Project sub-nodes get very short connectors so they read as sub-pages.
  const childConnectorWidth = docked ? '0.375rem' : '0.5625rem';

  // Rough pixel widths so a step's fill is a single constant-speed sweep across
  // its pieces (line then text), proportioned by their actual on-screen size.
  const connPx = docked ? 24 : 36;
  const childConnPx = docked ? 6 : 9;
  const charPx = docked ? 9 : 15;
  const estWidth = (piece: Piece): number =>
    piece.kind === 'conn'
      ? piece.small
        ? childConnPx
        : connPx
      : piece.label.length * charPx * (piece.small ? 0.82 : 1) + NODE_PAD_PX;

  // Visual order of every fillable piece (main row + project children).
  const order: Piece[] = [];
  NAV.forEach((entry, entryIndex) => {
    const entryStopIndex = stopIndexById(entry.stopId);
    if (entryIndex > 0) {
      order.push({ key: `conn-${entry.label}`, kind: 'conn', stopIndex: entryStopIndex, label: entry.label, small: false });
    }
    order.push({ key: `node-${entry.label}`, kind: 'node', stopIndex: entryStopIndex, label: entry.label, small: false });
    if (entry.children) {
      entry.children.forEach((child) => {
        const childStopIndex = stopIndexById(child.stopId);
        order.push({ key: `cconn-${child.stopId}`, kind: 'conn', stopIndex: childStopIndex, label: child.label, small: true });
        order.push({ key: `cnode-${child.stopId}`, kind: 'node', stopIndex: childStopIndex, label: child.label, small: true });
      });
    }
  });

  // For each step (group of pieces sharing a stop index), sweep fillProgress
  // across the group's pieces in order, allocated by width — so the ink runs
  // line → text continuously rather than filling both at once.
  const fracById: Record<string, number> = {};
  let i = 0;
  while (i < order.length) {
    const stepStop = order[i].stopIndex;
    const group: Piece[] = [];
    while (i < order.length && order[i].stopIndex === stepStop) {
      group.push(order[i]);
      i += 1;
    }
    if (stepStop === 0) {
      group.forEach((piece) => {
        fracById[piece.key] = 1; // home is always filled
      });
      continue;
    }
    const total = group.reduce((sum, piece) => sum + estWidth(piece), 0) || 1;
    let cumulative = 0;
    group.forEach((piece) => {
      const width = estWidth(piece);
      const start = stepStop - 1 + cumulative / total;
      const end = stepStop - 1 + (cumulative + width) / total;
      fracById[piece.key] = clamp01((fillProgress - start) / Math.max(end - start, 1e-6));
      cumulative += width;
    });
  }

  const lineFill = (fraction: number): string => {
    const pct = fraction * 100;
    return `linear-gradient(to right, ${INK} ${pct}%, ${PALE} ${pct}%)`;
  };

  const textFill = (fraction: number): CSSProperties => {
    const pct = fraction * 100;
    return {
      backgroundImage: `linear-gradient(to right, ${INK} ${pct}%, ${PALE} ${pct}%)`,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    };
  };

  const handleClick = (stopIndex: number): void => {
    if (isTransitioning) {
      return;
    }
    onNavigate(stopIndex);
  };

  const connector = (key: string, fraction: number, extra?: CSSProperties): ReactNode => (
    <span
      key={key}
      aria-hidden
      style={{
        display: 'inline-block',
        width: connectorWidth,
        height: '1px',
        background: lineFill(fraction),
        transition: 'width 520ms ease',
        ...extra,
      }}
    />
  );

  const node = (
    key: string,
    label: string,
    stopIndex: number,
    fraction: number,
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
        fontFamily: 'inherit',
        fontWeight: 'inherit',
        fontSize: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...textFill(fraction),
        ...extraStyle,
      }}
    >
      {label}
    </button>
  );

  const items: ReactNode[] = [];

  NAV.forEach((entry, entryIndex) => {
    const entryStopIndex = stopIndexById(entry.stopId);
    if (entryIndex > 0) {
      items.push(connector(`conn-${entry.label}`, fracById[`conn-${entry.label}`] ?? 0));
    }
    items.push(node(`node-${entry.label}`, entry.label, entryStopIndex, fracById[`node-${entry.label}`] ?? 0));

    if (entry.children) {
      const childEls: ReactNode[] = [];
      entry.children.forEach((child, childIndex) => {
        const childStopIndex = stopIndexById(child.stopId);
        const delay = projectsExpanded ? childIndex * CHILD_STAGGER_MS : 0;
        const reveal: CSSProperties = {
          opacity: projectsExpanded ? 1 : 0,
          transform: projectsExpanded ? 'translateX(0)' : 'translateX(-10px)',
          transition: `opacity 320ms ease ${delay}ms, transform 460ms ${EXPAND_EASE} ${delay}ms`,
        };
        childEls.push(
          connector(`cconn-${child.stopId}`, fracById[`cconn-${child.stopId}`] ?? 0, {
            ...reveal,
            width: childConnectorWidth,
          }),
        );
        childEls.push(
          node(`cnode-${child.stopId}`, child.label, childStopIndex, fracById[`cnode-${child.stopId}`] ?? 0, {
            fontSize: '0.82em',
            fontWeight: 350,
            ...reveal,
          }),
        );
      });

      items.push(
        <div
          key={`group-${entry.label}`}
          style={{
            display: 'inline-grid',
            gridTemplateColumns: projectsExpanded ? '1fr' : '0fr',
            marginLeft: projectsExpanded ? '0' : `-${gapValue}`,
            transition: `grid-template-columns ${EXPAND_MS}ms ${EXPAND_EASE}, margin-left ${EXPAND_MS}ms ${EXPAND_EASE}`,
          }}
        >
          <div
            style={{
              minWidth: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: childGapValue,
            }}
          >
            {childEls}
          </div>
        </div>,
      );
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
        gap: gapValue,
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontWeight: 450,
        letterSpacing: '0.03em',
        textTransform: 'lowercase',
        fontSize: docked ? 'clamp(0.78rem, 1vw, 0.95rem)' : 'clamp(1.05rem, 1.8vw, 1.6rem)',
        opacity: visible ? 1 : 0,
        transition:
          `top ${LAYOUT_MS}ms ${LAYOUT_EASE}, transform ${LAYOUT_MS}ms ${LAYOUT_EASE}, ` +
          `font-size ${LAYOUT_MS}ms ${LAYOUT_EASE}, gap ${LAYOUT_MS}ms ${LAYOUT_EASE}, ` +
          'opacity 800ms ease 750ms',
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
