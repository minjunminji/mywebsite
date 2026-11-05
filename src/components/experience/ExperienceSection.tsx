'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPencilStroke } from '@/components/pencilStroke';
import { wobbleLoop } from '@/components/piano/sketchOutline';
import { ownsKeys, scrollsElsewhere } from '@/components/story/inputOwnership';
import { wheelDeltaPx } from '@/components/story/projectReading';
import { EXPERIENCE } from '@/components/story/storyData';
import { INK, INK_SOFT, PAPER, inkAlpha } from '@/theme';
import {
  OPEN_GATE,
  circleLoop,
  clampStop,
  draftProgress,
  easeToward,
  gateWheel,
  lineLayout,
  wobbleLine,
} from './experienceLine';

/*
 * ExperienceSection — the last stop, drawn as one transit line.
 *
 * Left: a pencil line with a station per job, oldest at the top, ending at
 * "now". It drafts itself in on arrival and boils like the cursor; a small
 * train rides to the stop you're on, and the line behind it is bright.
 * Right: that stop's card (company, role, every bullet at full strength).
 *
 * One scroll gesture, arrow/page key or station click moves one stop.
 * Projects are read one lit sentence at a time; this section deliberately
 * isn't, so each job reads whole.
 */

const FONT = 'var(--font-alte-haas-grotesk), Arial, sans-serif';
const MONO = 'var(--font-inconsolata), ui-monospace, monospace';

/** The line runs oldest to newest, top to bottom; EXPERIENCE lists newest first. */
const STOPS = [...EXPERIENCE].reverse();

const BOIL_FPS = 8;
const LINE_AMP = 2.2;
const LINE_FINE_AMP = 0.8;
const RING_AMP = 0.9;
const RING_FINE_AMP = 0.3;
const RING_R = 7;
const RING_R_ON = 8.5;
/** The line ahead of the train. */
const LINE_FAINT = 0.32;
const DRAFT_MS = 1400;
const TRAIN_TAU_MS = 260;
const SWAP_MS = 160;
/** Swipe distance that moves one stop on touch. */
const SWIPE_PX = 50;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type Props = {
  /** True while the experience stop is on screen (drives the arrival). */
  shown: boolean;
  /** True while it's on screen and nothing covers it (drives input). */
  active: boolean;
};

