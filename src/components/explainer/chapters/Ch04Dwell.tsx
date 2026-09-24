// src/components/explainer/chapters/Ch04Dwell.tsx
'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { FAST_RADIUS_SCALE, FAST_SPEED, SLOW_SPEED, createBrush, stepBrush } from '@/components/reveal/brush';
import { BLOB_FS, DEFAULT_EDGE, glslExcerpt } from '@/components/reveal/shaders';
import { createCpuMask, stepCpuMask, type CpuMask } from '../explainerMath';
import { Figure, useFigureActive } from '../figure/Figure';
import { Slider, Toggle } from '../figure/controls';
import { Code, Eq, MathToggle } from '../figure/MathToggle';
import { prepareCanvas2D, useAnimationFrame, useElementSize, useReducedMotion } from '../hooks';
import { C, Chapter, P, Prose } from '../layout';
import { ACCENT, ACCENT_RGB, INK, INK_RGB, MUTED, RULE, SANS } from '../tokens';

type DwellMode = 'on' | 'off';
type ViewMode = 'field' | 'reveal';

const MASK_W = 192;
const MASK_H = 108;
const MASK_ASPECT = MASK_W / MASK_H;
const BASE_RADIUS = 0.15;
const FADE_DURATION = 2.5;
// One figure-eight loop (lemniscate, starts and ends at the origin) per 1.6s,
// then the same 1.6s parked at the origin — so parking never jumps.
const AUTOPILOT_CYCLE = 3.2;
const AUTOPILOT_MOVE = 1.6;

const dwellOptions: readonly { value: DwellMode; label: string }[] = [
  { value: 'on', label: 'on' },
  { value: 'off', label: 'off' },
];
const viewOptions: readonly { value: ViewMode; label: string }[] = [
  { value: 'field', label: 'field' },
  { value: 'reveal', label: 'reveal' },
];

// tokens.ts only gives PAPER as a hex string; the mask-to-pixel blend below
// needs it as an RGB triple, same value as tokens.PAPER (#f7f7f5).
const PAPER_RGB: readonly [number, number, number] = [247, 247, 245];

