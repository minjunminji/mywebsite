'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { NAV_ASSEMBLY_MS, NAV_DRAW_MS, NAV_GLIDE_MS } from '@/components/story/navTiming';
import { NAV, isProjectStop, stopIndexById } from '@/components/story/storyData';

const INK = '#1f1812';
const PALE_DOCKED = 'rgba(31, 24, 18, 0.28)';
// Every fill reads the pale ink through this variable (see globals.css).
const PALE = 'var(--nav-pale)';
const EXPAND_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const CHILD_STAGGER_MS = 70;
const NODE_PAD_PX = 5;
// One curve/duration (NAV_GLIDE_MS) for the whole dock move (position, scale,
// spacing) so it settles as a single smooth motion instead of parts easing out
// of sync.
const LAYOUT_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const EXPAND_MS = 560;
// Docked, the bar sits in the top-left corner.
const DOCK_INSET = '1.5rem';
const DOCKED_FONT_SIZE = 'clamp(0.78rem, 1vw, 0.95rem)';
// Vertical center of the docked bar: the inset plus half a button (the font
// size at line-height 1, plus its 0.1rem top and bottom padding). The top-right
// cluster and the tldr close button center on this so they sit level with it.
export const DOCKED_CENTER_Y = `calc(${DOCK_INSET} + (${DOCKED_FONT_SIZE} + 0.2rem) / 2)`;
// The nav fades in once (the intro reveal) via the `opacity 800ms ease 750ms`
// transition below. `visible` flips true at the START of that delayed fade, so
// the buttons stay invisible for ~1.55s after it; gate interactivity on the
// fade actually finishing or the cursor metaball wraps them before they appear.
const REVEAL_DELAY_MS = 750;
const REVEAL_DURATION_MS = 800;

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
  // Stay non-interactive until the intro fade has finished (see REVEAL_* above).
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    if (!visible) {
      setInteractive(false);
      return;
    }
    const id = window.setTimeout(() => setInteractive(true), REVEAL_DELAY_MS + REVEAL_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [visible]);

  const docked = position !== 0;
  const projectsExpanded = isProjectStop(expandPosition);
  // True for NAV_ASSEMBLY_MS after the bar docks, so anything that expands on
  // the same click (the projects sub-nodes) waits for the bar to form. Updated
  // during render so the hold lands in the same commit that flips `docked`.
  const [prevDocked, setPrevDocked] = useState(docked);
  const [assembling, setAssembling] = useState(false);
  if (docked !== prevDocked) {
    setPrevDocked(docked);
    setAssembling(docked);
  }
  useEffect(() => {
    if (!assembling) {
      return;
    }
    const id = window.setTimeout(() => setAssembling(false), NAV_ASSEMBLY_MS);
    return () => window.clearTimeout(id);
  }, [assembling]);
  const expandHold = assembling && projectsExpanded ? NAV_ASSEMBLY_MS : 0;
  // Docking glides first and draws the lines after; undocking retracts the
  // lines first and glides after. Every layout property shares this timing.
  const glideDelay = docked ? 0 : NAV_DRAW_MS;
  const glide = (property: string): string =>
    `${property} ${NAV_GLIDE_MS}ms ${LAYOUT_EASE} ${glideDelay}ms`;
  const gapValue = docked ? '0.55rem' : '0.9rem';
  // Project sub-nodes sit tighter than the main row (30% less spacing).
  const childGapValue = docked ? '0.385rem' : '0.63rem';
  const connectorWidth = docked ? '1.5rem' : '2.25rem';
  // Project sub-nodes get very short connectors so they read as sub-pages.
  const childConnectorWidth = docked ? '0.375rem' : '0.5625rem';
  // Those sub-page connectors render as a small dot rather than a line.
  const childDotSize = docked ? '3.5px' : '5px';

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

  const connector = (
    key: string,
    fraction: number,
    extra?: CSSProperties,
    dot = false,
  ): ReactNode =>
    dot ? (
      // A dot instead of a line. The outer span keeps the connector's footprint
      // (so spacing/expansion are unchanged) and centers a small filled circle;
      // the same gradient inks it in as the playhead sweeps past.
      <span
        key={key}
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: childConnectorWidth,
          height: childConnectorWidth,
          transition: 'width 520ms ease',
          ...extra,
        }}
      >
        <span
          style={{
            width: childDotSize,
            height: childDotSize,
            borderRadius: '50%',
            background: lineFill(fraction),
          }}
        />
      </span>
    ) : (
      <span
        key={key}
        aria-hidden
        style={{
          display: 'inline-block',
          width: connectorWidth,
          height: '1px',
          background: lineFill(fraction),
          // Hidden on the landing; drawn left to right once the glide lands,
          // and retracted toward the left before the bar glides home.
          transform: docked ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: 'left center',
          transition:
            `${glide('width')}, ` +
            `transform ${NAV_DRAW_MS}ms ${docked ? 'ease-out' : 'ease-in'} ${docked ? NAV_GLIDE_MS : 0}ms`,
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
    attrs?: { tabIndex?: number; 'aria-label'?: string },
  ): ReactNode => {
    // Alte Haas ships as separate regular and bold files, so font-weight itself
    // would snap between faces. Overlay the two faces and crossfade them during
    // the dock glide to make the landing's bold labels soften smoothly.
    const fixedWeight = extraStyle?.fontWeight;
    const weightFade = `opacity ${NAV_GLIDE_MS}ms ${LAYOUT_EASE} ${glideDelay}ms`;
    const labelLayer = (weight: number, opacity: number): ReactNode => (
      <span
        aria-hidden
        style={{
          gridArea: '1 / 1',
          fontWeight: weight,
          opacity,
          transition: weightFade,
          ...textFill(fraction),
        }}
      >
        {label}
      </span>
    );

    return (
      <button
        key={key}
        type="button"
        onClick={() => handleClick(stopIndex)}
        {...attrs}
        aria-label={attrs?.['aria-label'] ?? label}
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
          display: 'inline-grid',
          ...extraStyle,
        }}
      >
        {fixedWeight === undefined ? (
          <>
            {labelLayer(700, docked ? 0 : 1)}
            {labelLayer(400, docked ? 1 : 0)}
          </>
        ) : (
          <span aria-hidden style={{ fontWeight: fixedWeight, ...textFill(fraction) }}>
            {label}
          </span>
        )}
      </button>
    );
  };

  const [head, ...entries] = NAV;
  const headConnKey = `conn-${entries[0].label}`;
  const items: ReactNode[] = [
    // The name (home) plus the line into the first entry. Collapsed on the
    // landing: the name only exists as the head of the docked bar.
    <div
      key="head"
      aria-hidden={!docked}
      style={{
        display: 'inline-grid',
        gridTemplateColumns: docked ? '1fr' : '0fr',
        marginRight: docked ? '0' : `-${gapValue}`,
        opacity: docked ? 1 : 0,
        transition: [glide('grid-template-columns'), glide('margin-right'), glide('opacity')].join(', '),
      }}
    >
      <div
        style={{
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: gapValue,
          transition: glide('gap'),
        }}
      >
        {node(`node-${head.label}`, head.label, stopIndexById(head.stopId), fracById[`node-${head.label}`] ?? 1, { fontWeight: 700 }, {
          tabIndex: docked ? 0 : -1,
          'aria-label': `${head.label}, home`,
        })}
        {connector(headConnKey, fracById[headConnKey] ?? 0)}
      </div>
    </div>,
  ];

  entries.forEach((entry, entryIndex) => {
    const entryStopIndex = stopIndexById(entry.stopId);
    if (entryIndex > 0) {
      items.push(connector(`conn-${entry.label}`, fracById[`conn-${entry.label}`] ?? 0));
    }
    items.push(node(`node-${entry.label}`, entry.label, entryStopIndex, fracById[`node-${entry.label}`] ?? 0));

    if (entry.children) {
      const childEls: ReactNode[] = [];
      entry.children.forEach((child, childIndex) => {
        const childStopIndex = stopIndexById(child.stopId);
        const delay = projectsExpanded ? expandHold + childIndex * CHILD_STAGGER_MS : 0;
        const reveal: CSSProperties = {
          opacity: projectsExpanded ? 1 : 0,
          transform: projectsExpanded ? 'translateX(0)' : 'translateX(-10px)',
          transition: `opacity 320ms ease ${delay}ms, transform 460ms ${EXPAND_EASE} ${delay}ms`,
        };
        childEls.push(
          connector(
            `cconn-${child.stopId}`,
            fracById[`cconn-${child.stopId}`] ?? 0,
            { ...reveal, width: childConnectorWidth },
            true,
          ),
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
            transition:
              `grid-template-columns ${EXPAND_MS}ms ${EXPAND_EASE} ${expandHold}ms, ` +
              `margin-left ${EXPAND_MS}ms ${EXPAND_EASE} ${expandHold}ms`,
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
        left: docked ? DOCK_INSET : '50%',
        top: docked ? DOCK_INSET : '33.333%',
        transform: docked ? 'translate(0, 0)' : 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        gap: gapValue,
        fontFamily: "var(--font-alte-haas-grotesk), Arial, sans-serif",
        fontWeight: 450,
        letterSpacing: '0.03em',
        textTransform: 'lowercase',
        fontSize: docked ? DOCKED_FONT_SIZE : 'clamp(1.3rem, 2.3vw, 2rem)',
        opacity: visible ? 1 : 0,
        ...({ '--nav-pale': docked ? PALE_DOCKED : INK } as CSSProperties),
        transition: [
          glide('--nav-pale'),
          glide('left'),
          glide('top'),
          glide('transform'),
          glide('font-size'),
          glide('gap'),
          'opacity 800ms ease 750ms',
        ].join(', '),
        pointerEvents: interactive && !isTransitioning ? 'auto' : 'none',
        userSelect: 'none',
        zIndex: 25,
        whiteSpace: 'nowrap',
      }}
    >
      {items}
    </nav>
  );
}
