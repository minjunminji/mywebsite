'use client';

import { useEffect, useRef } from 'react';
import { stepSpring, type Spring } from '../cursorMath';

/* ------------------------------------------------------------------ */
/*  Technique 3 — SDF blob (WebGL2).                                   */
/*                                                                    */
/*  A full-viewport <canvas> with mix-blend-mode:difference. The       */
/*  fragment shader builds one solid white shape from signed-distance  */
/*  fields and thresholds it crisply, so it reads as the page          */
/*  "negative". The cursor is a teardrop: the round dot plus a short   */
/*  trailing point, smooth-min'd into a gooey comet that grows while   */
/*  moving and collapses to a circle at rest (capped at ~one diameter  */
/*  long). On hover that teardrop smooth-min's with a rounded box that  */
/*  springs to wrap the element, so dot, tail and box are one body.    */
/*  A little fbm domain-warp wobbles the box edge. Geometry is springed */
/*  on the JS side; the shader only renders + wobbles.                 */
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
/** Release is a TIMED ease back onto the cursor (ms), NOT a spring. A spring
 *  chases the moving cursor and, being overdamped, always lags — it only catches
 *  up once you stop, reading as a loose circle trailing the box. A timed lerp
 *  lands exactly on the live cursor within this window however you keep moving.
 *  Lower = snappier retract. */
const RELEASE_DURATION = 260;
/** How fast (ms) the releasing wrap re-centers onto the cursor — much shorter than
 *  RELEASE_DURATION so it becomes concentric with the dot almost immediately and
 *  then deflates in place, instead of trailing behind as a separate offset circle.
 *  Keep this well under RELEASE_DURATION. */
const RELEASE_POS_DURATION = 90;
/** How far (px) past a target's edge the cursor can travel before the wrap lets
 *  go. Bigger = the box "holds on" to the cursor further out before snapping back. */
const RELEASE_DISTANCE = 30;

/* ---- Trailing tail — a short, gooey comet behind the moving dot --- */
/** How fast the tail point chases the cursor (per frame). Higher = the tail
 *  keeps up tighter, so it's shorter; lower = it lags more, longer tail. */
const TAIL_FOLLOW = 0.2;
/** Max tail length (dot center → tail point), in px. Capped to one diameter so
 *  the trail stays short, per the desired look. */
