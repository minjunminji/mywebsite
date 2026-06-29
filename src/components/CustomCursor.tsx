'use client';

import { useEffect, useRef } from 'react';
import { stepSpring, type Spring } from './cursorMath';

/*
 * CustomCursor — the site's negative liquid cursor (WebGL2 SDF).
 *
 * Replaces the OS cursor with one solid white shape rendered by a full-viewport
 * <canvas> under mix-blend-mode:difference, so it shows the negative of whatever
 * it covers. Free movement is a plain round dot; on hover it smooth-min's with a
 * rounded box that springs to wrap the element (one liquid body); on leave the
 * box drains off along the direction you left, down a tapering stream, back into
 * the dot. An fbm domain-warp wobbles the wrapped edge. Geometry is springed /
 * eased on the JS side; the shader renders + wobbles.
 *
 * Gating: activates only on fine-pointer (hover-capable) devices; honors
 * prefers-reduced-motion (the wrap affordance is kept, the liquid motion is
 * stripped); hides the native cursor via the `cursor-hidden` class while active.
 * Mounted once in app/layout.tsx inside <body> (which has no
 * transform/filter/isolation ancestor) so it blends against the whole page.
 */

/* ---- Tunables (dial "subtle" by eye) ----------------------------- */

/** Diameter of the free cursor dot, in px. */
const DOT_SIZE = 18;
/** Default padding around the hovered element's rect, in px. A target can override
 *  it with a `data-cursor-pad` attribute (negative tightens the blob on small
 *  controls like the gallery chevrons). */
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
/** Release is a TIMED ease (ms), NOT a spring (a spring chases the moving cursor
 *  and always lags). Over this window the bulk reels onto the LIVE cursor along
 *  the pull axis and drains down the stream, landing exactly on it however you
 *  keep moving. Lower = snappier retract. */
const RELEASE_DURATION = 260;
/** How far (px) past a target's edge the cursor can travel before the wrap lets
 *  go. Bigger = the box "holds on" to the cursor further out before snapping back. */
const RELEASE_DISTANCE = 30;
/** Release distance for "tight" controls — those that opt into a smaller wrap via
 *  data-cursor-pad (the gallery chevrons and social icons). Shorter than
 *  RELEASE_DISTANCE so a small blob lets go near its own edge instead of holding
 *  on as far as a full-size label does. */
const TIGHT_RELEASE_DISTANCE = 15;

/* ---- Click press — squish the whole shape while the pointer is held ---- */
/** Scale of the metaball while pressed (1 = none). A domain scale around the box
 *  center, so the free dot and the wrapped blob shrink the same way. */
const PRESS_SCALE = 0.8;
/** Press spring — snappy, with a little rebound on release. */
const PRESS_STIFFNESS = 0.35;
const PRESS_DAMPING = 0.55;

/** Cap the cursor canvas backing-store DPR. A full-viewport canvas at full
 *  device-pixel-ratio is a lot of fragments every frame; 1.5 keeps the blob crisp
 *  while cutting the per-frame GPU + upload cost (which is what starves the cursor
 *  during the frame-by-frame scene transitions). */
const CURSOR_MAX_DPR = 1.5;

/** The canvas is sized to the blob's bounding box (not the viewport), so the
 *  mix-blend-mode:difference recomposite stays a small rect instead of the whole
 *  screen every frame. CANVAS_PAD is the margin (px) around the dot/box union for
 *  the smin bridge bulge (~SMIN_K/4 ≈ 12), the edge warp (WARP_AMP), and AA, so
 *  the shape never clips at the canvas edge. */
const CANVAS_PAD = 28;
/** Quantize the canvas CSS size to this step (px) so the backing store is only
 *  reallocated when it crosses a bucket — resizing the drawing buffer every frame
 *  is expensive. The extra transparent margin is free under difference. */
const CANVAS_STEP = 32;

/* ---- Shader-side tunables (injected as GLSL float literals) ------- */
/** Smooth-min radius in px (bigger = longer liquid bridge dot↔box). Sized to
 *  ~RELEASE_DISTANCE so the wrap stays visibly connected to the cursor while it
 *  "holds on" past the edge, instead of detaching before it lets go. */
