'use client';

import { useEffect, useRef } from 'react';
import { stepSpring, type Spring } from '../cursorMath';

/* ------------------------------------------------------------------ */
/*  Technique 3 — SDF blob (WebGL2).                                   */
/*                                                                    */
/*  A full-viewport <canvas> with mix-blend-mode:difference. The       */
/*  fragment shader computes the signed distance to a rounded box at    */
/*  the hovered rect and to the cursor dot, then merges them with a     */
/*  polynomial smooth-min so the dot melts into the box as one liquid   */
/*  body. The sample point is domain-warped by a little fbm noise       */
/*  (driven by u_time) for a subtle organic wobble. The SDF is          */
/*  thresholded with smoothstep over ~1px into a crisp white fill on    */
/*  transparent. When not hovering it just draws the dot at the cursor. */
/*  Geometry (center/size/wrap) is springed on the JS side, mirroring   */
/*  the other two techniques; the shader only renders + wobbles.        */
/* ------------------------------------------------------------------ */

/* ---- Tunables (dial "subtle" by eye) ----------------------------- */

/** Diameter of the free cursor dot, in px. */
const DOT_SIZE = 18;
/** Padding around the hovered element's rect, in px. */
const HOVER_PAD = 8;
/** Max corner radius of the wrap, in px. */
const MAX_RADIUS = 16;

/** Geometry spring (slight overshoot). */
const SPRING_STIFFNESS = 0.18;
const SPRING_DAMPING = 0.72;
const RELEASE_STIFFNESS = 0.45;
const RELEASE_EPSILON = 0.5;

/* ---- Shader-side tunables (injected as GLSL float literals) ------- */
/** Smooth-min blend radius in px (bigger = longer liquid bridge dot↔box). */
const SMIN_K = 28;
/** Domain-warp amplitude in px when fully wrapped (subtle!). */
const WARP_AMP = 4;
/** Noise spatial scale (smaller = larger, lazier warp). */
const WARP_NOISE_SCALE = 0.012;
/** Noise time speed. */
const WARP_TIME_SPEED = 0.35;

const TARGET_SELECTOR = 'a, button, [role="button"]';

type Mode = 'free' | 'pinned' | 'releasing';

