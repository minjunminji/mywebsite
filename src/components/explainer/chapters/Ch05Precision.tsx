// src/components/explainer/chapters/Ch05Precision.tsx
'use client';
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BLOB_FS, glslExcerpt } from '@/components/reveal/shaders';
import { fadeTime, simulateDecay } from '../explainerMath';
import { Figure, useFigureActive } from '../figure/Figure';
import { ControlGroup, Stat, Toggle } from '../figure/controls';
import { Code, Eq, MathToggle } from '../figure/MathToggle';
import { useAnimationFrame, useReducedMotion } from '../hooks';
import { C, Chapter, P, Prose } from '../layout';
import { ACCENT, ACCENT_RGB, FAINT, INK, MUTED, RULE, SANS } from '../tokens';

const T = 2.5; // fade duration, seconds — same as DEFAULT_EDGE/useRevealCanvas.
const WINDOW = 4; // seconds of history the chart covers

type Hz = 30 | 60 | 120 | 144 | 240;
type Zoom = 'full' | 'top5';

const hzOptions: readonly { value: Hz; label: string }[] = [
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 120, label: '120' },
  { value: 144, label: '144' },
  { value: 240, label: '240' },
];
const zoomOptions: readonly { value: Zoom; label: string }[] = [
  { value: 'full', label: 'full' },
  { value: 'top5', label: 'top 5%' },
];

const VB_W = 640;
const VB_H = 300;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 28;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

function domain(zoom: Zoom) {
  return zoom === 'top5' ? { xMax: 0.3, yMin: 0.95, yMax: 1 } : { xMax: WINDOW, yMin: 0, yMax: 1 };
}

