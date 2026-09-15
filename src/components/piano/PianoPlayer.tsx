'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clampToViewport, type Point } from './pianoGeometry';
import { useYouTubePlayer } from './useYouTubePlayer';

/** The recording. Bare id only — a `list` param would queue unrelated videos. */
export const PIANO_VIDEO_ID = 'QSbZHTvbjR4';

const WINDOW_W = 400;
const VIDEO_W = 400;
const VIDEO_H = 225; // 16:9 against VIDEO_W
const HEADER_H = 40;
const EXPANDED_H = HEADER_H + VIDEO_H;
const BORDER = 1.5;
const RADIUS = 12;
/** Collapsed, the video covers the bar end completely — it spans the bar's full
 *  *outer* height and runs to its outer right edge, painting over the border
 *  rather than sitting inside it (tucking it inside leaves a hairline of paper
 *  between the two). Width simply follows from 16:9 rather than being picked. */
const THUMB_H = HEADER_H;
const THUMB_W = (THUMB_H * VIDEO_W) / VIDEO_H;
const ROW_GAP = 8;
/** Breathing room between the last control and the video. */
const THUMB_GAP = ROW_GAP;

const CONTROL_BOX = 24; // icon button hit area
const CONTROL_GLYPH = 13; // the glyph centred inside it
/** Icon buttons centre a small glyph in a larger box, so every one of them
 *  carries this much invisible slack on each side. */
const CONTROL_SLACK = (CONTROL_BOX - CONTROL_GLYPH) / 2;
/** Optical inset at the bar's ends. A button against the edge already supplies
 *  its own slack, so the padding there is just ROW_GAP — but the grip is a bare
 *  svg with none, and needs the slack added by hand or the row reads lopsided. */
const EDGE_PAD = ROW_GAP + CONTROL_SLACK;
/** Breathing room kept between the window and every viewport edge. */
export const MARGIN = 12;
export const WINDOW_SIZE = { width: WINDOW_W, height: EXPANDED_H };
/** Intrinsic size of the embed. Constant — the collapse scales it, never resizes it. */
const VIDEO_SIZE = { width: VIDEO_W, height: VIDEO_H };
/** Where the recording opens: 4:01. Initial load only — finishing rewinds to 0. */
const START_SECONDS = 4 * 60 + 1;
/** How long a summon may show nothing before the window appears with a loading
 *  line instead. Past this, "nothing happened" reads as broken. */
const SLOW_MS = 2_500;
/** Where the fallback sends people when the embed can't load. */
const WATCH_URL = `https://www.youtube.com/watch?v=${PIANO_VIDEO_ID}`;

const PIANO_TITLE =
  'me playing chopin piano concerto no 1 with the VAM symphony orchestra at the orpheum theatre';
/** Seconds for one full pass of the title. Longer = slower. */
const TITLE_SCROLL_S = 22;
/** Dissolves the title at both ends instead of clipping it against the bar. */
const TITLE_EDGE_FADE =
  'linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)';

const INK = '#1f1812';
const PAPER = '#f7f7f5';
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const MOVE_MS = 340;

type PianoPlayerProps = {
  visible: boolean;
  position: Point;
  onPositionChange: (position: Point) => void;
  onClose: () => void;
};