/** Format a JS number as a GLSL float literal (always has a decimal point). */
const glf = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export default function CursorSDF() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      // Graceful fail: leave the canvas blank so the page still works.
      console.warn('CursorSDF: WebGL2 unavailable; SDF cursor disabled.');
      return;
    }

    /* -------- shader helpers (mirrors RevealFluid.tsx) -------------- */
    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('CursorSDF shader error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const createProgram = (vsSrc: string, fsSrc: string) => {
      const vs = createShader(gl.VERTEX_SHADER, vsSrc);
      const fs = createShader(gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;
      const p = gl.createProgram();
      if (!p) return null;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('CursorSDF link error:', gl.getProgramInfoLog(p));
        return null;
      }
      return p;
    };

    const vs = `#version 300 es
      in vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // All math is in CSS px with a top-left origin (matching DOM coords). We
    // convert gl_FragCoord (physical px, bottom-left) accordingly.
    const fs = `#version 300 es
      precision highp float;
      out vec4 fragColor;

      uniform vec2  u_resolution; // CSS px
      uniform float u_dpr;
      uniform float u_time;
      uniform vec2  u_cursor;     // DOM px, snappy dot center
      uniform float u_dotRadius;  // px
      uniform vec4  u_box;        // cx, cy, halfW, halfH (DOM px)
      uniform float u_corner;     // px
      uniform float u_wrap;       // 0..1

      // Signed distance to a rounded box centered at the origin.
      float sdRoundBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + vec2(r);
        return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
      }

      // Polynomial smooth-min (merges two SDFs into one liquid body).
      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, amp = 0.5;
        for (int i = 0; i < 3; i++) {
          v += amp * noise(p);
          p *= 2.0;
          amp *= 0.5;
        }
        return v;
      }

      void main() {
        // physical, bottom-left  ->  CSS px, top-left
        vec2 p = gl_FragCoord.xy / u_dpr;
        p.y = u_resolution.y - p.y;

        // Subtle domain warp of the box sample, gated by wrap (free dot stays crisp).
        vec2 warp = vec2(
          fbm(p * ${glf(WARP_NOISE_SCALE)} + u_time * ${glf(WARP_TIME_SPEED)}),
          fbm(p * ${glf(WARP_NOISE_SCALE)} + 11.3 - u_time * ${glf(WARP_TIME_SPEED)})
        ) - 0.5;
        vec2 pb = p + warp * (${glf(WARP_AMP)} * u_wrap);

        vec2 boxCenter = u_box.xy;
        vec2 boxHalf = u_box.zw;
        float corner = min(u_corner, min(boxHalf.x, boxHalf.y));
        float dBox = sdRoundBox(pb - boxCenter, boxHalf, corner);
        float dDot = length(p - u_cursor) - u_dotRadius;

        // Merge strength grows in as we wrap (≈0 when free → plain dot).
        float k = mix(0.001, ${glf(SMIN_K)}, u_wrap);
        float d = smin(dDot, dBox, k);

        // ~1 physical px anti-aliased edge.
        float aa = 1.0 / u_dpr;
        float alpha = 1.0 - smoothstep(-aa, aa, d);

        // Premultiplied white (premultipliedAlpha:true).
        fragColor = vec4(vec3(alpha), alpha);
      }
    `;

    const program = createProgram(vs, fs);
    if (!program) return;

    const u = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      dpr: gl.getUniformLocation(program, 'u_dpr'),
      time: gl.getUniformLocation(program, 'u_time'),
      cursor: gl.getUniformLocation(program, 'u_cursor'),
      dotRadius: gl.getUniformLocation(program, 'u_dotRadius'),
      box: gl.getUniformLocation(program, 'u_box'),
      corner: gl.getUniformLocation(program, 'u_corner'),
      wrap: gl.getUniformLocation(program, 'u_wrap'),
    };

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_position');

    /* -------- shared cursor state machine -------------------------- */
    let mode: Mode = 'free';
    let activeEl: Element | null = null;
    let pointerX = -9999;
    let pointerY = -9999;
    let hasPointer = false;
    let destroyed = false;
    let rafId: number | null = null;

    const cx: Spring = { value: -9999, velocity: 0 };
    const cy: Spring = { value: -9999, velocity: 0 };
    const w: Spring = { value: DOT_SIZE, velocity: 0 };
    const h: Spring = { value: DOT_SIZE, velocity: 0 };
    const grow: Spring = { value: 0, velocity: 0 };

    const snap = (s: Spring, target: number) => {
      s.value = target;
      s.velocity = 0;
    };

    const scaleByDpr = (v: number) => Math.floor(v * (window.devicePixelRatio || 1));

    const render = (now: number) => {
      if (destroyed) return;

      // DPR-aware resize.
      const cw = scaleByDpr(canvas.clientWidth);
      const ch = scaleByDpr(canvas.clientHeight);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const dpr = window.devicePixelRatio || 1;

      let rect: DOMRect | null = null;
      if (mode === 'pinned') {
        rect = activeEl && activeEl.isConnected ? activeEl.getBoundingClientRect() : null;
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          activeEl = null;
          mode = 'releasing';
          rect = null;
        }
      }

      let tCX = pointerX;
      let tCY = pointerY;
      let tW = DOT_SIZE;
      let tH = DOT_SIZE;
      let tGrow = 0;
      if (mode === 'pinned' && rect) {
        tCX = rect.left + rect.width / 2;
        tCY = rect.top + rect.height / 2;
        tW = rect.width + HOVER_PAD * 2;
        tH = rect.height + HOVER_PAD * 2;
        tGrow = 1;
      }

      const stiffness = mode === 'releasing' ? RELEASE_STIFFNESS : SPRING_STIFFNESS;
      if (mode === 'free') {
        snap(cx, tCX);
        snap(cy, tCY);
        snap(w, tW);
        snap(h, tH);
        snap(grow, tGrow);
      } else {
        stepSpring(cx, tCX, stiffness, SPRING_DAMPING);
        stepSpring(cy, tCY, stiffness, SPRING_DAMPING);
        stepSpring(w, tW, stiffness, SPRING_DAMPING);
        stepSpring(h, tH, stiffness, SPRING_DAMPING);
        stepSpring(grow, tGrow, stiffness, SPRING_DAMPING);
      }

      if (mode === 'releasing') {
        const back =
          Math.abs(w.value - DOT_SIZE) < RELEASE_EPSILON &&
          Math.abs(cx.value - pointerX) < RELEASE_EPSILON &&
          Math.abs(cy.value - pointerY) < RELEASE_EPSILON &&
          grow.value < 0.02;
        if (back) mode = 'free';
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.uniform2f(u.resolution, canvas.clientWidth, canvas.clientHeight);
      gl.uniform1f(u.dpr, dpr);
      gl.uniform1f(u.time, now * 0.001);
      // Hide everything until a real pointer position is known.
      gl.uniform2f(u.cursor, hasPointer ? pointerX : -9999, hasPointer ? pointerY : -9999);
      gl.uniform1f(u.dotRadius, DOT_SIZE / 2);
      gl.uniform4f(u.box, cx.value, cy.value, w.value / 2, h.value / 2);
      gl.uniform1f(u.corner, MAX_RADIUS);
      gl.uniform1f(u.wrap, grow.value);

      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafId = requestAnimationFrame(render);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (!hasPointer) {
        cx.value = pointerX;
        cy.value = pointerY;
      }
      hasPointer = true;
    };
    const onPointerOver = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest(TARGET_SELECTOR) ?? null;
      if (target) {
        activeEl = target;
        mode = 'pinned';
      }
    };
    const onPointerOut = (e: PointerEvent) => {
      if (!activeEl) return;
      const related = e.relatedTarget;
      if (related instanceof Node && activeEl.contains(related)) return;
      activeEl = null;
      mode = 'releasing';
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    rafId = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      gl.deleteBuffer(quadBuf);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'block',
        mixBlendMode: 'difference',
        pointerEvents: 'none',
        zIndex: 2147483647,
      }}
    />
  );
}