function buildLine(values: number[], hz: number, xOf: (t: number) => number, yOf: (v: number) => number, xMax: number) {
  const pts: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const t = i / hz;
    if (t > xMax) break;
    pts.push(`${xOf(t).toFixed(1)},${yOf(values[i]).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** A staircase: the value holds until the next frame, then jumps — how a
 * quantized store actually looks over time, unlike a smooth interpolation. */
function buildStep(values: number[], hz: number, xOf: (t: number) => number, yOf: (v: number) => number, xMax: number) {
  let d = '';
  let prevY = yOf(values[0]);
  for (let i = 0; i < values.length; i++) {
    const t = i / hz;
    if (t > xMax) break;
    const x = xOf(t);
    const y = yOf(values[i]);
    d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    prevY = y;
  }
  return d;
}

function Swatch({ label, innerRef }: { label: string; innerRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
      <div
        ref={innerRef}
        style={{ width: 44, height: 44, flexShrink: 0, border: `1px solid ${RULE}`, background: 'transparent' }}
      />
      <span style={{ fontFamily: SANS, fontSize: '0.72rem', letterSpacing: '0.04em', color: MUTED }}>{label}</span>
    </div>
  );
}

function PrecisionChart({ hz, zoom }: { hz: Hz; zoom: Zoom }) {
  const active = useFigureActive();
  const reducedMotion = useReducedMotion();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const playheadRef = useRef<SVGLineElement | null>(null);
  const swatchRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const clockRef = useRef(1.5);
  const draggingRef = useRef(false);

  const series = useMemo(
    () => ({
      ideal: simulateDecay(hz, T, 'ideal', WINDOW),
      r16f: simulateDecay(hz, T, 'r16f', WINDOW),
      rgba8: simulateDecay(hz, T, 'rgba8', WINDOW),
    }),
    [hz],
  );

  const { xMax, yMin, yMax } = domain(zoom);
  const xOf = useCallback((t: number) => PAD_L + (t / xMax) * PLOT_W, [xMax]);
  const yOf = useCallback(
    (v: number) => PAD_T + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * PLOT_H,
    [yMin, yMax],
  );

  const idealPts = useMemo(() => buildLine(series.ideal, hz, xOf, yOf, xMax), [series.ideal, hz, xOf, yOf, xMax]);
  const r16fPts = useMemo(() => buildLine(series.r16f, hz, xOf, yOf, xMax), [series.r16f, hz, xOf, yOf, xMax]);
  const rgba8Path = useMemo(() => buildStep(series.rgba8, hz, xOf, yOf, xMax), [series.rgba8, hz, xOf, yOf, xMax]);

  const scrub = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / VB_W;
    const vbX = (clientX - rect.left) / scale;
    const frac = Math.min(1, Math.max(0, (vbX - PAD_L) / PLOT_W));
    clockRef.current = frac * xMax;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!reducedMotion) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (draggingRef.current) scrub(e.clientX);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  useAnimationFrame(active, (dt) => {
    if (!reducedMotion && !draggingRef.current) {
      clockRef.current = (clockRef.current + dt) % WINDOW;
    }
    const t = clockRef.current;
    const idx = Math.min(series.ideal.length - 1, Math.round(t * hz));

    if (playheadRef.current) {
      const x = t <= xMax ? xOf(t) : xOf(xMax);
      playheadRef.current.setAttribute('x1', x.toFixed(1));
      playheadRef.current.setAttribute('x2', x.toFixed(1));
      playheadRef.current.style.opacity = t <= xMax ? '1' : '0';
    }
    const values = [series.ideal[idx], series.r16f[idx], series.rgba8[idx]];
    values.forEach((v, i) => {
      const el = swatchRefs.current[i];
      if (el) el.style.background = `rgba(${ACCENT_RGB[0]}, ${ACCENT_RGB[1]}, ${ACCENT_RGB[2]}, ${v})`;
    });
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '1.5rem', alignItems: 'start' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height={VB_H}
        role="img"
        aria-label="mask value over time at three storage precisions: ideal, half-float, and 8-bit"
        style={{ touchAction: 'none', cursor: reducedMotion ? 'ew-resize' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={VB_H - PAD_B} stroke={RULE} strokeWidth={1} />
        <line x1={PAD_L} y1={VB_H - PAD_B} x2={VB_W - PAD_R} y2={VB_H - PAD_B} stroke={RULE} strokeWidth={1} />
        <text x={PAD_L - 8} y={PAD_T + 4} textAnchor="end" fontFamily={SANS} fontSize="10" fill={MUTED}>{yMax}</text>
        <text x={PAD_L - 8} y={VB_H - PAD_B} textAnchor="end" fontFamily={SANS} fontSize="10" fill={MUTED}>{yMin}</text>
        <text x={PAD_L} y={VB_H - 8} textAnchor="middle" fontFamily={SANS} fontSize="10" fill={MUTED}>0s</text>
        <text x={VB_W - PAD_R} y={VB_H - 8} textAnchor="middle" fontFamily={SANS} fontSize="10" fill={MUTED}>{xMax}s</text>

        <polyline points={idealPts} fill="none" stroke={FAINT} strokeWidth={1} strokeDasharray="4,3" />
        <polyline points={r16fPts} fill="none" stroke={INK} strokeWidth={1.5} />
        <path d={rgba8Path} fill="none" stroke={ACCENT} strokeWidth={2} />

        <line ref={playheadRef} x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={VB_H - PAD_B} stroke={INK} strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <Swatch label="ideal" innerRef={(el) => { swatchRefs.current[0] = el; }} />
        <Swatch label="half-float" innerRef={(el) => { swatchRefs.current[1] = el; }} />
        <Swatch label="8-bit" innerRef={(el) => { swatchRefs.current[2] = el; }} />
      </div>
    </div>
  );
}

export default function Ch05Precision() {
  const [hz, setHz] = useState<Hz>(60);
  const [zoom, setZoom] = useState<Zoom>('full');

  const perFrame = (1 / hz / T).toFixed(4);
  const rgba8Fade = fadeTime(hz, T, 'rgba8');
  const r16fFade = fadeTime(hz, T, 'r16f');

  return (
    <Chapter id="ch05" number="05" title="the 240hz bug">
      <Prose>
        <P>
          the mask should fade at the same speed on every display. each frame subtracts{' '}
          <C>Δt / 2.5s</C> from its stored value: about 0.0067 at 60hz, but only 0.0017 at 240hz.
        </P>
        <P>
          the first version stored the mask in an 8-bit texture. that format has only 256 possible
          values, separated by steps of roughly 0.0039.
        </P>
        <P>
          at 240hz, the requested fade of 0.0017 is smaller than half of one available step. the
          value rounds back to where it started, so a fully revealed pixel remains fully revealed
          forever. even at 60hz, rounding makes the fade roughly 15% faster than intended.
        </P>
        <P>
          the solution was to store the mask as a 16-bit floating-point texture, or <C>R16F</C>.
          its values are spaced much more closely, so each small fade survives when the result is
          written back.
        </P>
      </Prose>

      <Figure
        number={6}
        caption="select 240hz and zoom into the top 5%. the 8-bit value rounds back to 1 on every frame, while the half-float value continues to fall."
        controls={
          <>
            <ControlGroup label="try">
              <Toggle label="refresh rate" value={hz} onChange={setHz} options={hzOptions} />
              <Toggle label="zoom" value={zoom} onChange={setZoom} options={zoomOptions} />
            </ControlGroup>
            <ControlGroup label="observe">
              <Stat label="fade requested per frame">{perFrame}</Stat>
              <Stat label="8-bit fade time">{rgba8Fade === null ? 'never' : `${rgba8Fade.toFixed(2)}s`}</Stat>
              <Stat label="half-float fade time">{r16fFade === null ? 'never' : `${r16fFade.toFixed(2)}s`}</Stat>
            </ControlGroup>
          </>
        }
      >
        <PrecisionChart hz={hz} zoom={zoom} />
      </Figure>

      <MathToggle>
        <Eq>{'8-bit step = 1/255 ≈ 0.0039\nrounds away when Δt/T < 1/510  →  refresh > 510/T ≈ 204hz'}</Eq>
        <Code label="blob pass · decay">{glslExcerpt(BLOB_FS, 'decay')}</Code>
        <P>
          webgl2 can render to <C>R16F</C> when <C>EXT_color_buffer_float</C> is available; the
          site falls back to <C>RGBA8</C> otherwise.
        </P>
      </MathToggle>
    </Chapter>
  );
}
