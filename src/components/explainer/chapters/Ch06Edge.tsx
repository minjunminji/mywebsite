// src/components/explainer/chapters/Ch06Edge.tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DISPLAY_FS, glslExcerpt, type EdgeParams, type RevealView } from '@/components/reveal/shaders';
import { type Brush } from '@/components/reveal/brush';
import { aboutFrames } from '@/components/story/storyData';
import { Figure, useFigureActive } from '../figure/Figure';
import { Slider, Toggle } from '../figure/controls';
import { Code, Eq, MathToggle } from '../figure/MathToggle';
import { useReducedMotion } from '../hooks';
import { C, Chapter, P, Prose } from '../layout';
import { MUTED, PAPER, RULE, SANS, SERIF } from '../tokens';
import { useRevealCanvas } from '../useRevealCanvas';

type Octaves = 0 | 1 | 2 | 3 | 4;
type ViewMode = 'composite' | 'field';
type Aa = 'on' | 'off';

const octaveOptions: readonly { value: Octaves; label: string }[] = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];
const viewOptions: readonly { value: ViewMode; label: string }[] = [
  { value: 'composite', label: 'composite' },
  { value: 'field', label: 'field' },
];
const aaOptions: readonly { value: Aa; label: string }[] = [
  { value: 'on', label: 'on' },
  { value: 'off', label: 'off' },
];

const VIEW_OF: Record<ViewMode, RevealView> = { composite: 0, field: 2 };
// Device pixels of the WebGL canvas captured into the loupe each frame:
// wide enough to show the edge in context, small enough that each pixel is
// still a visible square (~4x at 2x DPR).
const REGION = 48;
const LOUPE_CSS = 200;
// The reveal edge sits where the mask crosses the 0.15 threshold, about 0.8
// brush radii out from the center (1 - smoothstep(0.1r, r, d) = 0.15).
const EDGE_OFFSET = 0.8;
// How quickly the loupe's aim swings to a new side of the stroke (1/s).
const AIM_FOLLOW = 6;

function autopilot(t: number) {
  return { x: 0.45 * Math.cos(0.6 * t), y: 0.4 * Math.sin(0.6 * t) };
}

function EdgeFigure({ edge, view }: { edge: EdgeParams; view: ViewMode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const active = useFigureActive();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const loupe = loupeRef.current;
    if (!loupe) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    loupe.width = Math.round(LOUPE_CSS * dpr);
    loupe.height = Math.round(LOUPE_CSS * dpr);
  }, []);

  // Copies a small window of the WebGL canvas around the brush, in the same
  // frame it was drawn — the context has no preserveDrawingBuffer, so this
  // has to happen synchronously right after draw(), not on a later tick.
  // Unit direction (device px, y down) from the brush center to the edge the
  // loupe looks at: perpendicular to the brush's motion, eased so it doesn't
  // flip every frame, and held while the brush rests.
  const aimRef = useRef({ x: 1, y: 0, last: 0 });

  const afterDraw = useCallback((canvas: HTMLCanvasElement, brush: Brush) => {
    const loupe = loupeRef.current;
    const lctx = loupe?.getContext('2d');
    if (!loupe || !lctx) return;

    const aim = aimRef.current;
    const now = performance.now();
    const dt = aim.last ? Math.min((now - aim.last) / 1000, 0.05) : 0;
    aim.last = now;
    // Brush velocity in device px (clip x spans the width, y the height, y up).
    const vx = brush.velX * (canvas.width / 2);
    const vy = -brush.velY * (canvas.height / 2);
    const speed = Math.hypot(vx, vy);
    if (speed > 1) {
      // Left-hand normal of the motion; pick the side closer to the current
      // aim so a reversing brush doesn't swing the loupe across the stroke.
      let nx = -vy / speed;
      let ny = vx / speed;
      if (nx * aim.x + ny * aim.y < 0) {
        nx = -nx;
        ny = -ny;
      }
      const k = 1 - Math.exp(-dt * AIM_FOLLOW);
      aim.x += (nx - aim.x) * k;
      aim.y += (ny - aim.y) * k;
      const len = Math.hypot(aim.x, aim.y) || 1;
      aim.x /= len;
      aim.y /= len;
    }

    const radiusPx = brush.radius * (canvas.height / 2) * EDGE_OFFSET;
    const px = ((brush.x + 1) / 2) * canvas.width + aim.x * radiusPx;
    const py = ((1 - brush.y) / 2) * canvas.height + aim.y * radiusPx;
    const sx = px - REGION / 2;
    const sy = py - REGION / 2;

    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = PAPER;
    lctx.fillRect(0, 0, loupe.width, loupe.height);

    // The underlay <img> beneath the WebGL canvas, cropped to the same
    // window (it's the same 16:9 frame as the canvas, so the mapping is
    // proportional — no letterboxing math needed).
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      const ix = (sx / canvas.width) * img.naturalWidth;
      const iy = (sy / canvas.height) * img.naturalHeight;
      const iw = (REGION / canvas.width) * img.naturalWidth;
      const ih = (REGION / canvas.height) * img.naturalHeight;
      lctx.drawImage(img, ix, iy, iw, ih, 0, 0, loupe.width, loupe.height);
    }
    lctx.drawImage(canvas, sx, sy, REGION, REGION, 0, 0, loupe.width, loupe.height);
  }, []);

  useRevealCanvas(canvasRef, {
    active,
    reducedMotion,
    panes: [{ view: VIEW_OF[view] }],
    edge,
    autopilot,
    afterDraw,
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '1.25rem', alignItems: 'start' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9' }}>
        <img
          ref={imgRef}
          src={aboutFrames[0]}
          alt=""
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none' }}
        />
        <canvas
          ref={canvasRef}
          aria-label="live reveal with adjustable edge noise: move the pointer over the drawing, or watch the autopilot"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />
      </div>
      <div>
        <div style={{ fontFamily: SANS, fontSize: '0.72rem', letterSpacing: '0.08em', color: MUTED, marginBottom: '0.4rem' }}>
          loupe · on the edge, no smoothing
        </div>
        <canvas
          ref={loupeRef}
          aria-label="zoomed, unsmoothed view of the edge around the brush"
          style={{ width: LOUPE_CSS, height: LOUPE_CSS, display: 'block', border: `1px solid ${RULE}` }}
        />
      </div>
    </div>
  );
}

