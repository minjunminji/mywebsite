'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPencilStroke } from '@/components/pencilStroke';
import { clipPathFor, wobbleLoop, type Pt } from '@/components/piano/sketchOutline';
import ProjectVideo from '@/components/story/ProjectVideo';
import { creaseOpacity, crumpleLoop, crumpleTransform, newCrumple, roundRectLoop, unfold, type Crumple } from './crumple';
import { PROJECT_COMPONENTS } from './projectComponents';
import { EMPTY_SEQUENCE, mediaKey, requestMedia, stepMedia, type MediaSequence } from './projectReading';
import type { ProjectMedia } from './storyData';
import { PAPER } from '@/theme';

/*
 * LivingMedia — the project media slot on the left of the screen.
 *
 * One media at a time, framed by the living line (the piano player's boiling
 * pencil outline) and clipped to it. It enters by uncrumpling like a sheet of
 * paper and leaves by scrunching back up; a different media waits for the old
 * one to leave. Under reduced motion it fades instead and the line holds still.
 * The sequencing is pure (projectReading.ts) and the geometry too (crumple.ts);
 * this component drives them on rAF and writes the result straight to the DOM.
 */

const OPEN_MS = 900;
const CLOSE_MS = 420;
const FADE_MS = 220; // reduced motion, both ways
const BOIL_FPS = 8;
const WOBBLE_AMP = 4;
const WOBBLE_FINE_AMP = 1.375;
const LINE_WIDTH = 1.4;
const RADIUS = 10;
/** The frame's largest box within the area left of the project panel. */
const MAX_W_FRACTION = 0.72;
const MAX_W_PX = 640;
const MAX_H_FRACTION = 0.46;
/** Where the frame's centre sits in the area, as fractions of it. */
const CENTER_X = 0.5;
const CENTER_Y = 0.56;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type Area = { w: number; h: number };

function frameSize(media: ProjectMedia, area: Area) {
  const maxW = Math.min(area.w * MAX_W_FRACTION, MAX_W_PX);
  const maxH = area.h * MAX_H_FRACTION;
  const aspect = media.width / media.height;
  const w = Math.min(maxW, maxH * aspect);
  return { w: Math.round(w), h: Math.round(w / aspect) };
}

/** Canvas margin: the crumple's facets reach about a third of the height out. */
const padFor = (h: number) => Math.ceil(h * 0.36) + 10;

type Props = {
  /** The media the lit chunk wants, or null for none. */
  media: ProjectMedia | null;
  /** False while a takeover covers the page, so video and live components rest. */
  playing: boolean;
};

