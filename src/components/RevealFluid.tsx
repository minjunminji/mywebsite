'use client';
import React, { useEffect, useRef } from 'react';
import { createBrush, stepBrush } from '@/components/reveal/brush';
import { DEFAULT_EDGE } from '@/components/reveal/shaders';
import { createRevealRenderer } from '@/components/reveal/revealRenderer';

interface RevealFluidProps {
  referenceImage: string;
  /** Radius of the reveal blob in UV space (default 0.15) */
  pointerRadius?: number;
  /** How many seconds blobs take to fade (default 2.5) */
  fadeDuration?: number;
  /** How fast the blob builds up per frame (default 0.12) */
  blobStrength?: number;
}

export default function RevealFluid({
  referenceImage,
  pointerRadius = 0.15,
  fadeDuration = 2.5,
  blobStrength = 0.12,
}: RevealFluidProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    let animFrameId: number | null = null;

    /* ------------------------------------------------------------------ */
    /*  WebGL setup                                                        */
    /* ------------------------------------------------------------------ */

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) return;

    const renderer = createRevealRenderer(gl);
    if (!renderer) return;

    /* ------------------------------------------------------------------ */
    /*  Reference image texture                                            */
    /* ------------------------------------------------------------------ */

    const refImg = new Image();
    refImg.crossOrigin = 'anonymous';
    refImg.onload = () => {
      if (destroyed) return;
      renderer.setReference(refImg);
    };
    refImg.src = referenceImage;

    /* ------------------------------------------------------------------ */
    /*  Pointer state                                                      */
    /* ------------------------------------------------------------------ */

    let pointerX = 10;
    let pointerY = 10;
    // True while the mouse is over the page or a finger is down.
    let pointerActive = false;
    // Set when the pointer comes back after a release, so the next stroke
    // starts on the cursor instead of sweeping in from the old one.
    let newStroke = false;

    // The brush chases the raw pointer with a little lag, so the painted
    // path is a smooth curve instead of straight per-frame segments.
    const brush = createBrush(pointerRadius);

    function getCanvasUV(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      return { x, y };
    }

    // The floating piano player sits above this canvas and these listeners are on
    // `window`, so without this guard using (or dragging) the player would smear
    // the reference reveal open underneath it.
    function isOverPlayer(target: EventTarget | null) {
      return target instanceof Element && target.closest('[data-piano-player]') !== null;
    }

    function setPointer(clientX: number, clientY: number) {
      const uv = getCanvasUV(clientX, clientY);
      pointerX = uv.x;
      pointerY = uv.y;
      if (!pointerActive) newStroke = true;
      pointerActive = true;
    }

    function onPointerMove(e: MouseEvent | PointerEvent) {
      if (isOverPlayer(e.target)) {
        onPointerLeave();
        return;
      }
      setPointer(e.clientX, e.clientY);
    }

    // Crossing into the embed's iframe hands every later pointermove to the
    // iframe's own document, so the move guard above never sees it. The parent
    // does get one pointerover, targeted at the iframe, on the way in — lift
    // the pointer there instead.
    function onPointerOver(e: PointerEvent) {
      if (isOverPlayer(e.target)) onPointerLeave();
    }

    // The pointer position is kept so the lagging brush can finish the
    // stroke up to where the pointer was released.
    function onPointerLeave() {
      pointerActive = false;
    }

    // Browsers don't reliably send pointerleave to window; a mouseout with
    // no relatedTarget is the pointer leaving the page.
    function onMouseOut(e: MouseEvent) {
      if (!e.relatedTarget) onPointerLeave();
    }

    function onTouchMove(e: TouchEvent) {
      if (isOverPlayer(e.target)) {
        onPointerLeave();
        return;
      }
      if (e.touches.length > 0) {
        setPointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerover', onPointerOver);
    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('touchmove', onTouchMove, { passive: true } as AddEventListenerOptions);
    window.addEventListener('touchend', onPointerLeave);

    /* ------------------------------------------------------------------ */
    /*  Animation loop                                                     */
    /* ------------------------------------------------------------------ */

    let lastTime = performance.now();
    const startTime = lastTime;

    // Freeze the edge noise drift for reduced-motion users.
    const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    function scaleByPixelRatio(v: number) {
      return Math.floor(v * (window.devicePixelRatio || 1));
    }

    function frame(now: number) {
      if (destroyed) return;

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Resize canvas to match layout
      const cw = scaleByPixelRatio(canvas!.clientWidth);
      const ch = scaleByPixelRatio(canvas!.clientHeight);
      if (canvas!.width !== cw || canvas!.height !== ch) {
        canvas!.width = cw;
        canvas!.height = ch;
      }
      renderer!.resize(canvas!.width, canvas!.height);

      const aspect = canvas!.width / canvas!.height;

      const painting = stepBrush(brush, {
        pointerX,
        pointerY,
        pointerActive,
        newStroke,
        dt,
        aspect,
        baseRadius: pointerRadius,
      });
      newStroke = false;

      renderer!.paint(brush, painting, {
        dt,
        fadeDuration,
        strength: blobStrength,
        aspect,
      });
      renderer!.clear();
      renderer!.draw({
        viewport: [0, 0, canvas!.width, canvas!.height],
        aspect,
        time: reducedMotionMq.matches ? 0 : (now - startTime) / 1000,
        view: 0,
        edge: DEFAULT_EDGE,
      });

      animFrameId = requestAnimationFrame(frame);
    }

    animFrameId = requestAnimationFrame(frame);

    /* ------------------------------------------------------------------ */
    /*  Cleanup                                                            */
    /* ------------------------------------------------------------------ */

    return () => {
      destroyed = true;
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onPointerLeave);
      renderer.dispose();
    };
  }, [referenceImage, pointerRadius, fadeDuration, blobStrength]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}
