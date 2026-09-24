// src/components/explainer/chapters/Ch02Stroke.tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BLOB_FS, glslExcerpt } from '@/components/reveal/shaders';
import { distToSegmentInto, strokeFalloff } from '../explainerMath';
import { Figure } from '../figure/Figure';
import { Slider, Stat, Toggle } from '../figure/controls';
import { Code, Eq, MathToggle } from '../figure/MathToggle';
import { prepareCanvas2D, useElementSize } from '../hooks';
import { C, Chapter, P, Prose } from '../layout';
import { ACCENT, ACCENT_RGB, INK, INK_RGB, MUTED, PAPER, RULE, SANS } from '../tokens';

type Pt = { fx: number; fy: number };
type Combine = 'max' | 'add';
type Probe = { x: number; y: number; d: number; t: number; f: number } | null;

const INIT_POINTS: readonly Pt[] = [
  { fx: 0.2, fy: 0.6 },
  { fx: 0.5, fy: 0.35 },
  { fx: 0.8, fy: 0.6 },
];

const HANDLE_HIT = 14;
const HANDLE_R = 6;
const CELL = 5;

const combineOptions: readonly { value: Combine; label: string }[] = [
  { value: 'max', label: 'max' },
  { value: 'add', label: 'add' },
];

function toAbs(p: Pt, w: number, h: number) {
  return { x: p.fx * w, y: p.fy * h };
}

// Scratch objects reused across sampleAt's per-cell heatmap calls (w/CELL ×
// h/CELL times per draw) so distToSegmentInto never allocates in that loop.
const scratchSeg1 = { d: 0, t: 0 };
const scratchSeg2 = { d: 0, t: 0 };

/** f at (px, py), plus the distance/t of the nearer of the two segments. */
function sampleAt(
  px: number, py: number, pts: readonly Pt[], w: number, h: number, r: number, mode: Combine,
) {
  const A = toAbs(pts[0], w, h);
  const B = toAbs(pts[1], w, h);
  const C1 = toAbs(pts[2], w, h);
  distToSegmentInto(scratchSeg1, px, py, A.x, A.y, B.x, B.y);
  distToSegmentInto(scratchSeg2, px, py, B.x, B.y, C1.x, C1.y);
  const f1 = strokeFalloff(scratchSeg1.d, r);
  const f2 = strokeFalloff(scratchSeg2.d, r);
  const f = mode === 'max' ? Math.max(f1, f2) : f1 + f2;
  const useSeg1 = scratchSeg1.d <= scratchSeg2.d;
  const nearer = useSeg1 ? scratchSeg1 : scratchSeg2;
  return { f, d: nearer.d, t: nearer.t, useSeg1, A, B, C: C1 };
}

