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
        slowed down - this swap happens ~once per frame
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
          stored mask
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
    <Chapter id="ch01" number="01" title="giving the shader a memory">
      <Prose>
        <P>
          a fragment shader calculates the color of every pixel, then starts over on the next
          frame. by itself, it has no memory of where your cursor has already been.
        </P>
        <P>
          to preserve that history, the effect stores it in a grayscale image called a{' '}
          <strong>mask</strong>. white pixels are fully revealed, black pixels are hidden, and gray
          pixels sit somewhere in between.
        </P>
        <P>
          each frame has two steps. first, the <strong>mask pass</strong> fades the old mask
          slightly and paints the newest part of the stroke into it. then the{' '}
          <strong>display pass</strong> uses that updated mask to reveal the drawing.
        </P>
        <P>
          there is one complication: the gpu can&apos;t safely read from a texture while writing new
          values into that same texture. instead, the effect keeps two copies. it reads from
          texture a and writes to texture b, then swaps them on the next frame. this back-and-forth
          technique is called <strong>ping-pong rendering</strong>.
        </P>
      </Prose>

      <Figure
        number={2}
        caption="paint in either pane. the left shows the final effect; the right shows the grayscale mask underneath it."
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
          the mask is rendered at half the width and height of the screen. because it contains
          smooth gradients, scaling it back up is difficult to notice, and processing it requires
          only one quarter as many pixels.
        </P>
      </MathToggle>
    </Chapter>
  );
}
