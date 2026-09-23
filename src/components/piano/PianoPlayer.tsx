'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const GRIP_W = 8; // the six-dot drag glyph
const CONTROL_BOX = 24; // icon button hit area
const CONTROL_GLYPH = 13; // the glyph centred inside it
/** Icon buttons centre a small glyph in a larger box, so every one of them
 *  carries this much invisible slack on each side. */
const CONTROL_SLACK = (CONTROL_BOX - CONTROL_GLYPH) / 2;
/** Optical inset at the bar's ends. A button against the edge already supplies
 *  its own slack, so the padding there is just ROW_GAP — but the grip is a bare
 *  svg with none, and needs the slack added by hand or the row reads lopsided. */
const EDGE_PAD = ROW_GAP + CONTROL_SLACK;
/** Outer width of the tab: its three controls, the gaps between them, the
 *  optical inset at each end, and its borders. Derived rather than picked
 *  because the collapsed thumbnail and the hint panel both butt up against
 *  the tab's right edge and need to know exactly where it is. */
const TAB_W =
  BORDER + EDGE_PAD + GRIP_W + ROW_GAP + CONTROL_BOX + ROW_GAP + CONTROL_BOX + ROW_GAP + BORDER;
/** Where things that attach to the tab's right edge start: on its border, not
 *  beside it, or a hairline of paper shows between the two. */
const TAB_EDGE = TAB_W - BORDER;
/** Breathing room kept between the window and every viewport edge. */
export const MARGIN = 12;
export const WINDOW_SIZE = { width: WINDOW_W, height: EXPANDED_H };
/** Collapsed, the window is just the tab and the thumbnail beside it. */
const COLLAPSED_SIZE = { width: TAB_EDGE + THUMB_W, height: HEADER_H };
/** Intrinsic size of the embed. Constant — the collapse scales it, never resizes it. */
const VIDEO_SIZE = { width: VIDEO_W, height: VIDEO_H };
/** Where the recording opens: 4:01. Initial load only — finishing rewinds to 0. */
const START_SECONDS = 4 * 60 + 1;
/** How long a summon may show nothing before the window appears with a loading
 *  line instead. Past this, "nothing happened" reads as broken. */
const SLOW_MS = 2_500;
/** Where the fallback sends people when the embed can't load. */
const WATCH_URL = `https://www.youtube.com/watch?v=${PIANO_VIDEO_ID}`;

const INK = '#1f1812';
const PAPER = '#f7f7f5';
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const MOVE_MS = 340;
/** The window's opacity fade, in and out. */
const FADE_MS = 220;

/** First-open hint: the tab's right edge slides out to the window's full width,
 *  the explanation shows in the space it opens, and it slides back. Tab height
 *  throughout — it only ever grows rightward. Once per page load. */
const HINT_TEXT =
  'you can drag this anywhere, collapse it, and keep listening as you explore the site';
const HINT_PANEL_W = WINDOW_W - TAB_EDGE;

/** The hint's one animated value: how far the tab's right edge has moved out,
 *  0 → HINT_PANEL_W. A registered custom property (see globals.css) so it can
 *  transition on the root alongside the window's own transform. */
const HINT_VAR = '--piano-hint-w';
const HINT_W = `var(${HINT_VAR})`;
/** Width of the box that draws the tab's top-right corner and right wall: enough
 *  to hold the arc plus a run of straight edge over the border beneath. The hint
 *  widens this same box, so the corner never has to be redrawn or rounded off. */