/** The falloff curve f(d), with markers at 0.1r and r, and the probe's (d, f). */
function FalloffPlot({ radius, probe }: { radius: number; probe: Probe }) {
  const dMax = radius * 1.3;
  const padLeft = 30;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 20;
  const plotW = 240 - padLeft - padRight;
  const plotH = 140 - padTop - padBottom;
  const xOf = useCallback((d: number) => padLeft + (d / dMax) * plotW, [dMax, plotW]);
  const yOf = useCallback(
    (f: number) => padTop + (1 - Math.min(Math.max(f, 0), 1)) * plotH,
    [plotH],
  );

  const points = useMemo(() => {
    const n = 60;
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
      const d = (i / n) * dMax;
      const f = strokeFalloff(d, radius);
      pts.push(`${xOf(d).toFixed(1)},${yOf(f).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [radius, dMax, xOf, yOf]);

  const markX1 = xOf(radius * 0.1);
  const markX2 = xOf(radius);

  return (
    <svg viewBox="0 0 240 140" width="240" height="140" role="img" aria-label="falloff curve: paint versus distance from the segment">
      <line x1={padLeft} y1={padTop} x2={padLeft} y2={140 - padBottom} stroke={RULE} strokeWidth={1} />
      <line x1={padLeft} y1={140 - padBottom} x2={240 - padRight} y2={140 - padBottom} stroke={RULE} strokeWidth={1} />
      <line x1={markX1} y1={padTop} x2={markX1} y2={140 - padBottom} stroke={RULE} strokeWidth={1} strokeDasharray="2,2" />
      <line x1={markX2} y1={padTop} x2={markX2} y2={140 - padBottom} stroke={RULE} strokeWidth={1} strokeDasharray="2,2" />
      <text x={markX1} y={140 - 6} textAnchor="middle" fontFamily={SANS} fontSize="8" fill={MUTED}>0.1r</text>
      <text x={markX2} y={140 - 6} textAnchor="middle" fontFamily={SANS} fontSize="8" fill={MUTED}>r</text>
      <text x={padLeft - 6} y={padTop + 4} textAnchor="end" fontFamily={SANS} fontSize="8" fill={MUTED}>1</text>
      <text x={padLeft - 6} y={140 - padBottom} textAnchor="end" fontFamily={SANS} fontSize="8" fill={MUTED}>0</text>
      <polyline points={points} fill="none" stroke={INK} strokeWidth={1.5} />
      {probe ? <circle cx={xOf(Math.min(probe.d, dMax))} cy={yOf(probe.f)} r={3} fill={ACCENT} /> : null}
    </svg>
  );
}

function StrokeFigure() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = useElementSize(wrapRef);

  const [radius, setRadius] = useState(64);
  const [combine, setCombine] = useState<Combine>('max');
  const [probe, setProbe] = useState<Probe>(null);
  const [peak, setPeak] = useState(1);

  const pointsRef = useRef<Pt[]>(INIT_POINTS.map((p) => ({ ...p })));
  const dragRef = useRef<number | null>(null);
  const probePxRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || w === 0 || h === 0) return;
    const ctx = prepareCanvas2D(canvas, w, h);
    const pts = pointsRef.current;
    const A = toAbs(pts[0], w, h);
    const B = toAbs(pts[1], w, h);
    const Cpt = toAbs(pts[2], w, h);

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);

    // Heatmap: 5px cells, accent for paint, ink for double-painted overlap.
    let maxF = 0;
    for (let cy = 0; cy < h; cy += CELL) {
      for (let cx = 0; cx < w; cx += CELL) {
        const { f } = sampleAt(cx + CELL / 2, cy + CELL / 2, pts, w, h, radius, combine);
        if (f > maxF) maxF = f;
        if (f > 0.002) {
          const a = Math.min(f, 1) * 0.85;
          ctx.fillStyle = `rgba(${ACCENT_RGB[0]}, ${ACCENT_RGB[1]}, ${ACCENT_RGB[2]}, ${a})`;
          ctx.fillRect(cx, cy, CELL, CELL);
        }
        if (f > 1.001) {
          const a2 = (f - 1) * 0.9;
          ctx.fillStyle = `rgba(${INK_RGB[0]}, ${INK_RGB[1]}, ${INK_RGB[2]}, ${a2})`;
          ctx.fillRect(cx, cy, CELL, CELL);
        }
      }
    }
    setPeak(maxF);

    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(Cpt.x, Cpt.y);
    ctx.stroke();

    [A, B, Cpt].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    });

    const probePx = probePxRef.current;
    if (probePx) {
      const sample = sampleAt(probePx.x, probePx.y, pts, w, h, radius, combine);
      const from = sample.useSeg1 ? sample.A : sample.B;
      const to = sample.useSeg1 ? sample.B : sample.C;
      const closest = { x: from.x + (to.x - from.x) * sample.t, y: from.y + (to.y - from.y) * sample.t };

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(probePx.x, probePx.y);
      ctx.lineTo(closest.x, closest.y);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(closest.x, closest.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();

      setProbe({ x: probePx.x, y: probePx.y, d: sample.d, t: sample.t, f: sample.f });
    } else {
      setProbe(null);
    }
  }, [w, h, radius, combine]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    scheduleDraw();
  }, [scheduleDraw]);

  // Clear the ref too: Strict Mode unmounts and remounts in dev, and a stale
  // id would make scheduleDraw think a frame is still queued, so it never
  // draws again.
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  const handleAt = (px: number, py: number) => {
    const pts = pointsRef.current;
    for (let i = 0; i < pts.length; i++) {
      const p = toAbs(pts[i], w, h);
      if (Math.hypot(px - p.x, py - p.y) <= HANDLE_HIT) return i;
    }
    return null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const idx = handleAt(px, py);
    if (idx != null) {
      dragRef.current = idx;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (dragRef.current != null && w > 0 && h > 0) {
      const idx = dragRef.current;
      pointsRef.current[idx] = {
        fx: Math.min(1, Math.max(0, px / w)),
        fy: Math.min(1, Math.max(0, py / h)),
      };
    } else {
      probePxRef.current = { x: px, y: py };
    }
    scheduleDraw();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current != null) {
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onPointerLeave = () => {
    if (dragRef.current == null) {
      probePxRef.current = null;
      scheduleDraw();
    }
  };

  return (
    <Figure
      number={3}
      caption="drag the points. hover to probe a pixel. switch to add and watch the joint double up."
      controls={
        <>
          <Slider label="radius" value={radius} min={20} max={120} step={1} format={(v) => `${Math.round(v)}px`} onChange={setRadius} />
          <Toggle label="combine" value={combine} onChange={setCombine} options={combineOptions} />
          <Stat label="d">{probe ? `${probe.d.toFixed(1)}px` : '—'}</Stat>
          <Stat label="t">{probe ? probe.t.toFixed(2) : '—'}</Stat>
          <Stat label="f">{probe ? probe.f.toFixed(2) : '—'}</Stat>
          <Stat label="peak">{peak.toFixed(2)}</Stat>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '1.25rem', alignItems: 'start' }}>
        <div ref={wrapRef} style={{ position: 'relative', height: 360 }}>
          <canvas
            ref={canvasRef}
            aria-label="drag the three points to reshape the brush's path; hover to probe the paint falloff at a pixel"
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
        </div>
        <div>
          <div style={{ fontFamily: SANS, fontSize: '0.72rem', letterSpacing: '0.08em', color: MUTED, marginBottom: '0.4rem' }}>
            f(d)
          </div>
          <FalloffPlot radius={radius} probe={probe} />
        </div>
      </div>
    </Figure>
  );
}

export default function Ch02Stroke() {
  return (
    <Chapter id="ch02" number="02" title="painting a stroke">
      <Prose>
        <P>
          for every pixel, the mask pass asks one question: how far am i from the brush&apos;s
          path this frame? the path is a short polyline, so that&apos;s the distance to the
          nearest line segment.
        </P>
        <P>
          project the pixel onto the segment&apos;s line, clamp to the ends, measure — that&apos;s{' '}
          <C>t</C>, how far along the segment the closest point sits.
        </P>
        <P>
          turn distance into paint with <C>smoothstep</C>: solid near the middle, feathered at the
          rim. where segments overlap, take the <strong>max</strong> rather than adding — adding
          double-paints every joint, and those joints outlive the rest of the stroke as it fades,
          leaving a row of dots.
        </P>
      </Prose>

      <StrokeFigure />

      <MathToggle>
        <Eq>{'t = clamp( (p − a)·(b − a) / |b − a|² , 0, 1 )\nd = | p − (a + t(b − a)) |\nf = 1 − smoothstep(0.1r, r, d)'}</Eq>
        <P>
          the shader multiplies x by the aspect ratio first, so distances are round, not stretched
          ovals.
        </P>
        <Code label="blob pass · stroke">{glslExcerpt(BLOB_FS, 'stroke')}</Code>
      </MathToggle>
    </Chapter>
  );
}