export default function LivingMedia({ media, playing }: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const creasesRef = useRef<SVGSVGElement | null>(null);
  const lineRef = useRef<HTMLCanvasElement | null>(null);

  const [area, setArea] = useState<Area>({ w: 0, h: 0 });
  // Mirrors the sequence's `shown`, so React mounts the right content.
  const [shown, setShown] = useState<ProjectMedia | null>(null);
  // Fixed until the first entrance rolls a random one, so the server and the
  // client render the same (unseen) creases.
  const [crumple, setCrumple] = useState<Crumple>(() => newCrumple(() => 0.5));

  const seq = useRef<MediaSequence>(EMPTY_SEQUENCE);
  const wake = useRef<() => void>(() => {});
  const areaNow = useRef<Area>(area);
  const crumpleNow = useRef<Crumple>(crumple);
  areaNow.current = area;
  crumpleNow.current = crumple;

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The drawing loop. Runs every frame while media opens or closes, then only
  // on each boil step; sleeps entirely when nothing is shown.
  useEffect(() => {
    const frameEl = frameRef.current;
    const clipEl = clipRef.current;
    const canvas = lineRef.current;
    const ctx = canvas?.getContext('2d');
    if (!frameEl || !clipEl || !canvas || !ctx) return undefined;

    const strokePencil = createPencilStroke(ctx);
    const reducedMq = window.matchMedia(REDUCED_MOTION_QUERY);
    let raf = 0;
    let timer = 0;
    let last: number | null = null;
    let shownKey = '';
    let canvasKey = '';
    let base: Pt[] = [];
    let baseKey = '';

    const draw = (now: number) => {
      raf = 0;
      const reduced = reducedMq.matches;
      const dt = last === null ? 16 : Math.min(now - last, 64);
      last = now;
      const before = seq.current;
      seq.current = stepMedia(before, dt, reduced ? FADE_MS : OPEN_MS, reduced ? FADE_MS : CLOSE_MS);
      const s = seq.current;

      const key = mediaKey(s.shown);
      if (key !== shownKey) {
        shownKey = key;
        setShown(s.shown);
        // A fresh crumple per entrance, so no two look alike.
        const next = newCrumple();
        crumpleNow.current = next;
        setCrumple(next);
      }

      if (!s.shown || s.progress <= 0 || areaNow.current.w === 0) {
        frameEl.style.visibility = 'hidden';
        last = s.direction === 0 ? null : last;
        if (s.direction !== 0) raf = requestAnimationFrame(draw);
        return;
      }
      frameEl.style.visibility = 'visible';

      const { w, h } = frameSize(s.shown, areaNow.current);
      const pad = padFor(h);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sizeKey = `${w}x${h}@${dpr}`;
      if (sizeKey !== canvasKey) {
        canvasKey = sizeKey;
        canvas.width = Math.round((w + 2 * pad) * dpr);
        canvas.height = Math.round((h + 2 * pad) * dpr);
        canvas.style.left = `${-pad}px`;
        canvas.style.top = `${-pad}px`;
        canvas.style.width = `${w + 2 * pad}px`;
        canvas.style.height = `${h + 2 * pad}px`;
      }
      if (sizeKey !== baseKey) {
        baseKey = sizeKey;
        base = roundRectLoop(w, h, RADIUS);
      }

      // Reduced motion: no crumple, the sheet just fades; the line holds still.
      const e = reduced ? 1 : unfold(s.progress);
      const seed = reduced ? 0 : Math.floor(now / (1000 / BOIL_FPS)) % 997;
      const c = crumpleNow.current;
      const loop = wobbleLoop(crumpleLoop(base, c, e, w, h), seed, WOBBLE_AMP, WOBBLE_FINE_AMP);
      const { rotate, scale } = reduced ? { rotate: 0, scale: 1 } : crumpleTransform(c, e);

      frameEl.style.transform = `rotate(${rotate}deg) scale(${scale})`;
      frameEl.style.opacity = reduced ? String(s.progress) : '1';
      clipEl.style.clipPath = clipPathFor(loop, { x: 0, y: 0 });
      if (creasesRef.current) creasesRef.current.style.opacity = String(reduced ? 0 : creaseOpacity(e));
      // Fully open is the only time it should take clicks.
      clipEl.style.pointerEvents = s.progress >= 1 ? 'auto' : 'none';

      ctx.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
      ctx.clearRect(-pad, -pad, w + 2 * pad, h + 2 * pad);
      // The canvas scales with the sheet; keep the stroke its real width.
      strokePencil(loop, seed, LINE_WIDTH / scale);

      if (s.direction !== 0) {
        raf = requestAnimationFrame(draw);
      } else if (!reduced) {
        last = null;
        const step = 1000 / BOIL_FPS;
        timer = window.setTimeout(() => {
          raf = requestAnimationFrame(draw);
        }, step - (now % step) + 1);
      } else {
        last = null;
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
  }, []);

  // A new wanted media (or none) starts the close-then-open sequence.
  useEffect(() => {
    seq.current = requestMedia(seq.current, media);
    wake.current();
  }, [media]);

  // The area changed size: redraw at the new frame size.
  useEffect(() => {
    wake.current();
  }, [area]);

  const size = shown && area.w > 0 ? frameSize(shown, area) : { w: 0, h: 0 };
  const live = playing && shown !== null && mediaKey(shown) === mediaKey(media);
  const Component = shown?.kind === 'component' ? PROJECT_COMPONENTS[shown.id] : null;

  return (
    <div
      ref={areaRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '55%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <div
        ref={frameRef}
        style={{
          position: 'absolute',
          left: area.w * CENTER_X - size.w / 2,
          top: area.h * CENTER_Y - size.h / 2,
          width: size.w,
          height: size.h,
          transformOrigin: '50% 50%',
          visibility: 'hidden',
        }}
      >
        <div
          ref={clipRef}
          // White screenshots and video: the cursor draws in blue over them.
          data-cursor-ink={shown && shown.kind !== 'component' ? 'paper' : undefined}
          aria-label={shown?.kind === 'component' ? shown.label : undefined}
          role={shown?.kind === 'component' ? 'group' : undefined}
          style={{ position: 'absolute', inset: 0, background: PAPER, pointerEvents: 'none' }}
        >
          {shown?.kind === 'image' ? (
            <img
              key={shown.src}
              src={shown.src}
              alt={shown.alt}
              draggable={false}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none' }}
            />
          ) : null}
          {shown?.kind === 'video' ? (
            <ProjectVideo
              key={shown.src}
              active={live}
              src={shown.src}
              title={shown.title}
              poster={shown.posterSrc}
              muted
              loop
              playsInline
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
          {Component ? <Component active={live} /> : null}
          {/* Creases from the crumple, fading out as the sheet flattens. */}
          <svg
            ref={creasesRef}
            aria-hidden="true"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0 }}
          >
            {crumple.creases.map(([x1, y1, x2, y2], i) => (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(0, 25, 80, 0.55)"
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={x1 + 0.003}
                  y1={y1}
                  x2={x2 + 0.003}
                  y2={y2}
                  stroke="rgba(255, 255, 255, 0.55)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </svg>
        </div>
        <canvas ref={lineRef} aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