const TAIL_MAX = DOT_SIZE*3;
/** Radius of the tail's trailing end, in px (small → it tapers to a point). */
const TAIL_RADIUS = 3;

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
      uniform vec2  u_cursor;     // DOM px, snappy dot center (tail head)
      uniform vec2  u_tail;       // DOM px, trailing tail point
      uniform float u_dotRadius;  // px
      uniform float u_tailRadius; // px
      uniform vec4  u_box;        // cx, cy, halfW, halfH (DOM px)
      uniform float u_corner;     // px
      uniform float u_wrap;       // 0..1 — box edge warp + size gate
      uniform float u_bridge;     // 0..1 — dot↔box smooth-min strength

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

        // Cursor teardrop: a tapered capsule swept from the dot head (radius
        // u_dotRadius) to the trailing tail point (radius u_tailRadius). Being one
        // swept shape, head and tail can NEVER separate at speed — it only
        // stretches and tapers. Collapses to the head circle when the tail sits on
        // the cursor (still); the guard skips the degenerate near-coincident case
        // (tail within the head) that would NaN the cone.
        float dHead = length(p - u_cursor) - u_dotRadius;
        float dCursor = dHead;
        vec2 tb = u_tail - u_cursor;
        float trr = u_dotRadius - u_tailRadius;
        if (dot(tb, tb) > trr * trr + 1.0) {
          dCursor = sdRoundedCone(p, u_cursor, u_tail, u_dotRadius, u_tailRadius);
        }

        // Merge the teardrop into the box. The bridge stays full while releasing
        // (not tied to the shrinking wrap), so the box melts back into the cursor
        // as one gooey body instead of detaching into a trailing circle. ≈0 when
        // free → the box is just the dot, so this is a no-op there.
        float k = mix(0.001, ${glf(SMIN_K)}, u_bridge);
        float d = smin(dCursor, dBox, k);

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
      tail: gl.getUniformLocation(program, 'u_tail'),
      dotRadius: gl.getUniformLocation(program, 'u_dotRadius'),
      tailRadius: gl.getUniformLocation(program, 'u_tailRadius'),
      box: gl.getUniformLocation(program, 'u_box'),
      corner: gl.getUniformLocation(program, 'u_corner'),
      wrap: gl.getUniformLocation(program, 'u_wrap'),
      bridge: gl.getUniformLocation(program, 'u_bridge'),
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
    // Trailing tail point (chases the cursor, clamped to a short max length).
    let tailX = -9999;
    let tailY = -9999;
    let hasPointer = false;
    let destroyed = false;
    let rafId: number | null = null;

    const cx: Spring = { value: -9999, velocity: 0 };
    const cy: Spring = { value: -9999, velocity: 0 };
    const w: Spring = { value: DOT_SIZE, velocity: 0 };
    const h: Spring = { value: DOT_SIZE, velocity: 0 };
    const grow: Spring = { value: 0, velocity: 0 };

    // Timed-release state: snapshot of the wrap when it lets go, plus the start
    // time, so we can ease it back onto the live cursor over RELEASE_DURATION.
    let relStart: number | null = null;
    let relCX = 0;
    let relCY = 0;
    let relW = 0;
    let relH = 0;
    let relG = 0;

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

      // Tail point chases the cursor, capped to TAIL_MAX behind it. When the
      // cursor is still it converges onto the dot → a plain circle; when moving
      // it lags into a short comet tail opposite the direction of travel.
      if (hasPointer) {
        tailX += (pointerX - tailX) * TAIL_FOLLOW;
        tailY += (pointerY - tailY) * TAIL_FOLLOW;
        const ldx = pointerX - tailX;
        const ldy = pointerY - tailY;
        const ldist = Math.hypot(ldx, ldy);
        if (ldist > TAIL_MAX) {
          tailX = pointerX - (ldx / ldist) * TAIL_MAX;
          tailY = pointerY - (ldy / ldist) * TAIL_MAX;
        }
      }

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

      if (mode === 'free') {
        // Plain snappy dot.
        relStart = null;
        snap(cx, tCX);
        snap(cy, tCY);
        snap(w, tW);
        snap(h, tH);
        snap(grow, tGrow);
      } else if (mode === 'pinned') {
        // Engage: spring in slowly toward the wrapped box (overdamped, no bounce).
        relStart = null;
        stepSpring(cx, tCX, SPRING_STIFFNESS, SPRING_DAMPING);
        stepSpring(cy, tCY, SPRING_STIFFNESS, SPRING_DAMPING);
        stepSpring(w, tW, SPRING_STIFFNESS, SPRING_DAMPING);
        stepSpring(h, tH, SPRING_STIFFNESS, SPRING_DAMPING);
        stepSpring(grow, tGrow, SPRING_STIFFNESS, SPRING_DAMPING);
      } else {
        // Releasing: timed ease back onto the LIVE cursor. Position and size are
        // decoupled — the box RE-CENTERS on the cursor fast (RELEASE_POS_DURATION)
        // so it becomes concentric with the dot almost immediately, then DEFLATES
        // its size onto the cursor over the longer RELEASE_DURATION. That way it
        // reads as one blob shrinking onto the cursor, not a separate bigger circle
        // trailing behind (which is what an offset, slowly-merging box looked like).
        if (relStart === null) {
          relStart = now;
          relCX = cx.value;
          relCY = cy.value;
          relW = w.value;
          relH = h.value;
          relG = grow.value;
        }
        const elapsed = now - relStart;
        const tPos = Math.min(elapsed / RELEASE_POS_DURATION, 1);
        const tSize = Math.min(elapsed / RELEASE_DURATION, 1);
        const ePos = 1 - Math.pow(1 - tPos, 3); // ease-out: snap concentric quickly
        const eSize = 1 - Math.pow(1 - tSize, 3); // ease-out: gentle deflate
        // Once ePos hits 1 this tracks the live cursor exactly (stays concentric).
        cx.value = relCX + (pointerX - relCX) * ePos;
        cy.value = relCY + (pointerY - relCY) * ePos;
        w.value = relW + (DOT_SIZE - relW) * eSize;
        h.value = relH + (DOT_SIZE - relH) * eSize;
        grow.value = relG + (0 - relG) * eSize;
        if (tSize >= 1) mode = 'free';
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
      gl.uniform2f(u.tail, hasPointer ? tailX : -9999, hasPointer ? tailY : -9999);
      gl.uniform1f(u.dotRadius, DOT_SIZE / 2);
      gl.uniform1f(u.tailRadius, TAIL_RADIUS);
      gl.uniform4f(u.box, cx.value, cy.value, w.value / 2, h.value / 2);
      gl.uniform1f(u.corner, MAX_RADIUS);
      gl.uniform1f(u.wrap, grow.value);
      // Keep the dot↔box bridge full through the whole release so it melts in as
      // one body; in free it follows grow (≈0, so the dot stays a plain dot).
      gl.uniform1f(u.bridge, mode === 'releasing' ? 1.0 : grow.value);

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
        tailX = pointerX;
        tailY = pointerY;
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
    // No pointerout release: the wrap lets go via the RELEASE_DISTANCE hysteresis
    // in the render loop, so it can "hold on" past the element edge.

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerover', onPointerOver, true);
    rafId = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerover', onPointerOver, true);
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
