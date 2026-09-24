// src/components/explainer/useRevealCanvas.ts
'use client';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { createBrush, stepBrush, type Brush } from '@/components/reveal/brush';
import { createRevealRenderer, type RevealRenderer } from '@/components/reveal/revealRenderer';
import { DEFAULT_EDGE, type EdgeParams, type RevealView } from '@/components/reveal/shaders';
import { ABOUT_REFERENCE_IMAGE } from '@/components/story/storyData';

export type RevealPane = { view: RevealView };

export type RevealCanvasOptions = {
  active: boolean;
  reducedMotion: boolean;
  panes: readonly RevealPane[];
  /** Gap between panes in CSS px. */
  gap?: number;
  edge?: EdgeParams;
  /** Scripted pointer when idle (not hovered). Given seconds, returns clip-space x,y. */
  autopilot?: (t: number) => { x: number; y: number };
  /** Runs right after each frame is drawn (e.g. a loupe copying pixels). */
  afterDraw?: (canvas: HTMLCanvasElement, brush: Brush) => void;
};

const BASE_RADIUS = 0.15;
const FADE_DURATION = 2.5;
const STRENGTH = 0.12;

export function useRevealCanvas(canvasRef: RefObject<HTMLCanvasElement | null>, opts: RevealCanvasOptions) {
  const optsRef = useRef(opts);
  // Assigned in an effect (not during render) so this stays a side-effect-free
  // render, per the react-hooks lint rules.
  useLayoutEffect(() => {
    optsRef.current = opts;
  });
  const rendererRef = useRef<RevealRenderer | null>(null);

  // Pointer state lives across activations.
  const pointer = useRef({ x: 0, y: 0, active: false, newStroke: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const paneAt = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const n = optsRef.current.panes.length;
      const gap = optsRef.current.gap ?? 0;
      const paneW = (rect.width - gap * (n - 1)) / n;
      const local = clientX - rect.left;
      const i = Math.min(n - 1, Math.max(0, Math.floor(local / (paneW + gap))));
      return { left: rect.left + i * (paneW + gap), width: paneW, rect };
    };
    const onMove = (e: PointerEvent) => {
      const { left, width, rect } = paneAt(e.clientX);
      const p = pointer.current;
      p.x = ((e.clientX - left) / width) * 2 - 1;
      p.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      if (!p.active) p.newStroke = true;
      p.active = true;
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [canvasRef]);

  useEffect(() => {
    if (!opts.active) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    if (!rendererRef.current) {
      const gl = canvas.getContext('webgl2', {
        alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false,
      });
      if (!gl) return undefined;
      const renderer = createRevealRenderer(gl);
      if (!renderer) return undefined;
      rendererRef.current = renderer;
      const img = new Image();
      // Only upload into the renderer this load was started for — it may have
      // been disposed (and replaced) by the time the image arrives.
      img.onload = () => {
        if (rendererRef.current === renderer) renderer.setReference(img);
      };
      img.src = ABOUT_REFERENCE_IMAGE;
    }
    const renderer = rendererRef.current;
    const brush = createBrush(BASE_RADIUS);
    let id = 0;
    let last = performance.now();
    let clock = 0;
    let autopilotWasOn = false;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const o = optsRef.current;
      if (!o.reducedMotion) clock += dt;

      // Capped at 2 (RevealFluid isn't): several figure canvases can be on
      // screen at once, and 3x adds fill cost without visible gain here.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.floor(canvas.clientWidth * dpr);
      const ch = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const n = o.panes.length;
      const gap = Math.round((o.gap ?? 0) * dpr);
      const paneW = Math.floor((canvas.width - gap * (n - 1)) / n);
      const paneH = canvas.height;
      const aspect = paneW / paneH;
      renderer.resize(paneW, paneH);

      // Real pointer wins; otherwise the optional autopilot draws.
      const p = pointer.current;
      const auto = !p.active && o.autopilot && !o.reducedMotion ? o.autopilot(clock) : null;
      const painting = stepBrush(brush, {
        pointerX: auto ? auto.x : p.x,
        pointerY: auto ? auto.y : p.y,
        pointerActive: p.active || !!auto,
        newStroke: p.newStroke || (!!auto && !autopilotWasOn),
        dt,
        aspect,
        baseRadius: BASE_RADIUS,
      });
      p.newStroke = false;
      autopilotWasOn = !!auto;

      renderer.paint(brush, painting, { dt, fadeDuration: FADE_DURATION, strength: STRENGTH, aspect });
      renderer.clear();
      o.panes.forEach((pane, i) => {
        renderer.draw({
          viewport: [i * (paneW + gap), 0, paneW, paneH],
          aspect,
          time: clock,
          view: pane.view,
          edge: o.edge ?? DEFAULT_EDGE,
        });
      });
      o.afterDraw?.(canvas, brush);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [opts.active, canvasRef]);

  // Free the GL resources on unmount, and forget the renderer so a remount
  // (React Strict Mode mounts, unmounts and remounts in dev) builds a fresh
  // one. The context itself is left alone: a context lost with
  // WEBGL_lose_context stays lost for this canvas, so a remount couldn't
  // draw again.
  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    },
    [],
  );
}