export default function ExperienceSection({ shown, active }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const nowRef = useRef<HTMLSpanElement>(null);
  const wake = useRef<() => void>(() => {});
  const arriveAt = useRef(0);
  const stopRef = useRef(0);
  const cardStopRef = useRef(0);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [stop, setStop] = useState(0);
  const [cardStop, setCardStop] = useState(0);
  const [swapping, setSwapping] = useState(false);
  const [stepped, setStepped] = useState(false);

  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => (size.w > 0 ? lineLayout(size.w, size.h, STOPS.length) : null), [size]);

  // Arriving starts at the first stop and drafts the line in again.
  useEffect(() => {
    if (!shown) return;
    arriveAt.current = performance.now();
    stopRef.current = 0;
    cardStopRef.current = 0;
    setStop(0);
    setCardStop(0);
    setSwapping(false);
    setStepped(false);
    wake.current();
  }, [shown]);

  // A new stop: the card fades out, swaps, and fades back in.
  useEffect(() => {
    wake.current();
    if (stop === cardStopRef.current) return;
    const reduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    setSwapping(true);
    const timer = window.setTimeout(() => {
      cardStopRef.current = stop;
      setCardStop(stop);
      setSwapping(false);
    }, reduced ? 0 : SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [stop]);

  const goTo = (index: number) => {
    const next = clampStop(index, STOPS.length);
    if (next === stopRef.current) return;
    stopRef.current = next;
    setStop(next);
    setStepped(true);
  };

  // Input: one gesture, one stop. Only while the section is up and uncovered.
  useEffect(() => {
    const section = sectionRef.current;
    if (!active || !section) return;
    let gate = OPEN_GATE;
    let touchY: number | null = null;
    const step = (d: number) => goTo(stopRef.current + d);

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch zoom
      const el = e.target instanceof Element ? e.target : null;
      if (el && scrollsElsewhere(el, section)) return;
      e.preventDefault();
      const r = gateWheel(gate, wheelDeltaPx(e.deltaY, e.deltaMode, window.innerHeight), performance.now());
      gate = r.gate;
      if (r.step) step(r.step);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target instanceof Element ? e.target : null;
      // A focused station still takes arrows and page keys; Space presses it.
      const onStation = el !== null && section.contains(el);
      if (ownsKeys(el) && !(onStation && e.key !== ' ' && e.key !== 'Enter')) return;
      const forward = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
      const back = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
      if (forward || back) {
        e.preventDefault();
        step(forward ? 1 : -1);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        goTo(e.key === 'Home' ? 0 : STOPS.length - 1);
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const end = e.changedTouches[0]?.clientY;
      if (touchY === null || end === undefined) return;
      const dy = touchY - end;
      touchY = null;
      if (Math.abs(dy) > SWIPE_PX) step(dy > 0 ? 1 : -1);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
    // goTo only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // The map: drawn on rAF while it drafts in or the train moves, then woken
  // only for each boil step (8fps), like the piano player's outline.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !layout || !shown) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const stroke = createPencilStroke(ctx);
    const reducedMq = window.matchMedia(REDUCED_MOTION_QUERY);
    const { x, top, bottom, stations } = layout;

    let raf = 0;
    let timer = 0;
    let last = performance.now();
    let trainY = stations[stopRef.current];

    const draw = (now: number) => {
      raf = 0;
      const reduced = reducedMq.matches;
      const dt = Math.min(64, now - last);
      last = now;
      const seed = reduced ? 0 : Math.floor(now / (1000 / BOIL_FPS)) % 997;
      const k = reduced ? 1 : draftProgress(now - arriveAt.current, DRAFT_MS);
      const current = stopRef.current;
      const target = stations[current];
      trainY = easeToward(trainY, target, dt, reduced ? 0 : TRAIN_TAU_MS);

      // How far down the line has drafted, and how visible a point at `y` is.
      const reach = top + (bottom - top) * k;
      const seen = (y: number) => Math.min(Math.max((reach - y) / 40 + 1, 0), 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);

      // The whole line, faint; then the stretch the train has covered, bright.
      ctx.globalAlpha = LINE_FAINT;
      stroke(wobbleLine([[x, top], [x, reach]], seed, LINE_AMP, LINE_FINE_AMP), seed, 2, false);
      const travelled = Math.min(trainY, reach);
      if (travelled > stations[0]) {
        ctx.globalAlpha = 1;
        stroke(wobbleLine([[x, stations[0]], [x, travelled]], seed + 5, LINE_AMP, LINE_FINE_AMP), seed + 5, 2.4, false);
      }

      // The "now" terminus.
      const nowA = seen(bottom);
      if (nowA > 0) {
        ctx.globalAlpha = nowA;
        stroke(wobbleLine([[x - 8, bottom], [x + 8, bottom]], seed + 20, 1, 0.4), seed + 20, 2, false);
      }
      if (nowRef.current) nowRef.current.style.opacity = String(nowA);

      // Stations: open rings, the current one filled.
      stations.forEach((sy, i) => {
        const a = seen(sy);
        const label = labelRefs.current[i];
        if (label) label.style.opacity = String(a);
        if (a <= 0) return;
        const ring = wobbleLoop(circleLoop(x, sy, i === current ? RING_R_ON : RING_R), seed + 30 + i, RING_AMP, RING_FINE_AMP);
        ctx.globalAlpha = a;
        ctx.beginPath();
        ring.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = i === current ? INK : PAPER;
        ctx.fill();
        stroke(ring, seed + 30 + i, 1.8);
      });

      // The train: a small car on the line, once the line is drawn.
      if (k > 0.9) {
        ctx.globalAlpha = Math.min((k - 0.9) / 0.1, 1);
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.roundRect(x - 5, trainY - 10, 10, 20, 4);
        ctx.fill();
        ctx.fillStyle = PAPER;
        ctx.fillRect(x - 2.5, trainY - 6, 5, 4);
      }
      ctx.globalAlpha = 1;

      if (reduced) return;
      if (k < 1 || trainY !== target) {
        raf = requestAnimationFrame(draw);
      } else {
        const stepMs = 1000 / BOIL_FPS;
        timer = window.setTimeout(() => {
          raf = requestAnimationFrame(draw);
        }, stepMs - (now % stepMs) + 1);
      }
    };

    wake.current = () => {
      window.clearTimeout(timer);
      if (!raf) raf = requestAnimationFrame(draw);
    };
    reducedMq.addEventListener('change', wake.current);
    wake.current();
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      reducedMq.removeEventListener('change', wake.current);
      wake.current = () => {};
    };
  }, [layout, shown, size]);

  const entry = STOPS[cardStop];
  const lastStop = STOPS.length - 1;

  return (
    <section
      ref={sectionRef}
      aria-label="experience"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: FONT, color: INK, zIndex: 4 }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />

      {/* Stations: the label and ring are one button that rides there. */}
      {layout ? (
        <ol aria-label="stops" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STOPS.map((s, i) => {
            const on = i === stop;
            return (
              <li key={s.key}>
                <button
                  ref={(el) => {
                    labelRefs.current[i] = el;
                  }}
                  type="button"
                  aria-current={on ? 'step' : undefined}
                  onClick={() => goTo(i)}
                  style={{
                    position: 'absolute',
                    right: size.w - layout.x - 14,
                    top: layout.stations[i] - 14,
                    maxWidth: layout.x - 8,
                    padding: '0 30px 0 8px',
                    border: 'none',
                    background: 'transparent',
                    color: on ? INK : inkAlpha(0.55),
                    font: 'inherit',
                    textAlign: 'right',
                    cursor: 'pointer',
                    transition: 'color 240ms ease',
                  }}
                >
                  <span style={{ display: 'block', fontSize: '0.95rem', lineHeight: 1.2, fontWeight: on ? 700 : 400 }}>
                    {s.company}
                  </span>
                  <span style={{ display: 'block', fontFamily: MONO, fontSize: '0.75rem', lineHeight: 1.3 }}>{s.year}</span>
                  {i === lastStop ? (
                    <span
                      aria-hidden
                      style={{
                        display: 'block',
                        fontFamily: MONO,
                        fontSize: '0.75rem',
                        lineHeight: 1.3,
                        color: INK_SOFT,
                        opacity: on ? 1 : 0,
                        transition: on ? 'opacity 300ms ease 250ms' : 'opacity 150ms ease',
                      }}
                    >
                      you are here
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      {layout ? (
        <span
          ref={nowRef}
          aria-hidden
          style={{
            position: 'absolute',
            left: layout.x,
            top: layout.bottom + 10,
            transform: 'translateX(-50%)',
            fontFamily: MONO,
            fontSize: '0.75rem',
            color: inkAlpha(0.7),
          }}
        >
          now
        </span>
      ) : null}

      {/* The stop's card */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 'clamp(4.5rem, 10vh, 6rem)',
          bottom: '2.5rem',
          width: 'min(34rem, calc(50% - 2.5rem))',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <article
          aria-live="polite"
          style={{
            opacity: swapping ? 0 : 1,
            transform: swapping ? 'translateY(6px)' : 'none',
            transition: 'opacity 160ms ease, transform 160ms ease',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'clamp(1.75rem, 2.8vw, 2.75rem)', lineHeight: 1, fontWeight: 700, textWrap: 'balance' }}>
            {entry.company}
          </h2>
          <p
            style={{
              margin: '0.6rem 0 0',
              fontSize: 'clamp(0.72rem, 0.9vw, 0.86rem)',
              lineHeight: 1.25,
              fontWeight: 700,
              letterSpacing: '0.03em',
              color: INK_SOFT,
            }}
          >
            {entry.title} · {entry.year}
          </p>
          <ul style={{ listStyle: 'none', margin: '1.9rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {entry.bullets.map((b, i) => (
              <li
                key={`${entry.key}-${i}`}
                style={{ position: 'relative', paddingLeft: '1.1em', fontSize: 'clamp(0.95rem, 1.3vw, 1.25rem)', lineHeight: 1.5 }}
              >
                <span aria-hidden style={{ position: 'absolute', left: 0, color: INK_SOFT }}>
                  &rsaquo;
                </span>
                {b}
              </li>
            ))}
          </ul>
        </article>
        <p
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            margin: 0,
            fontFamily: MONO,
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            color: inkAlpha(0.5),
            opacity: stepped ? 0 : 1,
            transition: 'opacity 400ms ease',
          }}
        >
          scroll for the next stop ↓
        </p>
      </div>
    </section>
  );
}