/** A fixed-size circular buffer of floats — pushing never allocates. */
type Ring = { data: Float32Array; head: number; filled: number };
function createRing(size: number): Ring {
  return { data: new Float32Array(size), head: 0, filled: 0 };
}
function ringPush(r: Ring, v: number) {
  r.data[r.head] = v;
  r.head = (r.head + 1) % r.data.length;
  if (r.filled < r.data.length) r.filled += 1;
}
/** Oldest-to-newest points string for an SVG polyline, mapped over [0, w] x [0, h]. */
function ringPoints(r: Ring, w: number, h: number, min: number, max: number): string {
  if (r.filled < 2) return '';
  const n = r.data.length;
  const start = r.filled < n ? 0 : r.head;
  const pts: string[] = [];
  for (let i = 0; i < r.filled; i++) {
    const v = r.data[(start + i) % n];
    const x = (i / (n - 1)) * w;
    const y = h - (Math.min(Math.max(v, min), max) - min) / (max - min) * h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

const RING_SIZE = 180;

function Sparkline({
  title,
  min,
  max,
  minLabel,
  maxLabel,
  refLines,
  innerRef,
}: {
  title: string;
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  refLines?: readonly number[];
  innerRef: RefObject<SVGPolylineElement | null>;
}) {
  const w = 200;
  const h = 44;
  const yOf = (v: number) => h - ((v - min) / (max - min)) * h;
  return (
    <div>
      <div style={{ fontFamily: SANS, fontSize: '0.72rem', letterSpacing: '0.08em', color: MUTED, marginBottom: '0.3rem' }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={`${title}, recent history`}>
        <line x1={0} y1={h - 0.5} x2={w} y2={h - 0.5} stroke={RULE} strokeWidth={1} />
        {refLines?.map((v) => (
          <line key={v} x1={0} y1={yOf(v)} x2={w} y2={yOf(v)} stroke={INK} strokeWidth={1} strokeDasharray="2,2" opacity={0.35} />
        ))}
        <polyline ref={innerRef} points="" fill="none" stroke={ACCENT} strokeWidth={1.5} />
        <text x={2} y={8} fontFamily={SANS} fontSize="8" fill={INK}>{maxLabel}</text>
        <text x={2} y={h - 2} fontFamily={SANS} fontSize="8" fill={INK}>{minLabel}</text>
      </svg>
    </div>
  );
}

function DwellFigure({ dwellMode, strength, view }: { dwellMode: DwellMode; strength: number; view: ViewMode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = useElementSize(wrapRef);
  const active = useFigureActive();
  const reducedMotion = useReducedMotion();

  const maskRef = useRef<CpuMask | null>(null);
  if (!maskRef.current) maskRef.current = createCpuMask(MASK_W, MASK_H);
  const brushRef = useRef(createBrush(BASE_RADIUS));
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const hoverRef = useRef({ x: 10, y: 10, active: false, newStroke: false });
  const autopilotWasOnRef = useRef(false);

  const speedRing = useRef(createRing(RING_SIZE));
  const radiusRing = useRef(createRing(RING_SIZE));
  const dwellRing = useRef(createRing(RING_SIZE));
  const speedPolyRef = useRef<SVGPolylineElement | null>(null);
  const radiusPolyRef = useRef<SVGPolylineElement | null>(null);
  const dwellPolyRef = useRef<SVGPolylineElement | null>(null);

  // Params captured fresh each render but read from a ref inside the rAF
  // loop, so changing a slider mid-animation doesn't need to restart it.
  const paramsRef = useRef({ dwellMode, strength, view });
  paramsRef.current = { dwellMode, strength, view };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const toClip = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      };
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = toClip(e);
      const hover = hoverRef.current;
      hover.x = x;
      hover.y = y;
      if (!hover.active) hover.newStroke = true;
      hover.active = true;
    };
    const onLeave = () => {
      hoverRef.current.active = false;
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const clockRef = useRef(0);

  useAnimationFrame(active, (dt) => {
    const canvas = canvasRef.current;
    if (!canvas || w === 0 || h === 0) return;
    if (!offscreenRef.current) {
      const oc = document.createElement('canvas');
      oc.width = MASK_W;
      oc.height = MASK_H;
      offscreenRef.current = oc;
      imageDataRef.current = oc.getContext('2d')!.createImageData(MASK_W, MASK_H);
    }

    if (!reducedMotion) clockRef.current += dt;
    const t = clockRef.current;
    const hover = hoverRef.current;
    let auto: { x: number; y: number } | null = null;
    if (!hover.active && !reducedMotion) {
      const phase = t % AUTOPILOT_CYCLE;
      if (phase < AUTOPILOT_MOVE) {
        const theta = (phase / AUTOPILOT_MOVE) * Math.PI * 2;
        auto = { x: 0.8 * Math.sin(theta), y: 0.55 * Math.sin(theta) * Math.cos(theta) };
      } else {
        auto = { x: 0, y: 0 };
      }
    }
    const pointerActive = hover.active || !!auto;
    const newStroke = hover.newStroke || (!!auto && !autopilotWasOnRef.current);
    hover.newStroke = false;
    autopilotWasOnRef.current = !!auto;

    const brush = brushRef.current;
    const painting = stepBrush(brush, {
      pointerX: auto ? auto.x : hover.x,
      pointerY: auto ? auto.y : hover.y,
      pointerActive,
      newStroke,
      dt,
      aspect: MASK_ASPECT,
      baseRadius: BASE_RADIUS,
    });

    const { dwellMode: dm, strength: st, view: vw } = paramsRef.current;
    const mask = maskRef.current!;
    stepCpuMask(mask, brush, painting, {
      dt,
      duration: FADE_DURATION,
      strength: dm === 'on' ? st : 0,
      aspect: MASK_ASPECT,
    });

    ringPush(speedRing.current, brush.speed);
    ringPush(radiusRing.current, brush.radius);
    ringPush(dwellRing.current, 1 - brush.speedT);
    if (speedPolyRef.current) speedPolyRef.current.setAttribute('points', ringPoints(speedRing.current, 200, 44, 0, 8));
    if (radiusPolyRef.current) {
      radiusPolyRef.current.setAttribute(
        'points',
        ringPoints(radiusRing.current, 200, 44, BASE_RADIUS * FAST_RADIUS_SCALE, BASE_RADIUS),
      );
    }
    if (dwellPolyRef.current) dwellPolyRef.current.setAttribute('points', ringPoints(dwellRing.current, 200, 44, 0, 1));

    // Mask → offscreen pixels (opaque blend against paper, same trick as the
    // real shader's debug views: mix(PAPER, ACCENT, mask)).
    const imgData = imageDataRef.current!;
    const px = imgData.data;
    const isField = vw === 'field';
    const threshold = DEFAULT_EDGE.threshold;
    for (let i = 0; i < mask.data.length; i++) {
      const v = mask.data[i];
      let r: number;
      let g: number;
      let b: number;
      if (isField) {
        r = PAPER_RGB[0] + (ACCENT_RGB[0] - PAPER_RGB[0]) * v;
        g = PAPER_RGB[1] + (ACCENT_RGB[1] - PAPER_RGB[1]) * v;
        b = PAPER_RGB[2] + (ACCENT_RGB[2] - PAPER_RGB[2]) * v;
      } else if (v > threshold) {
        [r, g, b] = ACCENT_RGB;
      } else {
        const tint = v * 0.35;
        r = PAPER_RGB[0] + (INK_RGB[0] - PAPER_RGB[0]) * tint;
        g = PAPER_RGB[1] + (INK_RGB[1] - PAPER_RGB[1]) * tint;
        b = PAPER_RGB[2] + (INK_RGB[2] - PAPER_RGB[2]) * tint;
      }
      const o = i * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
    offscreenRef.current.getContext('2d')!.putImageData(imgData, 0, 0);

    const ctx = prepareCanvas2D(canvas, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreenRef.current, 0, 0, MASK_W, MASK_H, 0, 0, w, h);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '1.25rem', alignItems: 'start' }}>
      <div ref={wrapRef} style={{ position: 'relative', aspectRatio: '16 / 9' }}>
        <canvas
          ref={canvasRef}
          aria-label="the mask field: move the pointer, or watch the autopilot alternate fast strokes with resting"
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <Sparkline title="speed" min={0} max={8} minLabel="0" maxLabel="8" refLines={[SLOW_SPEED, FAST_SPEED]} innerRef={speedPolyRef} />
        <Sparkline title="radius" min={BASE_RADIUS * FAST_RADIUS_SCALE} max={BASE_RADIUS} minLabel="0.7r" maxLabel="r" innerRef={radiusPolyRef} />
        <Sparkline title="dwell (1 − speedT)" min={0} max={1} minLabel="0" maxLabel="1" innerRef={dwellPolyRef} />
      </div>
    </div>
  );
}

export default function Ch04Dwell() {
  const [dwellMode, setDwellMode] = useState<DwellMode>('on');
  const [strength, setStrength] = useState(0.12);
  const [view, setView] = useState<ViewMode>('reveal');

  return (
    <Chapter id="ch04" number="04" title="speed and dwell">
      <Prose>
        <P>
          a brush that&apos;s the same size at every speed looks mechanical. this one thins out
          when you move fast — down to 70% of its base radius — and swells back when you slow
          down.
        </P>
        <P>
          when you stop, it keeps adding a little paint each frame. the footprint&apos;s soft rim
          creeps past the edge threshold, so the reveal spreads outward like ink soaking in.
        </P>
        <P>
          both effects hang off one number, <C>speedT</C>: speed smoothstepped between a quarter
          of a screen-height and two and a half screen-heights a second.
        </P>
      </Prose>

      <Figure
        number={5}
        caption="move fast, then stop. with build-up off, a resting brush never spreads."
        controls={
          <>
            <Toggle label="dwell build-up" value={dwellMode} onChange={setDwellMode} options={dwellOptions} />
            <Slider label="strength" value={strength} min={0} max={0.3} step={0.01} format={(v) => v.toFixed(2)} onChange={setStrength} />
            <Toggle label="view" value={view} onChange={setView} options={viewOptions} />
          </>
        }
      >
        <DwellFigure dwellMode={dwellMode} strength={strength} view={view} />
      </Figure>

      <MathToggle>
        <Eq>{'speedT = smoothstep( (s − 0.5) / 4.5 )\nr = r₀ · (1 − 0.3·speedT)\nmask += f · strength · Δt·60 · (1 − speedT)'}</Eq>
        <Code label="blob pass · dwell">{glslExcerpt(BLOB_FS, 'dwell')}</Code>
        <P>
          <C>Δt·60</C> makes &quot;strength&quot; mean &quot;per 60hz frame&quot; on any display.
        </P>
      </MathToggle>
    </Chapter>
  );
}