const CORNER_BOX_W = 2 * RADIUS;
const HINT_DELAY_MS = 500; // let the window's own entrance land first
const HINT_HOLD_MS = 5_500; // long enough to read twice, short enough to not nag

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
  const { ready, failed, pause, retry } = useYouTubePlayer(
    mountRef,
    PIANO_VIDEO_ID,
    VIDEO_SIZE,
    START_SECONDS,
  );

  const windowSize = collapsed ? COLLAPSED_SIZE : WINDOW_SIZE;

  // The window always comes back expanded. `collapsed` would otherwise survive a
  // close — this component never unmounts — and the provider clamps the spawn
  // against the *expanded* height, so a collapsed reopen would land a 40px bar
  // where a 265px window was expected. The reset waits for the fade-out: done
  // in the same commit, the thumbnail would visibly bloom back into a full
  // window while the bar was still fading. A reopen inside that wait cancels
  // the timer, so it resets on the way back in instead.
  useEffect(() => {
    if (visible) {
      setCollapsed(false);
      return undefined;
    }
    const id = window.setTimeout(() => setCollapsed(false), FADE_MS);
    return () => window.clearTimeout(id);
  }, [visible]);

  // Normally nothing is drawn until the embed is ready, so the window arrives
  // whole with a video in it rather than as a chrome-first shell around a
  // loading hole. But "nothing" must not become "nothing, forever": past
  // SLOW_MS the window appears anyway with a quiet loading line, and a hard
  // failure shows a way out. `ready` latches on for good, so only the very
  // first open ever waits — restoring from the ♪ later is instant.
  // A failure leaves `slow` as it was rather than clearing it, so the retry
  // below can hold the window up through the reboot.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!visible || ready) {
      setSlow(false);
      return undefined;
    }
    if (failed) return undefined;
    const id = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(id);
  }, [visible, ready, failed]);

  const shown = visible && (ready || slow || failed);

  // A boot that failed gets another go each time the window is reopened: the
  // script that didn't load on the first summon may well load on the second.
  // Keyed on `visible` alone — reacting to `failed` itself would retry the
  // instant it flipped, in a loop. The retry clears `failed`, which would drop
  // the window for SLOW_MS right after revealing it, so it counts as slow from
  // the start: the window stays up and shows the loading line. A layout effect
  // so the stale "couldn't load" never paints on the way.
  useLayoutEffect(() => {
    if (!visible || !failed || ready) return;
    setSlow(true);
    retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // A reveal must land where it's placed, not glide there. `position` can move
  // while the window is hidden — a summon from the word re-anchors it — and the
  // transform's easing would be seen mid-flight the moment visibility flips.
  // So the render that reveals the window carries no transform easing, the
  // same way a drag tick doesn't. Tracked in a ref rather than state: it only
  // needs to be right for that one render, and must not cause another.
  const wasShown = useRef(false);
  const revealing = shown && !wasShown.current;
  useEffect(() => {
    wasShown.current = shown;
  }, [shown]);

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
  /*  First-open hint                                                  */
  /* ---------------------------------------------------------------- */

  const [hintOpen, setHintOpen] = useState(false);
  const hintShown = useRef(false);
  const hintTimers = useRef<number[]>([]);

  const dismissHint = useCallback(() => {
    hintTimers.current.forEach((id) => window.clearTimeout(id));
    hintTimers.current = [];
    setHintOpen(false);
  }, []);

  // Fires once, the first time there's a working video on screen — not during
  // the slow or failed states, where "drag this around" next to a loading line
  // is just noise, and not while collapsed, where the panel would slide out
  // from a bar sized for the full window and could run off-screen. Returning dismissHint as the cleanup means closing the window
  // mid-hint retracts it rather than leaving it stuck open for the next reopen.
  useEffect(() => {
    if (hintShown.current || !ready || !visible || collapsed) return undefined;
    hintShown.current = true;
    hintTimers.current = [
      window.setTimeout(() => setHintOpen(true), HINT_DELAY_MS),
      window.setTimeout(dismissHint, HINT_DELAY_MS + HINT_HOLD_MS),
    ];
    return dismissHint;
  }, [ready, visible, collapsed, dismissHint]);

  /* ---------------------------------------------------------------- */
  /*  Drag                                                             */
  /* ---------------------------------------------------------------- */

  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  // Mirrored in state, not just the ref: the transition below is decided at
  // render time, and a ref change alone would never schedule that render.
  const [dragging, setDragging] = useState(false);

  const clampHere = useCallback(
    (next: Point, size: { width: number; height: number }) =>
      clampToViewport(next, size, { width: window.innerWidth, height: window.innerHeight }, MARGIN),
    [],
  );

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // The window controls own their own gestures.
    if ((event.target as Element).closest('button')) return;
    // Touching the bar means they've found it; stop explaining.
    dismissHint();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOffset.current = { dx: event.clientX - position.x, dy: event.clientY - position.y };
    setDragging(true);
  };

  const onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    if (!offset) return;
    onPositionChange(
      clampHere({ x: event.clientX - offset.dx, y: event.clientY - offset.dy }, windowSize),
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
    const onResize = () => onPositionChange(clampHere(position, windowSize));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [position, windowSize, clampHere, onPositionChange]);

  // Collapsing shrinks the window, which can leave it floating away from the
  // edge it was against; expanding can push it off the bottom or right. Re-clamp
  // on every change.
  useEffect(() => {
    onPositionChange(clampHere(position, windowSize));
    // Only when the size itself changes, not on every drag tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  /* ---------------------------------------------------------------- */
  /*  Frame geometry                                                   */
  /* ---------------------------------------------------------------- */

  // The frame is the clip box; the iframe inside it is always VIDEO_W x VIDEO_H
  // and merely scaled, so YouTube never sees a resize and never relayouts.
  const frame = collapsed
    ? {
        // Tucks in beside the tab, starting *on* its right border rather than
        // after it. Its right corners take the window's full outer radius since
        // they land on the outer edge. The higher z-index below is what lets it
        // paint over the tab's border.
        left: TAB_EDGE,
        top: 0,
        width: THUMB_W,
        height: THUMB_H,
        radius: `0 ${RADIUS}px ${RADIUS}px 0`,
      }
    : {
        // Square only at top-left, where the tab sits on it.
        left: 0,
        top: HEADER_H,
        width: VIDEO_W,
        height: VIDEO_H,
        radius: `0 ${RADIUS}px ${RADIUS}px ${RADIUS}px`,
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
        // The root box is WINDOW_W wide and only as tall as the tab; most of it
        // is empty air beside the tab. The tab and the frame opt back in.
        pointerEvents: 'none',
        zIndex: 30,
        fontFamily: 'var(--font-geist-sans), sans-serif',
        // Transform must not ease while dragging (the window would lag the
        // cursor), while hidden, or on the reveal itself (see `revealing`).
        // Hiding waits for the fade to finish; revealing happens immediately.
        transitionProperty: `transform, opacity, visibility, ${HINT_VAR}`,
        transitionTimingFunction: `${EASE}, ease, linear, ${EASE}`,
        transitionDuration:
          `${dragging || !shown || revealing ? 0 : MOVE_MS}ms, ${FADE_MS}ms, 0ms, ${MOVE_MS}ms`,
        transitionDelay: shown ? '0ms, 0ms, 0ms, 0ms' : `0ms, 0ms, ${FADE_MS}ms, 0ms`,
        ...({ [HINT_VAR]: `${hintOpen ? HINT_PANEL_W : 0}px` } as React.CSSProperties),
      }}
    >
      {/* ---- tab: drag surface + window controls ---- */}
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: 'relative',
          width: TAB_W,
          height: HEADER_H,
          display: 'flex',
          alignItems: 'center',
          gap: ROW_GAP,
          paddingLeft: EDGE_PAD,
          paddingRight: ROW_GAP,
          background: PAPER,
          border: `${BORDER}px solid ${INK}`,
          borderBottomWidth: collapsed ? BORDER : 0,
          // The right side is drawn by the wall element below, not a border,
          // because the hint slides it outward.
          borderRightWidth: 0,
          // Top-left is always the window's outer corner. Top-right squares off
          // when the collapsed thumbnail attaches there. Bottom-right always sits
          // on the video or the thumbnail. Bottom-left is an outer corner only
          // when collapsed. Both changes, and the bottom border appearing, ease
          // in step with the frame so the outline reshapes as the video moves
          // rather than snapping at the start.
          borderRadius: `${RADIUS}px ${collapsed ? 0 : RADIUS}px 0 ${collapsed ? RADIUS : 0}px`,
          // No easing while hidden: the post-close collapse reset must snap.
          transition: shown
            ? `border-radius ${MOVE_MS}ms ${EASE}, border-bottom-width ${MOVE_MS}ms ${EASE}`
            : 'none',
          cursor: 'grab',
          touchAction: 'none',
          pointerEvents: shown ? 'auto' : 'none',
          zIndex: 1,
        }}
      >
        {/* The tab's right wall and top-right corner, in place of a border —
            and, stretched, the first-open hint. At rest it is exactly the border
            it replaces. The hint widens it rightward, carrying the corner and wall
            with it to the window's full width; its paper fills the space it opens
            and continues the tab's own, so tab and hint stay one shape at the
            tab's height. Its top border overlies the tab's; same ink. z-index -1
            puts it above the tab's background but under the controls, which the
            paper would otherwise cover near the right edge. */}
        <div
          aria-hidden={!hintOpen}
          style={{
            position: 'absolute',
            top: -BORDER, // on the tab's border box, not inside it
            right: `calc(0px - ${HINT_W})`,
            width: `calc(${CORNER_BOX_W}px + ${HINT_W})`,
            // Collapsed, stop short of the tab's bottom border, which the paper
            // would otherwise paint over.
            height: HEADER_H - (collapsed ? BORDER : 0),
            overflow: 'hidden',
            background: PAPER,
            borderTop: `${BORDER}px solid ${INK}`,
            borderRight: `${BORDER}px solid ${INK}`,
            borderTopRightRadius: collapsed ? 0 : RADIUS,
            // Tracks the tab's own corner and bottom border. Width is left out:
            // it is driven by the hint variable, which already transitions.
            transition: shown
              ? `border-top-right-radius ${MOVE_MS}ms ${EASE}, height ${MOVE_MS}ms ${EASE}`
              : 'none',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <p
            role="status"
            style={{
              // Laid out at the hint's final size and pinned where the tab ends,
              // so the widening box uncovers the text rather than reflowing it.
              position: 'absolute',
              left: CORNER_BOX_W - BORDER,
              top: 0,
              margin: 0,
              width: HINT_PANEL_W - BORDER, // inside the right border
              height: HEADER_H - BORDER, // inside the top border
              padding: `0 ${ROW_GAP}px`,
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.68rem',
              lineHeight: 1.25,
              letterSpacing: '0.02em',
              textAlign: 'center',
              color: INK,
              // Text fades in after the hint has opened and out before it
              // closes, so it's never seen half-clipped.
              opacity: hintOpen ? 0.8 : 0,
              transition: `opacity 200ms ease ${hintOpen ? '160ms' : '0ms'}`,
              userSelect: 'none',
            }}
          >
            {HINT_TEXT}
          </p>
        </div>

        {/* grip */}
        <svg
          width={GRIP_W}
          height="14"
          viewBox={`0 0 ${GRIP_W} 14`}
          aria-hidden="true"
          style={{ flexShrink: 0, opacity: 0.5 }}
        >
          {[2, 7, 12].map((cy) =>
            [1.5, 6.5].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" fill={INK} />),
          )}
        </svg>

        <button
          type="button"
          onClick={() => {
            dismissHint();
            setCollapsed((c) => !c);
          }}
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
          borderRadius: frame.radius,
          overflow: 'hidden',
          background: PAPER,
          pointerEvents: shown ? 'auto' : 'none',
          // Must out-rank the tab: when collapsed the thumbnail sits on the
          // tab's right border, and the tab paints an opaque paper background.
          zIndex: 2,
          // Safari drops the overflow clip on transformed descendants without
          // its own compositing layer, letting square corners poke out.
          transform: 'translateZ(0)',
          // No easing while hidden: the post-close collapse reset must snap.
          transition: shown
            ? `left ${MOVE_MS}ms ${EASE}, top ${MOVE_MS}ms ${EASE}, ` +
              `width ${MOVE_MS}ms ${EASE}, height ${MOVE_MS}ms ${EASE}, ` +
              `border-radius ${MOVE_MS}ms ${EASE}`
            : 'none',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: VIDEO_W,
            height: VIDEO_H,
            transformOrigin: '0 0',
            transform: `scale(${frame.width / VIDEO_W})`,
            transition: shown ? `transform ${MOVE_MS}ms ${EASE}` : 'none',
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
