// src/components/explainer/chapters/Ch06Edge.tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DISPLAY_FS, glslExcerpt, type EdgeParams, type RevealView } from '@/components/reveal/shaders';
import { type Brush } from '@/components/reveal/brush';
import { AboutUnderlay, ABOUT_CROP, ABOUT_CROP_ASPECT } from '../figure/AboutUnderlay';
import { Figure, useFigureActive } from '../figure/Figure';
import { ControlDisclosure, ControlGroup, Slider, Toggle } from '../figure/controls';
import { Code, Eq, MathToggle } from '../figure/MathToggle';
import { useReducedMotion } from '../hooks';
import { C, Chapter, P, Prose } from '../layout';
import { MUTED, PAPER, RULE, SANS } from '../tokens';
import { useRevealCanvas } from '../useRevealCanvas';

type Octaves = 0 | 1 | 2 | 3 | 4;
type ViewMode = 'composite' | 'field';
type Aa = 'on' | 'off';

const octaveOptions: readonly { value: Octaves; label: string }[] = [
  { value: 0, label: '0' },
  { value: 2, label: '2' },
  { value: 4, label: '4' },
];
const viewOptions: readonly { value: ViewMode; label: string }[] = [
  { value: 'composite', label: 'final image' },
  { value: 'field', label: 'mask field' },
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
    // window. Both show exactly ABOUT_CROP of the frame, so canvas pixels map
    // proportionally into that rect of the image.
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      const [cx, cy, cw, ch] = ABOUT_CROP;
      const ix = (cx + (sx / canvas.width) * cw) * img.naturalWidth;
      const iy = (cy + (sy / canvas.height) * ch) * img.naturalHeight;
      const iw = (REGION / canvas.width) * cw * img.naturalWidth;
      const ih = (REGION / canvas.height) * ch * img.naturalHeight;
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
      <div style={{ position: 'relative', aspectRatio: ABOUT_CROP_ASPECT, overflow: 'hidden' }}>
        <AboutUnderlay imgRef={imgRef} />
        <canvas
          ref={canvasRef}
          aria-label="live reveal with adjustable edge noise: move the pointer over the drawing, or watch the autopilot"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />
      </div>
      <div>
        <div style={{ fontFamily: SANS, fontSize: '0.72rem', letterSpacing: '0.08em', color: MUTED, marginBottom: '0.4rem' }}>
          magnified edge · pixel smoothing disabled
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
    <Chapter id="ch06" number="06" title="making the edge look like ink">
      <Prose>
        <P>
          the mask alone produces a smooth, regular outline. that&apos;s useful for a digital brush,
          but real ink doesn&apos;t spread through paper evenly.
        </P>
        <P>
          to break up the edge, the display shader generates <strong>value noise</strong>: random
          values placed on a grid and smoothly blended together. one layer creates broad, soft
          variation.
        </P>
        <P>
          the shader then combines several layers at different scales. each layer is finer and
          weaker than the one before it. this technique is called{' '}
          <strong>fractal Brownian motion</strong>, or <strong>fbm</strong>, and it creates detail
          at several sizes without losing the larger shapes.
        </P>
        <P>
          the noise slightly raises or lowers the mask before the reveal threshold is applied. that
          moves different parts of the boundary inward or outward, creating the irregular ink edge.
        </P>
        <P>
          finally, <C>fwidth</C> measures how quickly the value changes across a screen pixel. the
          shader uses that measurement to soften the boundary by about 1.5 pixels, preventing
          jagged edges whether the mask is sharp, faint, large, or small.
        </P>
      </Prose>

      <Figure
        number={7}
        caption="start with no noise, then add the layers one at a time. disable antialiasing and inspect the enlarged edge in the loupe."
        controls={
          <>
            <ControlGroup label="try">
              <Toggle label="noise layers" value={octaves} onChange={setOctaves} options={octaveOptions} />
              <Toggle label="view" value={view} onChange={setView} options={viewOptions} />
              <Toggle label="antialiasing" value={aa} onChange={setAa} options={aaOptions} />
            </ControlGroup>
            <ControlDisclosure label="tune">
              <Slider label="reveal threshold" value={threshold} min={0.02} max={0.5} step={0.01} format={(v) => v.toFixed(2)} onChange={setThreshold} />
              <Slider label="noise strength" value={noise} min={0} max={0.3} step={0.01} format={(v) => v.toFixed(2)} onChange={setNoise} />
            </ControlDisclosure>
          </>
        }
      >
        <EdgeFigure edge={edge} view={view} />
        {warn ? (
          <p style={{ margin: '1rem 0 0', fontFamily: SANS, fontStyle: 'italic', fontSize: '0.95rem', color: MUTED }}>
            the noise is now strong enough to push untouched areas above the reveal threshold,
            creating stray speckles.
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
