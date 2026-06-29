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
/** Max corner radius of the wrap, in px. Clamped to half the box's shorter side,
 *  so short targets become fully pill-ended; raise for rounder, lower for boxier. */
const MAX_RADIUS = 28;

/** Geometry spring — overdamped + low stiffness gives a slow, smooth dot↔box
 *  transition with (almost) no rebound. Lower STIFFNESS = slower transition;
 *  lower DAMPING = less "boing". At this damping, keep stiffness under ~0.12 to
 *  stay non-bouncy (above that it starts to overshoot/oscillate again). */
const SPRING_STIFFNESS = 0.09; // engage: dot → box (slow)
const SPRING_DAMPING = 0.5; // <0.59 here = overdamped, no rebound
const RELEASE_STIFFNESS = 0.1; // release: box → dot (also slow now, was 0.45)
const RELEASE_EPSILON = 0.5;
/** How far (px) past a target's edge the cursor can travel before the wrap lets
 *  go. Bigger = the box "holds on" to the cursor further out before snapping back. */
const RELEASE_DISTANCE = 30;

/* ---- Shader-side tunables (injected as GLSL float literals) ------- */
/** Smooth-min blend radius in px (bigger = longer liquid bridge dot↔box). Sized
 *  to ~RELEASE_DISTANCE so the wrap stays visibly connected to the cursor while
 *  it "holds on" past the edge, instead of detaching before it lets go. */
const SMIN_K = 48;
/** Domain-warp amplitude in px when fully wrapped (subtle!). */
const WARP_AMP = 4;
/** Noise spatial scale (smaller = larger, lazier warp). */
const WARP_NOISE_SCALE = 0.012;
/** Noise time speed. */
const WARP_TIME_SPEED = 0.35;

/* ---- Trail tunables (reveal-style ping-pong feedback) ------------- */
/* The trail is an organic, fading wisp inked along the cursor's PATH into a
 * ping-pong feedback buffer (borrowed from RevealFluid.tsx). Each frame the
 * buffer decays a little and a soft stroke is added from the previous cursor
 * position to the current one. The composite pass turns that buffer into a
 * gentle white coverage UNIONed with the crisp blob. Keep it SUBTLE. */
/** Rough fade time in seconds — how long inked path lingers before vanishing.
 *  Bigger = a longer comet tail and a more forgiving bridge on a fast pull. */
const TRAIL_FADE = 0.6;
/** Stroke radius in px — half-thickness of the inked path (soft falloff to 0
 *  at this distance; solid only within ~10% of it). Wider = chunkier wisp. */
const TRAIL_RADIUS = 16;
/** How much ink a single frame's stroke deposits (0..1, accumulates + clamps).
 *  Higher = the trail reads in immediately; lower = it has to be retraced. */
const TRAIL_STRENGTH = 0.6;
/** Peak opacity of the trail in the composite (the blob itself is always 1).
 *  This is the main "subtlety" dial — lower for a fainter wisp. */
const TRAIL_OPACITY = 0.5;
/** Soft-edge thresholds mapping buffer value -> trail coverage. Values below
 *  EDGE0 are invisible (the faded tail); at/above EDGE1 are full TRAIL_OPACITY. */