export default function PianoPlayer({
  visible,
  position,
  onPositionChange,
  onClose,
}: PianoPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Transport belongs to the embed; the API is still needed to pause on close
  // and to say whether it loaded at all.
  const { ready, failed, pause } = useYouTubePlayer(
    mountRef,
    PIANO_VIDEO_ID,
    VIDEO_SIZE,
    START_SECONDS,
  );

  const windowHeight = collapsed ? HEADER_H : EXPANDED_H;

  // The window always comes back expanded. `collapsed` would otherwise survive a
  // close — this component never unmounts — and the provider clamps the spawn
  // against the *expanded* height, so a collapsed reopen would land a 40px bar
  // where a 265px window was expected.
  useEffect(() => {
    if (!visible) setCollapsed(false);
  }, [visible]);

  // Normally nothing is drawn until the embed is ready, so the window arrives
  // whole with a video in it rather than as a chrome-first shell around a
  // loading hole. But "nothing" must not become "nothing, forever": past
  // SLOW_MS the window appears anyway with a quiet loading line, and a hard
  // failure shows a way out. `ready` latches on for good, so only the very
  // first open ever waits — restoring from the ♪ later is instant.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!visible || ready || failed) {
      setSlow(false);
      return undefined;
    }
    const id = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(id);
  }, [visible, ready, failed]);

  const shown = visible && (ready || slow || failed);

  /* ---------------------------------------------------------------- */
  /*  Pause on close                                                   */
  /* ---------------------------------------------------------------- */

  // Opening never starts playback — from the word or the ♪, the window arrives
  // paused and the listener presses play themselves, at which point `start`
  // takes them to 4:01. Closing pauses so nothing plays while hidden, and the
  // player keeps its position, so a reopen lands exactly where it was left.
  useEffect(() => {
    if (ready && !visible) pause();
  }, [ready, visible, pause]);

  /* ---------------------------------------------------------------- */
  /*  Drag                                                             */
  /* ---------------------------------------------------------------- */

  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  // Mirrored in state, not just the ref: the transition below is decided at
  // render time, and a ref change alone would never schedule that render.
  const [dragging, setDragging] = useState(false);

  const clampHere = useCallback(
    (next: Point, height: number) =>
      clampToViewport(
        next,
        { width: WINDOW_W, height },
        { width: window.innerWidth, height: window.innerHeight },
        MARGIN,
      ),
    [],
  );

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // The window controls own their own gestures.
    if ((event.target as Element).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOffset.current = { dx: event.clientX - position.x, dy: event.clientY - position.y };
    setDragging(true);
  };

  const onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    if (!offset) return;
    onPositionChange(
      clampHere({ x: event.clientX - offset.dx, y: event.clientY - offset.dy }, windowHeight),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOffset.current) return;
    dragOffset.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // A shrinking viewport can strand the window off-screen; pull it back.
  useEffect(() => {
    const onResize = () => onPositionChange(clampHere(position, windowHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position, windowHeight, clampHere, onPositionChange]);

  // Collapsing shortens the window, which can leave it floating below where it
  // belongs; expanding can push it off the bottom. Re-clamp on every change.
  useEffect(() => {
    onPositionChange(clampHere(position, windowHeight));
    // Only when the height itself changes, not on every drag tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  /* ---------------------------------------------------------------- */
  /*  Frame geometry                                                   */
  /* ---------------------------------------------------------------- */

  // The frame is the clip box; the iframe inside it is always VIDEO_W x VIDEO_H
  // and merely scaled, so YouTube never sees a resize and never relayouts.
  const frame = collapsed
    ? {
        // Sits *over* the bar end rather than inside it, covering the border on
        // the top, bottom, and right. Its right corners take the bar's full outer
        // radius since they now land on the outer edge. The higher z-index below
        // is what lets it paint over the header's border.
        left: WINDOW_W - THUMB_W,
        top: 0,
        width: THUMB_W,
        height: THUMB_H,
        radius: `0 ${RADIUS}px ${RADIUS}px 0`,
        border: `0 solid ${INK}`,
      }
    : {
        left: 0,
        top: HEADER_H,
        width: VIDEO_W,
        height: VIDEO_H,
        radius: `0 0 ${RADIUS}px ${RADIUS}px`,
        border: `0 solid ${INK}`,
      };

  const iconButton: React.CSSProperties = {
    display: 'grid',
    placeItems: 'center',
    width: CONTROL_BOX,
    height: CONTROL_BOX,
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: INK,
    cursor: 'pointer',
    flexShrink: 0,
  };

  return (
    <div
      data-piano-player
      aria-hidden={!shown}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: WINDOW_W,
        transform: `translate(${position.x}px, ${position.y}px)`,
        opacity: shown ? 1 : 0,
        visibility: shown ? 'visible' : 'hidden',
        pointerEvents: shown ? 'auto' : 'none',
        zIndex: 30,
        fontFamily: 'var(--font-geist-sans), sans-serif',
        // Transform must not ease while dragging or the window lags the cursor.
        // Hiding waits for the fade to finish; revealing happens immediately.
        transitionProperty: 'transform, opacity, visibility',
        transitionTimingFunction: `${EASE}, ease, linear`,
        transitionDuration: `${dragging ? 0 : MOVE_MS}ms, 220ms, 0ms`,
        transitionDelay: shown ? '0ms, 0ms, 0ms' : '0ms, 0ms, 220ms',
      }}
    >
      {/* ---- header: drag surface + our transport controls ---- */}
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: 'relative',
          height: HEADER_H,
          display: 'flex',
          alignItems: 'center',
          gap: ROW_GAP,
          paddingLeft: EDGE_PAD,
          paddingRight: collapsed ? THUMB_W + THUMB_GAP : ROW_GAP,
          background: PAPER,
          border: `${BORDER}px solid ${INK}`,
          borderBottomWidth: collapsed ? BORDER : 0,
          borderRadius: collapsed ? `${RADIUS}px` : `${RADIUS}px ${RADIUS}px 0 0`,
          cursor: 'grab',
          touchAction: 'none',
          transition: `padding-right ${MOVE_MS}ms ${EASE}, border-radius ${MOVE_MS}ms ${EASE}`,
          zIndex: 1,
        }}
      >
        {/* grip */}
        <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.5 }}>
          {[2, 7, 12].map((cy) =>
            [1.5, 6.5].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" fill={INK} />),
          )}
        </svg>

        {/* Scrolling title, where the transport controls used to be. Two
            identical copies translated by -50% loop seamlessly; the edges are
            masked so the text dissolves instead of clipping against the bar. */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            WebkitMaskImage: TITLE_EDGE_FADE,
            maskImage: TITLE_EDGE_FADE,
          }}
        >
          <div
            className="piano-marquee"
            style={{ animationDuration: `${TITLE_SCROLL_S}s` }}
          >
            <span>{PIANO_TITLE}</span>
            <span aria-hidden>{PIANO_TITLE}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          data-cursor-pad="-4"
          aria-label={collapsed ? 'Expand player' : 'Collapse player'}
          aria-expanded={!collapsed}
          style={iconButton}
        >
          <svg viewBox="0 0 24 24" width={CONTROL_GLYPH} height={CONTROL_GLYPH} aria-hidden="true">
            <path
              d={collapsed ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={onClose}
          data-cursor-pad="-4"
          aria-label="Close player"
          style={iconButton}
        >
          <svg viewBox="0 0 24 24" width={CONTROL_GLYPH} height={CONTROL_GLYPH} aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ---- video frame: absolutely positioned, never re-parented ---- */}
      <div
        style={{
          position: 'absolute',
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          border: frame.border,
          borderRadius: frame.radius,
          overflow: 'hidden',
          background: PAPER,
          // Must out-rank the header: when collapsed the thumbnail moves *into*
          // the header's band, and the header paints an opaque paper background.
          zIndex: 2,
          // Safari drops the overflow clip on transformed descendants without
          // its own compositing layer, letting square corners poke out.
          transform: 'translateZ(0)',
          transition:
            `left ${MOVE_MS}ms ${EASE}, top ${MOVE_MS}ms ${EASE}, ` +
            `width ${MOVE_MS}ms ${EASE}, height ${MOVE_MS}ms ${EASE}, ` +
            `border-radius ${MOVE_MS}ms ${EASE}`,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: VIDEO_W,
            height: VIDEO_H,
            transformOrigin: '0 0',
            transform: `scale(${frame.width / VIDEO_W})`,
            transition: `transform ${MOVE_MS}ms ${EASE}`,
          }}
        >
          <div className="piano-embed" style={{ width: '100%', height: '100%' }}>
            {/* The API replaces this node with the iframe. It must never move. */}
            <div ref={mountRef} />
          </div>
        </div>

        {/* Fallback, over the (unscaled) frame so its text stays legible. The
            window is withheld until `ready` in the normal case, so this is only
            ever seen when the boot is slow or has failed — the two cases where
            showing nothing would be worse. Text is dropped when collapsed; it
            has nowhere to go at 71x40.

            Ordering matters for the children of this frame: the scaled wrapper
            holding the iframe is child[0] and must stay there. Anything
            conditional goes *after* it, so mounting and unmounting never shifts
            the iframe's position in the tree. */}
        {!ready ? (
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              padding: '1rem',
              background: PAPER,
              color: INK,
              fontSize: '0.78rem',
              letterSpacing: '0.02em',
              textAlign: 'center',
              pointerEvents: failed ? 'auto' : 'none',
              userSelect: 'none',
            }}
          >
            {collapsed ? null : failed ? (
              <span>
                couldn&apos;t load the video —{' '}
                <a
                  href={WATCH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: INK, textUnderlineOffset: '0.2em' }}
                >
                  watch on youtube
                </a>
              </span>
            ) : (
              <span style={{ opacity: 0.55 }}>loading…</span>
            )}
          </div>
        ) : null}

        {/* Shield. The embed owns transport in this variant, so the cursor has to
            reach it — but only while expanded. Collapsed, the video is 71x40 and
            YouTube's controls would be both unreadable and easy to hit by
            accident, so the whole thumbnail goes inert. It also covers any drag,
            since an iframe swallows pointermove and would otherwise stutter the
            gesture the moment the cursor crossed the video.

            It carries the header's own drag handlers so the collapsed bar moves
            as one object rather than having a dead patch at its end. While a drag
            started on the header is in flight that element holds pointer capture,
            so these never fire. */}
        {dragging || collapsed ? (
          <div
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: 'absolute',
              inset: 0,
              cursor: dragging ? 'grabbing' : 'grab',
              touchAction: 'none',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
