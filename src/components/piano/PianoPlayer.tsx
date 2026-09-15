'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampToViewport,
  formatTime,
  scrubFraction,
  type Point,
} from './pianoGeometry';
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
/** Breathing room between the last control and the video. */
const THUMB_GAP = 8;
/** Breathing room kept between the window and every viewport edge. */
export const MARGIN = 12;
export const WINDOW_SIZE = { width: WINDOW_W, height: EXPANDED_H };
/** Intrinsic size of the embed. Constant — the collapse scales it, never resizes it. */
const VIDEO_SIZE = { width: VIDEO_W, height: VIDEO_H };

const INK = '#1f1812';
const PAPER = '#f7f7f5';
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const MOVE_MS = 340;

type PianoPlayerProps = {
  visible: boolean;
  position: Point;
  onPositionChange: (position: Point) => void;
  onClose: () => void;
  /** Bumped by the provider each time the player is summoned, to (re)start play. */
  playToken: number;
};

export default function PianoPlayer({
  visible,
  position,
  onPositionChange,
  onClose,
  playToken,
}: PianoPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const { ready, playing, currentTime, duration, play, pause, toggle, seekToFraction } =
    useYouTubePlayer(mountRef, PIANO_VIDEO_ID, VIDEO_SIZE);

  const windowHeight = collapsed ? HEADER_H : EXPANDED_H;

  /* ---------------------------------------------------------------- */
  /*  Play on summon / pause on close                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!ready) return;
    if (visible) play();
    else pause();
    // playToken changes on every summon so re-opening resumes playback even
    // though `visible` may not have changed value in between.
  }, [ready, visible, playToken, play, pause]);

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
    // Controls and the scrub track own their own gestures.
    if ((event.target as Element).closest('button, [data-piano-scrub]')) return;
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
  /*  Scrub                                                            */
  /* ---------------------------------------------------------------- */

  const scrubbing = useRef(false);
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const seekFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    seekToFraction(scrubFraction(clientX, rect.left, rect.width));
  };

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing.current = true;
    seekFromPointer(event.clientX);
  };

  const onTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current) seekFromPointer(event.clientX);
  };

  const onTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    scrubbing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

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
    width: '1.5rem',
    height: '1.5rem',
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
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: WINDOW_W,
        transform: `translate(${position.x}px, ${position.y}px)`,
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: 30,
        fontFamily: 'var(--font-geist-sans), sans-serif',
        // Transform must not ease while dragging or the window lags the cursor.
        // Hiding waits for the fade to finish; revealing happens immediately.
        transitionProperty: 'transform, opacity, visibility',
        transitionTimingFunction: `${EASE}, ease, linear`,
        transitionDuration: `${dragging ? 0 : MOVE_MS}ms, 220ms, 0ms`,
        transitionDelay: visible ? '0ms, 0ms, 0ms' : '0ms, 0ms, 220ms',
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
          gap: '0.5rem',
          paddingLeft: '0.5rem',
          paddingRight: collapsed ? THUMB_W + THUMB_GAP : '0.5rem',
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

        <button
          type="button"
          onClick={toggle}
          data-cursor-pad="-4"
          aria-label={playing ? 'Pause' : 'Play'}
          style={iconButton}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" />
            </svg>
          )}
        </button>

        {/* scrub */}
        <div
          ref={trackRef}
          data-piano-scrub
          data-cursor-skip
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          style={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            height: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            touchAction: 'none',
          }}
        >
          <div style={{ position: 'absolute', inset: 'auto 0', height: 2, background: 'rgba(31, 24, 18, 0.22)', borderRadius: 999 }} />
          <div style={{ position: 'absolute', left: 0, width: `${progress * 100}%`, height: 2, background: INK, borderRadius: 999 }} />
          <div
            style={{
              position: 'absolute',
              left: `${progress * 100}%`,
              width: '0.45rem',
              height: '0.45rem',
              marginLeft: '-0.225rem',
              borderRadius: 999,
              background: INK,
            }}
          />
        </div>

        <span
          style={{
            flexShrink: 0,
            fontSize: '0.68rem',
            fontWeight: 400,
            letterSpacing: '0.02em',
            color: INK,
            opacity: 0.75,
            fontVariantNumeric: 'tabular-nums',
            userSelect: 'none',
          }}
        >
          {formatTime(currentTime)}
        </span>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          data-cursor-pad="-4"
          aria-label={collapsed ? 'Expand player' : 'Collapse player'}
          aria-expanded={!collapsed}
          style={iconButton}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
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
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
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
          {/* The fade lives on this wrapper rather than the mount node, because
              the API replaces that node with its own iframe and any style set on
              it goes away with it. */}
          <div
            className="piano-embed"
            style={{
              width: '100%',
              height: '100%',
              opacity: ready ? 1 : 0,
              transition: 'opacity 420ms ease',
            }}
          >
            {/* The API replaces this node with the iframe. It must never move. */}
            <div ref={mountRef} />
          </div>

          {/* Covers the boot gap between mounting and the embed painting, so it
              reads as page rather than a black void. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: PAPER,
              opacity: ready ? 0 : 1,
              transition: 'opacity 420ms ease',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                fontSize: '1.75rem',
                color: INK,
                animation: 'pianoPulse 1.6s ease-in-out infinite',
              }}
            >
              ♪
            </span>
          </div>
        </div>

        {/* Shield: keeps the cursor off the embed so YouTube's hover chrome
            (title, share, "Watch on YouTube") never fires, and stops the iframe
            swallowing pointermove mid-drag. */}
        <div style={{ position: 'absolute', inset: 0, cursor: 'default' }} />
      </div>
    </div>
  );
}