const TRAIL_EDGE0 = 0.08;
const TRAIL_EDGE1 = 0.6;

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
      out vec2 vUv;
      void main() {
        // vUv: 0..1 across the quad, origin bottom-left (GL convention). Used to
        // sample/write the trail buffer; both passes share this so a given screen
        // pixel maps to the same texel in the update and composite passes.
        vUv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    /* -------- Pass 1: trail update (ping-pong feedback) ------------- */
    // Mirrors RevealFluid's blob shader. Reads the previous trail buffer, decays
    // it a touch, then deposits a soft stroke from the previous cursor position
    // to the current one (segment-distance trick → no dotted gaps on a fast
    // move). Single R channel (RGBA8). All distances are in CSS px so they line
    // up 1:1 with the composite pass and the DOM cursor coords.
    const trailFS = `#version 300 es
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D u_prev;      // previous trail buffer
      uniform vec2  u_resolution;    // CSS px
      uniform vec2  u_cursor;        // DOM px (current)
      uniform vec2  u_prevCursor;    // DOM px (previous frame)
      uniform float u_active;        // 1 when a real pointer exists
      uniform float u_dt;            // seconds since last frame

      void main() {
        float prev = texture(u_prev, vUv).r;

        // Decay (clamped per-frame so a long frame can't wipe the whole trail).
        prev -= clamp(u_dt / ${glf(TRAIL_FADE)}, 0.0, 0.1);
        prev = clamp(prev, 0.0, 1.0);

        if (u_active > 0.5) {
          // This fragment in CSS px, top-left origin (vUv.y flipped to match DOM).
          vec2 fragPx = vec2(vUv.x, 1.0 - vUv.y) * u_resolution;

          // Closest point on the segment prevCursor -> cursor, then its distance.
          vec2 seg = u_cursor - u_prevCursor;
          float segLenSq = max(dot(seg, seg), 1e-5);
          float t = clamp(dot(fragPx - u_prevCursor, seg) / segLenSq, 0.0, 1.0);
          vec2 closest = u_prevCursor + seg * t;
          float dist = distance(fragPx, closest);

          float f = 1.0 - smoothstep(${glf(TRAIL_RADIUS)} * 0.1, ${glf(TRAIL_RADIUS)}, dist);
          prev += f * ${glf(TRAIL_STRENGTH)};
          prev = clamp(prev, 0.0, 1.0);
        }

        fragColor = vec4(prev, 0.0, 0.0, 1.0);
      }
    `;

    /* -------- Pass 2: composite (crisp blob ∪ soft trail) ---------- */
    // All math is in CSS px with a top-left origin (matching DOM coords). We
    // convert gl_FragCoord (physical px, bottom-left) accordingly. The blob is
    // computed exactly as before (rounded box smin'd with the dot, warped); the
    // trail buffer is read via vUv and unioned in as a soft, fading coverage.
    const compositeFS = `#version 300 es
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform vec2  u_resolution; // CSS px
      uniform float u_dpr;
      uniform float u_time;
      uniform vec2  u_cursor;     // DOM px, snappy dot center
      uniform float u_dotRadius;  // px
      uniform vec4  u_box;        // cx, cy, halfW, halfH (DOM px)
      uniform float u_corner;     // px
      uniform float u_wrap;       // 0..1
      uniform sampler2D u_trail;  // trail buffer (R channel)

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

        // Merge strength grows in as we wrap (≈0 when free → plain dot). The smin
        // bridge keeps the dot connected to the box across small gaps; the trail
        // (below) covers larger gaps on a fast pull-away.
        float k = mix(0.001, ${glf(SMIN_K)}, u_wrap);
        float d = smin(dDot, dBox, k);

        // ~1 physical px anti-aliased edge → crisp blob coverage.
        float aa = 1.0 / u_dpr;
        float blobAlpha = 1.0 - smoothstep(-aa, aa, d);

        // Soft trail coverage from the feedback buffer (fading wisp behind path).
        float trailValue = texture(u_trail, vUv).r;
        float trailAlpha = smoothstep(${glf(TRAIL_EDGE0)}, ${glf(TRAIL_EDGE1)}, trailValue)
                           * ${glf(TRAIL_OPACITY)};

        // Union: the blob stays fully crisp; the trail only adds where it's softer.
        float coverage = max(blobAlpha, trailAlpha);

        // Premultiplied white (premultipliedAlpha:true).
        fragColor = vec4(vec3(coverage), coverage);
      }
    `;

    const trailProgram = createProgram(vs, trailFS);
    if (!trailProgram) return;
    const compositeProgram = createProgram(vs, compositeFS);
    if (!compositeProgram) return;

    // Composite-pass uniforms (the on-screen blob + trail union).
    const u = {
      resolution: gl.getUniformLocation(compositeProgram, 'u_resolution'),
      dpr: gl.getUniformLocation(compositeProgram, 'u_dpr'),
      time: gl.getUniformLocation(compositeProgram, 'u_time'),
      cursor: gl.getUniformLocation(compositeProgram, 'u_cursor'),
      dotRadius: gl.getUniformLocation(compositeProgram, 'u_dotRadius'),
      box: gl.getUniformLocation(compositeProgram, 'u_box'),
      corner: gl.getUniformLocation(compositeProgram, 'u_corner'),
      wrap: gl.getUniformLocation(compositeProgram, 'u_wrap'),
      trail: gl.getUniformLocation(compositeProgram, 'u_trail'),
    };
    // Trail-update-pass uniforms.
    const ut = {
      prev: gl.getUniformLocation(trailProgram, 'u_prev'),
      resolution: gl.getUniformLocation(trailProgram, 'u_resolution'),
      cursor: gl.getUniformLocation(trailProgram, 'u_cursor'),
      prevCursor: gl.getUniformLocation(trailProgram, 'u_prevCursor'),
      active: gl.getUniformLocation(trailProgram, 'u_active'),
      dt: gl.getUniformLocation(trailProgram, 'u_dt'),
    };

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPosTrail = gl.getAttribLocation(trailProgram, 'a_position');
    const aPosComposite = gl.getAttribLocation(compositeProgram, 'a_position');

    // Bind the shared quad and point the given attribute at it, then draw.
    const drawQuad = (aLoc: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(aLoc);
      gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    /* -------- ping-pong FBO pair for the trail (mirrors RevealFluid) */
    // RGBA8, LINEAR, CLAMP_TO_EDGE. Sized to the physical (DPR-scaled) canvas.
    const createFBO = (fw: number, fh: number) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo };
    };
    // Clear an FBO to zero so the very first frame reads an empty trail (no flash).
    const clearFBO = (fb: { fbo: WebGLFramebuffer | null }) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };

    const scaleByDpr = (v: number) => Math.floor(v * (window.devicePixelRatio || 1));

    let fbW = Math.max(1, scaleByDpr(canvas.clientWidth));
    let fbH = Math.max(1, scaleByDpr(canvas.clientHeight));
    let fbA = createFBO(fbW, fbH);
    let fbB = createFBO(fbW, fbH);
    clearFBO(fbA);
    clearFBO(fbB);

    // Recreate both FBOs at a new size (and clear) when the canvas resizes.
    const resizeFBOs = (fw: number, fh: number) => {
      if (fw === fbW && fh === fbH) return;
      gl.deleteTexture(fbA.tex);
      gl.deleteFramebuffer(fbA.fbo);
      gl.deleteTexture(fbB.tex);
      gl.deleteFramebuffer(fbB.fbo);
      fbW = fw;
      fbH = fh;
      fbA = createFBO(fw, fh);
      fbB = createFBO(fw, fh);
      clearFBO(fbA);
      clearFBO(fbB);
    };

    /* -------- shared cursor state machine -------------------------- */
    let mode: Mode = 'free';
    let activeEl: Element | null = null;
    let pointerX = -9999;
    let pointerY = -9999;
    let hasPointer = false;
    let destroyed = false;
    let rafId: number | null = null;

    // Trail bookkeeping: where the cursor was last frame (so the update pass can
    // ink the segment prevCursor → cursor) and dt for the decay. prevCursor is
    // seeded to the cursor on the first move so there's no stroke from (0,0).
    let prevCursorX = pointerX;
    let prevCursorY = pointerY;
    let hasPrevCursor = false;
    let lastTime = performance.now();

    const cx: Spring = { value: -9999, velocity: 0 };
    const cy: Spring = { value: -9999, velocity: 0 };
    const w: Spring = { value: DOT_SIZE, velocity: 0 };
    const h: Spring = { value: DOT_SIZE, velocity: 0 };
    const grow: Spring = { value: 0, velocity: 0 };

    const snap = (s: Spring, target: number) => {
      s.value = target;
      s.velocity = 0;
    };

    const render = (now: number) => {
      if (destroyed) return;

      // Seconds since last frame (clamped like RevealFluid so a stalled tab can't
      // wipe or over-build the trail in one giant step).
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // DPR-aware resize (also resizes the trail FBOs to match).
      const cw = scaleByDpr(canvas.clientWidth);
      const ch = scaleByDpr(canvas.clientHeight);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        resizeFBOs(cw, ch);
      }
      const dpr = window.devicePixelRatio || 1;

      let rect: DOMRect | null = null;
      if (mode === 'pinned') {
        rect = activeEl && activeEl.isConnected ? activeEl.getBoundingClientRect() : null;
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          activeEl = null;
          mode = 'releasing';
          rect = null;
        } else {
          // Hysteresis hold: stay wrapped until the cursor pulls RELEASE_DISTANCE
          // past the element's edge (distance is 0 while inside the rect), so the
          // box "holds on" to the cursor further out before letting go.
          const dx = Math.max(rect.left - pointerX, 0, pointerX - rect.right);
          const dy = Math.max(rect.top - pointerY, 0, pointerY - rect.bottom);
          if (Math.hypot(dx, dy) > RELEASE_DISTANCE) {
            activeEl = null;
            mode = 'releasing';
            rect = null;
          }
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

      const cursorX = hasPointer ? pointerX : -9999;
      const cursorY = hasPointer ? pointerY : -9999;
      // Seed prevCursor to the current cursor on the first real move (zero-length
      // segment = a single dot at the cursor, no streak from the sentinel).
      if (hasPointer && !hasPrevCursor) {
        prevCursorX = cursorX;
        prevCursorY = cursorY;
        hasPrevCursor = true;
      }

      // --- Pass 1: update the trail (render to fbB, reading fbA) ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbB.fbo);
      gl.viewport(0, 0, fbW, fbH);
      gl.useProgram(trailProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbA.tex);
      gl.uniform1i(ut.prev, 0);
      gl.uniform2f(ut.resolution, canvas.clientWidth, canvas.clientHeight);
      gl.uniform2f(ut.cursor, cursorX, cursorY);
      gl.uniform2f(ut.prevCursor, prevCursorX, prevCursorY);
      gl.uniform1f(ut.active, hasPointer ? 1 : 0);
      gl.uniform1f(ut.dt, dt);
      drawQuad(aPosTrail);

      // Remember this frame's cursor for next frame's segment, then swap so fbA
      // holds the freshly-updated trail for the composite pass below.
      prevCursorX = cursorX;
      prevCursorY = cursorY;
      const tmp = fbA;
      fbA = fbB;
      fbB = tmp;

      // --- Pass 2: composite the blob + trail to the screen ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(compositeProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbA.tex);
      gl.uniform1i(u.trail, 0);
      gl.uniform2f(u.resolution, canvas.clientWidth, canvas.clientHeight);
      gl.uniform1f(u.dpr, dpr);
      gl.uniform1f(u.time, now * 0.001);
      // Hide everything until a real pointer position is known.
      gl.uniform2f(u.cursor, cursorX, cursorY);
      gl.uniform1f(u.dotRadius, DOT_SIZE / 2);
      gl.uniform4f(u.box, cx.value, cy.value, w.value / 2, h.value / 2);
      gl.uniform1f(u.corner, MAX_RADIUS);
      gl.uniform1f(u.wrap, grow.value);

      drawQuad(aPosComposite);

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
    // No pointerout release: the wrap now lets go via the RELEASE_DISTANCE
    // hysteresis in the render loop, so it can "hold on" past the element edge.

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerover', onPointerOver, true);
    rafId = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver, true);
      gl.deleteBuffer(quadBuf);
      gl.deleteProgram(trailProgram);
      gl.deleteProgram(compositeProgram);
      gl.deleteTexture(fbA.tex);
      gl.deleteFramebuffer(fbA.fbo);
      gl.deleteTexture(fbB.tex);
      gl.deleteFramebuffer(fbB.fbo);
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
