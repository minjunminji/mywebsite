// src/components/explainer/chapters/Ch01Passes.tsx
'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { BLOB_FS, glslExcerpt } from '@/components/reveal/shaders';
import { AboutUnderlay, ABOUT_CROP_ASPECT } from '../figure/AboutUnderlay';
import { Figure, useFigureActive } from '../figure/Figure';
import { Code, Eq, MathToggle } from '../figure/MathToggle';
import { useReducedMotion } from '../hooks';
import { C, Chapter, P, Prose } from '../layout';
import { ACCENT, INK, MUTED, SANS } from '../tokens';
import { useRevealCanvas } from '../useRevealCanvas';

/** Two boxes and an arrow that flips direction every 700ms — a slowed-down
 * cartoon of the mask pass's ping-pong: read from one texture, write the
 * other, then swap. */
function PingPongDiagram({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const [phase, setPhase] = useState<0 | 1>(0);
  const arrowId = useId();

  useEffect(() => {
    if (!active || reducedMotion) return undefined;
    const id = window.setInterval(() => setPhase((p) => (p === 0 ? 1 : 0)), 700);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  // phase 0: read a, write b. phase 1: read b, write a.
  const x1 = phase === 0 ? 134 : 266;
  const x2 = phase === 0 ? 266 : 134;
  const label = phase === 0 ? 'read a → write b' : 'read b → write a';

  return (
    <div style={{ marginTop: '1.1rem' }}>
      <svg
        viewBox="0 0 400 64"
        width="100%"
        height="64"
        role="img"
        aria-label={
          phase === 0
            ? 'diagram: reading texture a, writing texture b'
            : 'diagram: reading texture b, writing texture a'
        }
      >
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={ACCENT} />
          </marker>
        </defs>
        <rect x="20" y="10" width="114" height="36" rx="4" fill="none" stroke={INK} strokeWidth="1.5" />
        <text x="77" y="32" textAnchor="middle" fontFamily={SANS} fontSize="12" fill={INK}>
          texture a
        </text>
        <rect x="266" y="10" width="114" height="36" rx="4" fill="none" stroke={INK} strokeWidth="1.5" />
        <text x="323" y="32" textAnchor="middle" fontFamily={SANS} fontSize="12" fill={INK}>
          texture b
        </text>
        <line x1={x1} y1="28" x2={x2} y2="28" stroke={ACCENT} strokeWidth="1.5" markerEnd={`url(#${arrowId})`} />
        <text x="200" y="58" textAnchor="middle" fontFamily={SANS} fontSize="11" fill={ACCENT}>
          {label}
        </text>
      </svg>
      <p style={{ margin: '0.5rem 0 0', fontFamily: SANS, fontSize: '0.72rem', color: MUTED }}>
        slowed down — really 60–240× a second
      </p>
    </div>
  );
}

function TwoPassCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const active = useFigureActive();
  const reducedMotion = useReducedMotion();
  useRevealCanvas(canvasRef, { active, reducedMotion, panes: [{ view: 0 }, { view: 1 }], gap: 16 });

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
        <span style={{ fontFamily: SANS, fontSize: '0.72rem', letterSpacing: '0.08em', color: MUTED }}>
          what you see
        </span>
        <span style={{ fontFamily: SANS, fontSize: '0.72rem', letterSpacing: '0.08em', color: MUTED }}>
          the mask (red channel)
        </span>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ position: 'relative', aspectRatio: ABOUT_CROP_ASPECT, overflow: 'hidden' }}>
          <AboutUnderlay />
        </div>
        <div />
        <canvas
          ref={canvasRef}
          aria-label="live reveal, two panes: the composite on the left, its mask texture on the right. paint on either side."
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />
      </div>
      <PingPongDiagram active={active} reducedMotion={reducedMotion} />
    </div>
  );
}

export default function Ch01Passes() {
  return (
    <Chapter id="ch01" number="01" title="two passes and a feedback loop">
      <Prose>
        <P>
          a fragment shader can&apos;t remember anything between frames — every pixel is computed
          fresh. so the reveal keeps its memory in a texture: a grayscale <strong>mask</strong>{' '}
          where 1 means &quot;revealed&quot; and 0 means &quot;hidden&quot;.
        </P>
        <P>
          each frame runs two passes. the <strong>mask pass</strong> reads last frame&apos;s mask,
          fades it a little, and paints the brush on top. the <strong>display pass</strong> uses
          the mask to decide where to show the colored drawing.
        </P>
        <P>
          a shader can&apos;t read and write the same texture at once, so there are two: read from
          a, write to b, then swap. that&apos;s called <strong>ping-pong</strong>.
        </P>
      </Prose>

      <Figure
        number={2}
        caption="paint on either side. both panes read the same mask; the right one just draws it raw."
      >
        <TwoPassCanvas />
      </Figure>

      <MathToggle>
        <Eq>{'maskₙ = max(maskₙ₋₁ − Δt/T, stroke)'}</Eq>
        <P>
          <C>Δt</C> is the time since the last frame; <C>T = 2.5s</C> is how long a fully revealed
          pixel takes to fade.
        </P>
        <Code label="blob pass · decay">{glslExcerpt(BLOB_FS, 'decay')}</Code>
        <P>
          the mask is stored at half resolution — it&apos;s a smooth field, so bilinear upsampling
          hides it, and it costs a quarter of the fill rate.
        </P>
      </MathToggle>
    </Chapter>
  );
}