export default function Ch06Edge() {
  const [octaves, setOctaves] = useState<Octaves>(4);
  const [threshold, setThreshold] = useState(0.15);
  const [noise, setNoise] = useState(0.14);
  const [view, setView] = useState<ViewMode>('composite');
  const [aa, setAa] = useState<Aa>('on');

  const edge: EdgeParams = { threshold, noiseAmp: noise, octaves, softness: aa === 'on' ? 1.5 : 0 };
  const warn = threshold - noise / 2 <= 0;

  return (
    <Chapter id="ch06" number="06" title="the ink edge">
      <Prose>
        <P>
          a hard threshold on the mask gives you clean circles. real ink bleeds unevenly into
          paper, so the edge gets noise.
        </P>
        <P>
          <strong>value noise</strong> is random numbers on a grid, smoothly blended between. one
          layer looks like blobs. <strong>fbm</strong> stacks layers, each twice as fine and half
          as strong, until it looks organic.
        </P>
        <P>
          the noise nudges the mask up or down before the threshold:{' '}
          <C>field = mask + (n − 0.5)·amp</C>. the edge is wherever <C>field</C> crosses 0.15.
          keep <C>0.15 − amp/2 &gt; 0</C> or empty paper starts showing through.
        </P>
        <P>
          last, antialiasing: <C>fwidth</C> tells the shader how much <C>field</C> changes across
          one screen pixel, so the edge is always about 1.5px soft — whether the blob is fresh and
          steep or fading and shallow.
        </P>
      </Prose>

      <Figure
        number={7}
        caption="add octaves one at a time. turn antialiasing off and look in the loupe."
        controls={
          <>
            <Toggle label="octaves" value={octaves} onChange={setOctaves} options={octaveOptions} />
            <Slider label="threshold" value={threshold} min={0.02} max={0.5} step={0.01} format={(v) => v.toFixed(2)} onChange={setThreshold} />
            <Slider label="noise" value={noise} min={0} max={0.3} step={0.01} format={(v) => v.toFixed(2)} onChange={setNoise} />
            <Toggle label="view" value={view} onChange={setView} options={viewOptions} />
            <Toggle label="antialiasing" value={aa} onChange={setAa} options={aaOptions} />
          </>
        }
      >
        <EdgeFigure edge={edge} view={view} />
        {warn ? (
          <p style={{ margin: '1rem 0 0', fontFamily: SERIF, fontStyle: 'italic', fontSize: '0.95rem', color: MUTED }}>
            the noise can now push empty paper past the threshold — see the speckles?
          </p>
        ) : null}
      </Figure>

      <MathToggle>
        <Eq>{'fbm(p) = Σᵢ 0.5ⁱ·noise(2.03ⁱ p) / Σᵢ 0.5ⁱ\nfield = mask + (fbm − 0.5)·amp\nw = 1.5·fwidth(field)\nreveal = smoothstep(0.15 − w, 0.15 + w, field)'}</Eq>
        <Code label="display pass · fbm">{glslExcerpt(DISPLAY_FS, 'fbm')}</Code>
        <Code label="display pass · edge">{glslExcerpt(DISPLAY_FS, 'edge')}</Code>
      </MathToggle>
    </Chapter>
  );
}
