// src/components/explainer/chapters/Hero.tsx
'use client';
import { useRef } from 'react';
import { AboutUnderlay, ABOUT_CROP_ASPECT } from '../figure/AboutUnderlay';
import { Figure, useFigureActive } from '../figure/Figure';
import { useReducedMotion } from '../hooks';
import { useRevealCanvas } from '../useRevealCanvas';

/**
 * The real reveal shader, running the same code as the about page, over the
 * first about-loop frame as a static underlay. Play first, read after.
 */
function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const active = useFigureActive();
  const reducedMotion = useReducedMotion();
  useRevealCanvas(canvasRef, { active, reducedMotion, panes: [{ view: 0 }] });
  return (
    <div style={{ position: 'relative', aspectRatio: ABOUT_CROP_ASPECT, overflow: 'hidden' }}>
      <AboutUnderlay />
      <canvas
        ref={canvasRef}
        aria-label="live reveal: move the pointer over the drawing to paint"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
    </div>
  );
}

export default function Hero() {
  return (
    <Figure
      number={1}
      caption="go ahead, paint. this is the same shader as the about page, running the same code."
    >
      <HeroCanvas />
    </Figure>
  );
}