const SMIN_K = 48;
/** Domain-warp amplitude in px when fully wrapped (subtle!). */
const WARP_AMP = 4;
/** Noise spatial scale (smaller = larger, lazier warp). */
const WARP_NOISE_SCALE = 0.012;
/** Noise time speed. */
const WARP_TIME_SPEED = 0.35;

/** Clickable things the cursor wraps (the site's text labels). */
const TARGET_SELECTOR = 'a, button, [role="button"]';
/** Marker on clickable non-text controls (icon buttons) that must NOT wrap. */
const SKIP_SELECTOR = '[data-cursor-skip]';

/** Only activate on devices with a real hovering, fine pointer (mouse/trackpad).
 *  On touch / coarse-pointer devices we render nothing and leave the OS cursor. */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
/** Media query for users who asked the OS to reduce motion. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Class added to <html> to hide the native cursor while ours is active. */
const HIDE_NATIVE_CURSOR_CLASS = 'cursor-hidden';

type Mode = 'free' | 'pinned' | 'releasing';

/** Format a JS number as a GLSL float literal (always has a decimal point). */
const glf = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export default function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Device gating: do nothing on touch / coarse-pointer devices. We neither
    // render a visible cursor nor hide the native one (the blank, transparent,
    // pointer-events:none canvas left in the DOM is inert).
    if (!window.matchMedia(FINE_POINTER_QUERY).matches) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      // Graceful fail: leave the canvas blank so the page still works.
      console.warn('CustomCursor: WebGL2 unavailable; custom cursor disabled.');
      return;
    }

    const root = document.documentElement;
    root.classList.add(HIDE_NATIVE_CURSOR_CLASS);

    // Reduced motion: keep the wrap-on-hover affordance, but snap the engage /
    // release (no spring, no drain) and switch the edge warp off. Tracked live.
    const reducedMotionMq = window.matchMedia(REDUCED_MOTION_QUERY);
    let reducedMotion = reducedMotionMq.matches;

    /* -------- shader helpers (mirrors RevealFluid.tsx) -------------- */
    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('CustomCursor shader error:', gl.getShaderInfoLog(s));
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
        console.error('CustomCursor link error:', gl.getProgramInfoLog(p));
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
      uniform vec2  u_cursor;     // DOM px, dot center
      uniform float u_dotRadius;  // px
      uniform vec4  u_box;        // cx, cy, halfW, halfH (DOM px)
      uniform float u_corner;     // px
      uniform float u_wrap;       // 0..1 — box edge warp + size gate
      uniform float u_bridge;     // 0..1 — dot↔box smooth-min strength
      uniform float u_stream;     // 0..1 — release drain stream (cursor→bulk cone)
      uniform float u_motion;     // 1 normal, 0 under prefers-reduced-motion
      uniform float u_press;      // press squish scale (1 = none, <1 = smaller)
      uniform vec2  u_origin;     // canvas top-left in viewport CSS px

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

      // Signed distance to a 2D rounded cone (tapered capsule) from a (radius r1)
      // to b (radius r2). One swept shape, so its two ends can never separate at
      // speed — it just stretches and tapers. (iq)
      float sdRoundedCone(vec2 p, vec2 a, vec2 b, float r1, float r2) {
        vec2 ba = b - a;
        float l2 = dot(ba, ba);
        float rr = r1 - r2;
        float a2 = l2 - rr * rr;
        float il2 = 1.0 / l2;
        vec2 pa = p - a;
        float y = dot(pa, ba);
        float z = y - l2;
        vec2 xv = pa * l2 - ba * y;
        float x2 = dot(xv, xv);
        float y2 = y * y * l2;
        float z2 = z * z * l2;
        float kk = sign(rr) * rr * rr * x2;
        if (sign(z) * a2 * z2 > kk) return sqrt(x2 + z2) * il2 - r2;
        if (sign(y) * a2 * y2 < kk) return sqrt(x2 + y2) * il2 - r1;
        return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
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
        // physical, bottom-left  ->  CSS px, top-left (canvas-local), then offset
        // by the canvas origin so all the geometry below stays in viewport coords
        // even though the canvas only covers the blob's bounding box.
        vec2 p = gl_FragCoord.xy / u_dpr;
        p.y = u_resolution.y - p.y;
        p += u_origin;

        // Press squish: domain-scale the whole shape around the box center, so the
        // free dot and the wrapped blob shrink uniformly while the pointer is held.
        p = u_box.xy + (p - u_box.xy) / u_press;

        // Subtle domain warp of the box sample, gated by wrap (free dot stays
        // crisp) and by motion (off under prefers-reduced-motion).
        vec2 warp = vec2(
          fbm(p * ${glf(WARP_NOISE_SCALE)} + u_time * ${glf(WARP_TIME_SPEED)}),
          fbm(p * ${glf(WARP_NOISE_SCALE)} + 11.3 - u_time * ${glf(WARP_TIME_SPEED)})
        ) - 0.5;
        vec2 pb = p + warp * (${glf(WARP_AMP)} * u_wrap * u_motion);

        vec2 boxCenter = u_box.xy;
        vec2 boxHalf = u_box.zw;
        float corner = min(u_corner, min(boxHalf.x, boxHalf.y));
        float dBox = sdRoundBox(pb - boxCenter, boxHalf, corner);

        // Cursor dot: a plain circle at the live pointer (no trail). All the gooey
        // behaviour lives in the box wrap and the release stream below.
        float dCursor = length(p - u_cursor) - u_dotRadius;

        // Merge the dot into the box. u_bridge tracks the wrap amount (full when
        // wrapped, easing to 0 on release), so the box melts back into the cursor
        // as one gooey body and the smin inflation deflates to nothing as it lands
        // — no leftover circle. ≈0 when free → the box is just the dot, a no-op.
        float k = mix(0.001, ${glf(SMIN_K)}, u_bridge);
        float d = smin(dCursor, dBox, k);

        // Tablecloth stream: while releasing, a tapered cone from the live cursor
        // (head, dot radius) to the trailing bulk (box center, ~bulk radius) keeps
        // the neck solid, so the bulk drains into the cursor and can NEVER pinch
        // off into a separate circle however far it trails. Gated by u_stream (0
        // when free/pinned). Guard skips the degenerate near-coincident /
        // containment case (bulk reeled onto the cursor) that would NaN the cone.
        if (u_stream > 0.001) {
          vec2 sb = boxCenter - u_cursor;
          float bulkR = min(boxHalf.x, boxHalf.y);
          float srr = bulkR - u_dotRadius;
          if (dot(sb, sb) > srr * srr + 1.0) {
            float dStream = sdRoundedCone(p, u_cursor, boxCenter, u_dotRadius, bulkR);
            d = smin(d, dStream, k);
          }
        }

        // Undo the press domain scale so distances are back in real px.
        d *= u_press;

        // ~1 physical px anti-aliased edge.
        float aa = 1.0 / u_dpr;
        float alpha = 1.0 - smoothstep(-aa, aa, d);

        // Premultiplied white (premultipliedAlpha:true).
        fragColor = vec4(vec3(alpha), alpha);
      }
    `;

    const program = createProgram(vs, fs);
    if (!program) {
      root.classList.remove(HIDE_NATIVE_CURSOR_CLASS);
      return;
    }

    const u = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      dpr: gl.getUniformLocation(program, 'u_dpr'),
      time: gl.getUniformLocation(program, 'u_time'),
      cursor: gl.getUniformLocation(program, 'u_cursor'),
      dotRadius: gl.getUniformLocation(program, 'u_dotRadius'),
      box: gl.getUniformLocation(program, 'u_box'),
      corner: gl.getUniformLocation(program, 'u_corner'),
      wrap: gl.getUniformLocation(program, 'u_wrap'),
      bridge: gl.getUniformLocation(program, 'u_bridge'),
      stream: gl.getUniformLocation(program, 'u_stream'),
      motion: gl.getUniformLocation(program, 'u_motion'),
      press: gl.getUniformLocation(program, 'u_press'),
      origin: gl.getUniformLocation(program, 'u_origin'),
    };

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_position');

    /* -------- cursor state machine --------------------------------- */
    let mode: Mode = 'free';
    let activeEl: Element | null = null;
    // Wrap padding for the active target (px). Defaults to HOVER_PAD; a target can
    // override it with data-cursor-pad (negative = a tighter blob, e.g. chevrons).
    let activePad = HOVER_PAD;
    // Release distance for the active target — tighter for data-cursor-pad controls.
    let activeRelease = RELEASE_DISTANCE;
    let pointerX = -9999;
    let pointerY = -9999;
    let hasPointer = false;
    // True while a pointer button is held down (drives the press squish).
    let pressed = false;
    // True while the pointer is inside the window and the window is focused.
    let inWindow = false;
    // Last visibility we wrote, so we only touch the DOM when it flips.
    let lastVisible = false;
    let destroyed = false;
    let rafId: number | null = null;

    const cx: Spring = { value: -9999, velocity: 0 };
    const cy: Spring = { value: -9999, velocity: 0 };
    const w: Spring = { value: DOT_SIZE, velocity: 0 };
    const h: Spring = { value: DOT_SIZE, velocity: 0 };
    const grow: Spring = { value: 0, velocity: 0 };
    // Press squish: 1 at rest, springs toward PRESS_SCALE while the pointer is held.
    const press: Spring = { value: 1, velocity: 0 };

    // Timed-release state: snapshot of the wrap's size when it lets go, the start
    // time, and the pull axis (unit) + how far the bulk starts behind the cursor
    // along it — the bulk reels from relTrail → 0 down this axis as it deflates.
    let relStart: number | null = null;
    let relDirX = 0;
    let relDirY = 0;
    let relTrail = 0;
    let relW = 0;
    let relH = 0;
    let relG = 0;

    const snap = (s: Spring, target: number) => {
      s.value = target;
      s.velocity = 0;
    };
    // Settle a spring toward its target — instant under reduced motion, else spring.
    const settle = (s: Spring, target: number) => {
      if (reducedMotion) snap(s, target);
      else stepSpring(s, target, SPRING_STIFFNESS, SPRING_DAMPING);
    };

    const cursorDpr = () => Math.min(window.devicePixelRatio || 1, CURSOR_MAX_DPR);

    const render = (now: number) => {
      if (destroyed) return;

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
          if (Math.hypot(dx, dy) > activeRelease) {
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
        // Never let the wrap fall below the free dot, even with a negative pad.
        tW = Math.max(rect.width + activePad * 2, DOT_SIZE);
        tH = Math.max(rect.height + activePad * 2, DOT_SIZE);
        tGrow = 1;
      }

      if (mode === 'free') {
        // Plain snappy dot.
        relStart = null;
        snap(cx, tCX);
        snap(cy, tCY);
        snap(w, tW);
        snap(h, tH);
        snap(grow, tGrow);
      } else if (mode === 'pinned') {
        // Engage: spring in slowly toward the wrapped box (snap under reduced motion).
        relStart = null;
        settle(cx, tCX);
        settle(cy, tCY);
        settle(w, tW);
        settle(h, tH);
        settle(grow, tGrow);
      } else if (reducedMotion) {
        // Reduced motion: no drain — snap straight back to the dot at the pointer.
        relStart = null;
        snap(cx, pointerX);
        snap(cy, pointerY);
        snap(w, DOT_SIZE);
        snap(h, DOT_SIZE);
        snap(grow, 0);
        mode = 'free';
      } else {
        // Releasing: a directional "tablecloth" drain. The dot stays at the LIVE
        // cursor (your hand); the bulk (box) does NOT re-center on it. Instead it
        // trails BEHIND the cursor along the pull axis captured at let-go and reels
        // in (relTrail → 0) while it deflates, draining down the tapering stream
        // (the shader cone) until it gathers into the dot. Anchored to the live
        // cursor, so it lands exactly on it however you keep moving.
        if (relStart === null) {
          relStart = now;
          relW = w.value;
          relH = h.value;
          relG = grow.value;
          // Pull axis = box-center → cursor at let-go. This is the direction the
          // cursor left in, and starting the bulk relTrail px back along it puts
          // it exactly where it already is (continuous, no jump).
          const ddx = pointerX - cx.value;
          const ddy = pointerY - cy.value;
          relTrail = Math.hypot(ddx, ddy);
          relDirX = relTrail > 1e-3 ? ddx / relTrail : 0;
          relDirY = relTrail > 1e-3 ? ddy / relTrail : 0;
        }
        const elapsed = now - relStart;
        const tSize = Math.min(elapsed / RELEASE_DURATION, 1);
        const eSize = 1 - Math.pow(1 - tSize, 3); // ease-out: quick off, gentle landing
        const trail = relTrail * (1 - eSize); // bulk reels onto the cursor
        // Bulk sits `trail` px behind the LIVE cursor along the pull axis, so the
        // stream stretches out as you keep moving and shortens as it reels in.
        cx.value = pointerX - relDirX * trail;
        cy.value = pointerY - relDirY * trail;
        w.value = relW + (DOT_SIZE - relW) * eSize;
        h.value = relH + (DOT_SIZE - relH) * eSize;
        grow.value = relG + (0 - relG) * eSize;
        if (tSize >= 1) mode = 'free';
      }

      // Press squish toward PRESS_SCALE while held; springs back (with a little
      // rebound) on release. The shader applies it as a domain scale, so the free
      // dot and the wrapped blob shrink the same way.
      const pressTarget = pressed ? PRESS_SCALE : 1;
      if (reducedMotion) snap(press, pressTarget);
      else stepSpring(press, pressTarget, PRESS_STIFFNESS, PRESS_DAMPING);

      // Reveal only once a real pointer position is known and the window is
      // focused/entered, so re-entry/refocus never flashes the cursor at (0,0).
      const visible = hasPointer && inWindow;
      if (visible !== lastVisible) {
        canvas.style.opacity = visible ? '1' : '0';
        lastVisible = visible;
      }

      // ---- Fit the canvas to the blob's bounding box ------------------------
      // A full-viewport canvas under mix-blend-mode forces the compositor to
      // re-blend the WHOLE screen every frame (worst when the scene behind it is
      // also animating). Sizing it to the union of the dot and the wrapped/
      // draining box — padded for the smin bulge + edge warp — shrinks that blend
      // to a small rect. Move it with a compositor-only transform every frame;
      // only reallocate the backing store when the quantized size changes.
      const dpr = cursorDpr();
      const dotR = DOT_SIZE / 2;
      const halfW = w.value / 2;
      const halfH = h.value / 2;
      const minX = Math.min(pointerX - dotR, cx.value - halfW);
      const minY = Math.min(pointerY - dotR, cy.value - halfH);
      const maxX = Math.max(pointerX + dotR, cx.value + halfW);
      const maxY = Math.max(pointerY + dotR, cy.value + halfH);
      const originX = Math.floor(minX - CANVAS_PAD);
      const originY = Math.floor(minY - CANVAS_PAD);
      const cssW = Math.ceil((Math.ceil(maxX + CANVAS_PAD) - originX) / CANVAS_STEP) * CANVAS_STEP;
      const cssH = Math.ceil((Math.ceil(maxY + CANVAS_PAD) - originY) / CANVAS_STEP) * CANVAS_STEP;
      const pxW = Math.max(1, Math.round(cssW * dpr));
      const pxH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = `${pxW / dpr}px`;
        canvas.style.height = `${pxH / dpr}px`;
      }
      canvas.style.transform = `translate(${originX}px, ${originY}px)`;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.uniform2f(u.resolution, pxW / dpr, pxH / dpr);
      gl.uniform2f(u.origin, originX, originY);
      gl.uniform1f(u.dpr, dpr);
      gl.uniform1f(u.time, now * 0.001);
      // Hide the shape until a real pointer position is known.
      gl.uniform2f(u.cursor, hasPointer ? pointerX : -9999, hasPointer ? pointerY : -9999);
      gl.uniform1f(u.dotRadius, DOT_SIZE / 2);
      gl.uniform4f(u.box, cx.value, cy.value, w.value / 2, h.value / 2);
      gl.uniform1f(u.corner, MAX_RADIUS);
      gl.uniform1f(u.wrap, grow.value);
      // Bridge tracks grow in EVERY mode (including release). A polynomial smin
      // doesn't just connect shapes, it inflates their union by ~k/4 of radius;
      // letting bridge deflate with grow keeps it ~1 early (box still big/offset →
      // melts in as one body) and eases it to 0 exactly as the box lands, so the
      // release→free handoff is continuous (no popped-off leftover circle).
      gl.uniform1f(u.bridge, grow.value);
      // Stream cone only while releasing — it forms the draining tablecloth neck.
      gl.uniform1f(u.stream, mode === 'releasing' ? 1.0 : 0.0);
      gl.uniform1f(u.motion, reducedMotion ? 0.0 : 1.0);
      gl.uniform1f(u.press, Math.max(press.value, 0.4));

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
      inWindow = true;
    };
    // Delegated targeting (capture phase): wrap when the pointer enters a clickable
    // text label, ignoring icon controls flagged with data-cursor-skip. The wrap
    // lets go via the RELEASE_DISTANCE hysteresis in the render loop (no pointerout),
    // so it can "hold on" past the element edge.
    const onPointerOver = (e: PointerEvent) => {
      const target = (e.target as Element | null)?.closest(TARGET_SELECTOR) ?? null;
      if (target && !target.closest(SKIP_SELECTOR)) {
        activeEl = target;
        const padAttr = target.getAttribute('data-cursor-pad');
        const parsedPad = padAttr === null ? NaN : parseFloat(padAttr);
        activePad = Number.isFinite(parsedPad) ? parsedPad : HOVER_PAD;
        // A target that customizes its pad is a "tight" control, so it also lets go
        // sooner (TIGHT_RELEASE_DISTANCE) rather than holding on like a big label.
        activeRelease = padAttr !== null ? TIGHT_RELEASE_DISTANCE : RELEASE_DISTANCE;
        mode = 'pinned';
      }
    };

    // Pointer entered / left the window entirely, and window focus changes (e.g.
    // tab/app switch). `focus` restores the cursor after alt-tabbing back without
    // moving the pointer; visibility still gates on hasPointer so it never flashes.
    const onPointerEnter = () => {
      inWindow = true;
    };
    const onPointerLeave = () => {
      inWindow = false;
      pressed = false;
    };
    const onFocus = () => {
      inWindow = true;
    };
    const onBlur = () => {
      inWindow = false;
      pressed = false;
    };
    const onReducedMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    const onPointerDown = () => {
      pressed = true;
    };
    const onPointerUp = () => {
      pressed = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.addEventListener('pointerover', onPointerOver, true);
    root.addEventListener('pointerenter', onPointerEnter);
    root.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    reducedMotionMq.addEventListener('change', onReducedMotionChange);
    rafId = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('pointerover', onPointerOver, true);
      root.removeEventListener('pointerenter', onPointerEnter);
      root.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      reducedMotionMq.removeEventListener('change', onReducedMotionChange);
      root.classList.remove(HIDE_NATIVE_CURSOR_CLASS);
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
        left: 0,
        top: 0,
        // Size + position are driven each frame by the rAF loop so the canvas only
        // covers the blob (keeps the difference recomposite off the full viewport).
        // Start tiny and off-screen until the first frame places it.
        width: '1px',
        height: '1px',
        transform: 'translate(-9999px, -9999px)',
        transformOrigin: 'top left',
        willChange: 'transform',
        display: 'block',
        mixBlendMode: 'difference',
        pointerEvents: 'none',
        // Hidden until the rAF loop sees a real pointer position inside the window.
        opacity: 0,
        zIndex: 2147483647,
      }}
    />
  );
}
