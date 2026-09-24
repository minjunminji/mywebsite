// src/components/explainer/chapters/Ch03Smoothing.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { PATH_SUBDIV, createBrush, followFactor, stepBrush } from '@/components/reveal/brush';
import { Figure, useFigureActive } from '../figure/Figure';
import { Slider, Stat, Toggle } from '../figure/controls';
import { Eq, MathToggle } from '../figure/MathToggle';
import { prepareCanvas2D, useAnimationFrame, useElementSize, useReducedMotion } from '../hooks';
import { C, Chapter, P, Prose } from '../layout';
import { ACCENT, FAINT, INK, PAPER } from '../tokens';

type PathMode = 'straight' | 'hermite';
type TangentMode = 'velocity' | 'stale';
type Timing = 'even' | 'uneven';

type Sample = {
  raw: { x: number; y: number };
  brush: { x: number; y: number };
  path: Float32Array;
};

const RING_SIZE = 45;
const UNEVEN_MULT = [2.2, 0.35, 1, 0.35, 1.8, 0.5];
const BASE_RADIUS = 0.12;
// createBrush's out-of-view sentinel, reused so the pad starts empty.
const IDLE = 10;

const pathOptions: readonly { value: PathMode; label: string }[] = [
  { value: 'straight', label: 'straight' },
  { value: 'hermite', label: 'hermite' },
];
const tangentOptions: readonly { value: TangentMode; label: string }[] = [
  { value: 'velocity', label: 'velocity × Δt' },
  { value: 'stale', label: 'stale (old bug)' },
];
const timingOptions: readonly { value: Timing; label: string }[] = [
  { value: 'even', label: 'even' },
  { value: 'uneven', label: 'uneven' },
];

function SmoothingCanvas({
  pathMode,
  tangentMode,
  timing,
  follow,
  simHz,
}: {
  pathMode: PathMode;
  tangentMode: TangentMode;
  timing: Timing;
  follow: number;
  simHz: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = useElementSize(wrapRef);
  const active = useFigureActive();
  const reducedMotion = useReducedMotion();

  const brushRef = useRef(createBrush(BASE_RADIUS));
  const ringRef = useRef<Sample[]>([]);
  const accumRef = useRef(0);
  const cycleRef = useRef(0);
  const clockRef = useRef(0);
  const hoverRef = useRef({ x: IDLE, y: IDLE, active: false, newStroke: false });
  const autopilotWasOnRef = useRef(false);

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

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas || w === 0 || h === 0) return;
    const ctx = prepareCanvas2D(canvas, w, h);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);

    const toPx = (x: number, y: number) => ({ x: ((x + 1) / 2) * w, y: ((1 - y) / 2) * h });
    const ring = ringRef.current;
    const n = ring.length;
    if (n === 0) return;

    // Raw pointer samples: a faint trail of where the browser reported the
    // pointer each sim step.
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ring.forEach((s, i) => {
      const p = toPx(s.raw.x, s.raw.y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ring.forEach((s) => {
      const p = toPx(s.raw.x, s.raw.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = FAINT;
      ctx.fill();
    });

    // Brush path + position, newest solid, older entries fading.
    ring.forEach((s, i) => {
      const alpha = n > 1 ? 0.25 + 0.75 * (i / (n - 1)) : 1;
      ctx.globalAlpha = alpha;
      if (pathMode === 'hermite') {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k <= PATH_SUBDIV; k++) {
          const p = toPx(s.path[k * 2], s.path[k * 2 + 1]);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      } else if (i > 0) {
        const prev = ring[i - 1];
        const a = toPx(prev.brush.x, prev.brush.y);
        const b = toPx(s.brush.x, s.brush.y);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const bp = toPx(s.brush.x, s.brush.y);
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  useAnimationFrame(active, (dtReal) => {
    const nominal = Math.min(1 / simHz, 0.05);
    accumRef.current += dtReal;
    while (accumRef.current >= nominal) {
      accumRef.current -= nominal;
      const dtSim =
        timing === 'even'
          ? nominal
          : Math.min(UNEVEN_MULT[cycleRef.current % UNEVEN_MULT.length] / simHz, 0.05);
      if (timing === 'uneven') cycleRef.current += 1;

      const t = clockRef.current;
      clockRef.current += dtSim;

      const hover = hoverRef.current;
      const auto =
        !hover.active && !reducedMotion
          ? { x: 0.7 * Math.sin(1.3 * t), y: 0.55 * Math.sin(2.1 * t + 0.6) }
          : null;
      const pointerActive = hover.active || !!auto;
      const newStroke = hover.newStroke || (!!auto && !autopilotWasOnRef.current);
      hover.newStroke = false;
      autopilotWasOnRef.current = !!auto;

      const brush = brushRef.current;
      stepBrush(brush, {
        pointerX: auto ? auto.x : hover.x,
        pointerY: auto ? auto.y : hover.y,
        pointerActive,
        newStroke,
        dt: dtSim,
        aspect: 1,
        baseRadius: BASE_RADIUS,
        follow,
        staleTangents: tangentMode === 'stale',
      });

      const ring = ringRef.current;
      ring.push({
        raw: { x: auto ? auto.x : hover.x, y: auto ? auto.y : hover.y },
        brush: { x: brush.x, y: brush.y },
        path: Float32Array.from(brush.path),
      });
      if (ring.length > RING_SIZE) ring.shift();
    }

    draw();
  });

  // Keep a valid frame painted after layout changes even while the sim is idle.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draw() reads current refs; only w/h/pathMode need to retrigger it here
  }, [w, h, pathMode]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: 380 }}>
      <canvas
        ref={canvasRef}
        aria-label="brush-following demo: move the pointer over the pad, or watch the autopilot when idle"
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
    </div>
  );
}

export default function Ch03Smoothing() {
  const [pathMode, setPathMode] = useState<PathMode>('hermite');
  const [tangentMode, setTangentMode] = useState<TangentMode>('velocity');
  const [timing, setTiming] = useState<Timing>('even');
  const [follow, setFollow] = useState(25);
  const [simHz, setSimHz] = useState(20);

  const k = followFactor(1 / simHz, follow);

  return (
    <Chapter id="ch03" number="03" title="smoothing the cursor">
      <Prose>
        <P>
          the browser only tells you where the pointer is once per frame. connect those samples
          with straight lines and fast strokes turn into polygons.
        </P>
        <P>
          so the brush doesn&apos;t sit on the pointer; it chases it. each frame it covers a
          fraction <C>k = 1 − e^(−λΔt)</C> of the gap. that exponent is what makes it frame-rate
          independent: two half-frames cover exactly as much as one full one.
        </P>
        <P>
          between frames the brush draws a <strong>cubic hermite curve</strong>: a curve defined
          by its two endpoints and the direction it&apos;s heading at each. if every segment
          starts in the direction the last one ended, the joins are invisible.
        </P>
        <P>
          the bug: i used to store last frame&apos;s end direction and reuse it as-is. after a
          long frame followed by a short one, that direction was far too big for the new segment,
          and the curve looped. the fix is to store velocity and scale it by <em>this</em>{' '}
          frame&apos;s Δt.
        </P>
      </Prose>

      <Figure
        number={4}
        caption="move over the pad (or watch the autopilot). switch timing to uneven, then tangents to the old bug."
        controls={
          <>
            <Toggle label="path" value={pathMode} onChange={setPathMode} options={pathOptions} />
            <Toggle
              label="tangents"
              value={tangentMode}
              onChange={setTangentMode}
              options={tangentOptions}
              disabled={pathMode === 'straight'}
            />
            <Toggle label="timing" value={timing} onChange={setTiming} options={timingOptions} />
            <Slider label="follow λ" value={follow} min={5} max={60} step={1} format={(v) => v.toFixed(0)} onChange={setFollow} />
            <Slider label="frame rate" value={simHz} min={10} max={60} step={1} format={(v) => `${v.toFixed(0)}hz`} onChange={setSimHz} />
            <Stat label="k per frame">{k.toFixed(2)}</Stat>
          </>
        }
      >
        <SmoothingCanvas pathMode={pathMode} tangentMode={tangentMode} timing={timing} follow={follow} simHz={simHz} />
      </Figure>

      <MathToggle>
        <Eq>{'k = 1 − e^(−λΔt)\np ← p + (target − p)·k'}</Eq>
        <Eq>{'h(u) = (2u³−3u²+1)p₀ + (u³−2u²+u)m₀ + (−2u³+3u²)p₁ + (u³−u²)m₁\nm = v·Δt'}</Eq>
        <P>this part runs on the cpu in typescript; the 13 samples are uploaded as a uniform array.</P>
      </MathToggle>
    </Chapter>
  );
}
