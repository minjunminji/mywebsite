'use client';
import React, { useEffect, useRef } from 'react';

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

    /* ------------------------------------------------------------------ */
    /*  Shader compilation                                                 */
    /* ------------------------------------------------------------------ */

    function createShader(type: number, src: string) {
      const s = gl!.createShader(type);
      if (!s) return null;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        console.error(gl!.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    function createProgramFromSources(vsSrc: string, fsSrc: string) {
      const vs = createShader(gl!.VERTEX_SHADER, vsSrc);
      const fs = createShader(gl!.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;
      const p = gl!.createProgram();
      if (!p) return null;
      gl!.attachShader(p, vs);
      gl!.attachShader(p, fs);
      gl!.linkProgram(p);
      if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
        console.error(gl!.getProgramInfoLog(p));
        return null;
      }
      return p;
    }

    /* ------------------------------------------------------------------ */
    /*  Full-screen quad                                                   */
    /* ------------------------------------------------------------------ */

    const quadVS = `#version 300 es
      in vec2 a_position;
      out vec2 vUv;
      void main() {
        vUv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    function drawQuad(program: WebGLProgram) {
      const loc = gl!.getAttribLocation(program, 'a_position');
      gl!.bindBuffer(gl!.ARRAY_BUFFER, quadBuf);
      gl!.enableVertexAttribArray(loc);
      gl!.vertexAttribPointer(loc, 2, gl!.FLOAT, false, 0, 0);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    /* ------------------------------------------------------------------ */
    /*  Blob mask shader (ping-pong feedback)                              */
    /* ------------------------------------------------------------------ */

    // Sub-segments each frame's brush path is drawn with.
    const PATH_SUBDIV = 12;

    const blobFS = `#version 300 es
      #define PATH_SUBDIV ${PATH_SUBDIV}
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D u_prev;
      // This frame's brush path: a curve sampled into PATH_SUBDIV segments,
      // with the brush radius at each sample.
      uniform vec2 u_path[PATH_SUBDIV + 1];
      uniform float u_pathRadius[PATH_SUBDIV + 1];
      uniform float u_pointerDown;
      uniform float u_strength;
      uniform float u_dTime;
      uniform float u_duration;
      uniform float u_aspect;
      uniform float u_dwell;

      void main() {
        float prev = texture(u_prev, vUv).r;

        // Decay
        prev -= clamp(u_dTime / u_duration, 0.0, 0.1);
        prev = clamp(prev, 0.0, 1.0);

        // Paint the stroke along this frame's curved brush path, so there
        // are no gaps when the cursor moves a long way between frames and no
        // corners where one frame's stroke meets the next.
        if (u_pointerDown > 0.5) {
          vec2 aspectScale = vec2(u_aspect, 1.0);
          vec2 uv = (vUv - 0.5) * 2.0 * aspectScale;
          float f = 0.0;
          for (int i = 0; i < PATH_SUBDIV; i++) {
            vec2 a = u_path[i] * aspectScale;
            vec2 b = u_path[i + 1] * aspectScale;
            vec2 segment = b - a;
            float segmentLenSq = max(dot(segment, segment), 1e-10);
            float t = clamp(dot(uv - a, segment) / segmentLenSq, 0.0, 1.0);
            float d = distance(uv, a + segment * t);
            float r = mix(u_pathRadius[i], u_pathRadius[i + 1], t);
            f = max(f, 1.0 - smoothstep(r * 0.1, r, d));
          }
          // One pass fully reveals the brush footprint. Max (not add) so the
          // overlapping caps between consecutive frame segments don't stack:
          // stacked joints outlive the segment middles and a fading fast
          // trail breaks apart into a row of dots.
          prev = max(prev, f);
          // Extra build-up only while the cursor dwells (slow/resting), so
          // hovering still spreads the reveal outward. Strength is tuned per
          // 60Hz frame; scale by dt so it's refresh-rate independent.
          prev += f * u_strength * u_dTime * 60.0 * u_dwell;
          prev = clamp(prev, 0.0, 1.0);
        }

        fragColor = vec4(prev, 0.0, 0.0, 1.0);
      }
    `;

    const blobProgram = createProgramFromSources(quadVS, blobFS);
    if (!blobProgram) return;

    const blobUniforms = {
      u_prev: gl.getUniformLocation(blobProgram, 'u_prev'),
      u_path: gl.getUniformLocation(blobProgram, 'u_path'),
      u_pathRadius: gl.getUniformLocation(blobProgram, 'u_pathRadius'),
      u_pointerDown: gl.getUniformLocation(blobProgram, 'u_pointerDown'),
      u_strength: gl.getUniformLocation(blobProgram, 'u_strength'),
      u_dTime: gl.getUniformLocation(blobProgram, 'u_dTime'),
      u_duration: gl.getUniformLocation(blobProgram, 'u_duration'),
      u_aspect: gl.getUniformLocation(blobProgram, 'u_aspect'),
      u_dwell: gl.getUniformLocation(blobProgram, 'u_dwell'),
    };

    /* ------------------------------------------------------------------ */
    /*  Display shader (reveal reference through mask)                     */
    /* ------------------------------------------------------------------ */

    const displayFS = `#version 300 es
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D u_mask;
      uniform sampler2D u_refImage;
      uniform float u_refLoaded;
      uniform float u_canvasAspect;
      uniform float u_refAspect;
      uniform float u_time;

      // Mask value where the reveal edge sits, and how far the noise pushes
      // that edge in/out. th - amp/2 must stay > 0 so empty mask stays hidden.
      const float EDGE_THRESHOLD = 0.15;
      const float EDGE_NOISE_AMP = 0.14;
      // Edge antialias width, in multiples of a screen pixel's mask change.
      const float EDGE_SOFTNESS = 1.5;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          sum += amp * valueNoise(p);
          p = p * 2.03 + vec2(17.1, 9.2);
          amp *= 0.5;
        }
        return sum / 0.9375;
      }

      void main() {
        float mask = texture(u_mask, vUv).r;

        // Page-anchored noise (aspect-corrected so blotches aren't stretched)
        // wobbles the edge like ink bleeding into paper. It drifts slowly
        // rather than following the cursor.
        vec2 noiseUv = vUv * vec2(u_canvasAspect, 1.0) * 6.0;
        float n = fbm(noiseUv + vec2(u_time * 0.04, -u_time * 0.03));
        float field = mask + (n - 0.5) * EDGE_NOISE_AMP;

        // Screen-space AA: a constant ~1.5px edge regardless of how steep the
        // mask is at that point (fading blobs, overlapping strokes, etc).
        float w = max(fwidth(field) * EDGE_SOFTNESS, 1e-4);
        float edge = smoothstep(EDGE_THRESHOLD - w, EDGE_THRESHOLD + w, field);
        vec2 fitUv = vUv;
        if (u_canvasAspect > u_refAspect) {
          float fitWidth = u_refAspect / u_canvasAspect;
          float marginX = (1.0 - fitWidth) * 0.5;
          fitUv.x = (vUv.x - marginX) / fitWidth;
        } else {
          float fitHeight = u_canvasAspect / u_refAspect;
          float marginY = (1.0 - fitHeight) * 0.5;
          fitUv.y = (vUv.y - marginY) / fitHeight;
        }

        float inBounds =
          step(0.0, fitUv.x) *
          step(fitUv.x, 1.0) *
          step(0.0, fitUv.y) *
          step(fitUv.y, 1.0);

        float reveal = edge * inBounds * u_refLoaded;

        // Flip Y for image (WebGL UV origin is bottom-left, image is top-left)
        vec2 refUv = vec2(clamp(fitUv.x, 0.0, 1.0), 1.0 - clamp(fitUv.y, 0.0, 1.0));
        vec4 ref = texture(u_refImage, refUv);

        // Composite ref image over page background so transparent ref pixels
        // still occlude the drawing underneath this canvas.
        // Ref texture is uploaded premultiplied to avoid white fringes on
        // transparent gradients.
        vec3 bg = vec3(0.969, 0.969, 0.961); // #f7f7f5
        vec3 refOverBg = ref.rgb + bg * (1.0 - ref.a);
        // Alpha follows the same ramp as the reveal so the blob edge
        // cross-fades straight into the drawing underneath. (A binary alpha
        // here painted a ring of flat bg wherever the mask was above the
        // alpha cutoff but below the reveal ramp.)
        fragColor = vec4(refOverBg * reveal, reveal);
      }
    `;

    const displayProgram = createProgramFromSources(quadVS, displayFS);
    if (!displayProgram) return;

    const displayUniforms = {
      u_mask: gl.getUniformLocation(displayProgram, 'u_mask'),
      u_refImage: gl.getUniformLocation(displayProgram, 'u_refImage'),
      u_refLoaded: gl.getUniformLocation(displayProgram, 'u_refLoaded'),
      u_canvasAspect: gl.getUniformLocation(displayProgram, 'u_canvasAspect'),
      u_refAspect: gl.getUniformLocation(displayProgram, 'u_refAspect'),
      u_time: gl.getUniformLocation(displayProgram, 'u_time'),
    };

    /* ------------------------------------------------------------------ */
    /*  Framebuffer ping-pong (stores the mask)                            */
    /* ------------------------------------------------------------------ */

    // Store the mask as half-float when we can render to it. With RGBA8 each
    // value is rounded to 1/255 per frame, so the per-frame decay rounds to
    // zero on high-refresh displays (the blob never fades on 240Hz) and the
    // reveal edge bands. R16F is filterable in core WebGL2.
    const floatMask = !!gl.getExtension('EXT_color_buffer_float');

    // The mask is a smooth field, so it looks the same at half resolution
    // (bilinear upsampling) and costs a quarter of the fill rate.
    const MASK_SCALE = 0.5;

    function createFBO(w: number, h: number) {
      const tex = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, tex);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      if (floatMask) {
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.R16F, w, h, 0, gl!.RED, gl!.HALF_FLOAT, null);
      } else {
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
      }
      const fbo = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
      return { tex, fbo, w, h };
    }

    let fbW = Math.max(1, Math.floor((canvas.width || 512) * MASK_SCALE));
    let fbH = Math.max(1, Math.floor((canvas.height || 512) * MASK_SCALE));
    let fbA = createFBO(fbW, fbH);
    let fbB = createFBO(fbW, fbH);

    function resizeFBOs(w: number, h: number) {
      if (w === fbW && h === fbH) return;
      gl!.deleteTexture(fbA.tex);
      gl!.deleteFramebuffer(fbA.fbo);
      gl!.deleteTexture(fbB.tex);
      gl!.deleteFramebuffer(fbB.fbo);
      fbW = w;
      fbH = h;
      fbA = createFBO(w, h);
      fbB = createFBO(w, h);
    }

    /* ------------------------------------------------------------------ */
    /*  Reference image texture                                            */
    /* ------------------------------------------------------------------ */

    let refTexture: WebGLTexture | null = null;
    let refImageLoaded = false;
    let refAspect = 1;

    const refImg = new Image();
    refImg.crossOrigin = 'anonymous';
    refImg.onload = () => {
      if (destroyed) return;
      refAspect = refImg.height > 0 ? refImg.width / refImg.height : 1;
      refTexture = gl!.createTexture();
      gl!.bindTexture(gl!.TEXTURE_2D, refTexture);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, refImg);
      gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      refImageLoaded = true;
    };
    refImg.src = referenceImage;

    /* ------------------------------------------------------------------ */
    /*  Pointer state                                                      */
    /* ------------------------------------------------------------------ */

    let pointerX = 10;
    let pointerY = 10;
    let pointerActive = false;

    // The brush chases the raw pointer with a little lag, so the painted
    // path is a smooth curve instead of straight per-frame segments.
    let paintX = 10;
    let paintY = 10;
    let lastPaintX = 10;
    let lastPaintY = 10;
    let hasPaint = false;
    let brushRadius = pointerRadius;
    let lastBrushRadius = pointerRadius;
    // Direction the previous frame's curve ended with (UV units per frame).
    // Each new segment starts with it, so segments join without corners.
    let tangentX = 0;
    let tangentY = 0;
    const pathPoints = new Float32Array((PATH_SUBDIV + 1) * 2);
    const pathRadii = new Float32Array(PATH_SUBDIV + 1);

    function getCanvasUV(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      return { x, y };
    }

    function onPointerMove(e: MouseEvent | PointerEvent) {
      const uv = getCanvasUV(e.clientX, e.clientY);
      pointerX = uv.x;
      pointerY = uv.y;
      pointerActive = true;
    }

    function onPointerLeave() {
      pointerX = 10;
      pointerY = 10;
      pointerActive = false;
      hasPaint = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length > 0) {
        const uv = getCanvasUV(e.touches[0].clientX, e.touches[0].clientY);
        pointerX = uv.x;
        pointerY = uv.y;
        pointerActive = true;
      }
    }

    function onTouchEnd() {
      pointerActive = false;
      hasPaint = false;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('touchmove', onTouchMove, { passive: true } as AddEventListenerOptions);
    window.addEventListener('touchend', onTouchEnd);

    /* ------------------------------------------------------------------ */
    /*  Animation loop                                                     */
    /* ------------------------------------------------------------------ */

    let lastTime = performance.now();
    const startTime = lastTime;

    // Brush follow rate (1/s): higher = tighter to the cursor, lower = more lag.
    const POINTER_FOLLOW = 25;
    // Brush shrinks toward this fraction of pointerRadius at high speed and
    // swells back when the cursor slows or rests.
    const FAST_RADIUS_SCALE = 0.7;
    const SLOW_SPEED = 0.5; // aspect-corrected UV units per second
    const FAST_SPEED = 5.0;
    const RADIUS_FOLLOW = 8;

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
        resizeFBOs(
          Math.max(1, Math.floor(cw * MASK_SCALE)),
          Math.max(1, Math.floor(ch * MASK_SCALE)),
        );
      }

      const aspect = canvas!.width / canvas!.height;

      // --- Pass 1: update blob mask (render to fbB, reading fbA) ---
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbB.fbo);
      gl!.viewport(0, 0, fbW, fbH);
      gl!.useProgram(blobProgram!);

      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, fbA.tex);
      gl!.uniform1i(blobUniforms.u_prev, 0);

      let speedT = 0;
      if (pointerActive) {
        if (!hasPaint) {
          // Fresh stroke: start the brush on the cursor rather than
          // sweeping in from wherever it last was.
          paintX = lastPaintX = pointerX;
          paintY = lastPaintY = pointerY;
          brushRadius = lastBrushRadius = pointerRadius;
          tangentX = tangentY = 0;
          hasPaint = true;
        } else {
          lastBrushRadius = brushRadius;
          lastPaintX = paintX;
          lastPaintY = paintY;
          const k = 1 - Math.exp(-dt * POINTER_FOLLOW);
          paintX += (pointerX - paintX) * k;
          paintY += (pointerY - paintY) * k;
        }

        const speed =
          Math.hypot((paintX - lastPaintX) * aspect, paintY - lastPaintY) / Math.max(dt, 1e-3);
        const t = Math.min(Math.max((speed - SLOW_SPEED) / (FAST_SPEED - SLOW_SPEED), 0), 1);
        speedT = t * t * (3 - 2 * t);
        const targetRadius = pointerRadius * (1 - (1 - FAST_RADIUS_SCALE) * speedT);
        brushRadius += (targetRadius - brushRadius) * (1 - Math.exp(-dt * RADIUS_FOLLOW));
      } else {
        hasPaint = false;
      }

      // Cubic Hermite from last brush position to the current one. It starts
      // along the previous segment's end tangent and ends along this frame's
      // chord, which becomes the next segment's start tangent (C1 joins, no
      // lookahead so no added latency).
      const endTangentX = paintX - lastPaintX;
      const endTangentY = paintY - lastPaintY;
      for (let i = 0; i <= PATH_SUBDIV; i++) {
        const u = i / PATH_SUBDIV;
        const u2 = u * u;
        const u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1;
        const h10 = u3 - 2 * u2 + u;
        const h01 = -2 * u3 + 3 * u2;
        const h11 = u3 - u2;
        pathPoints[i * 2] = h00 * lastPaintX + h10 * tangentX + h01 * paintX + h11 * endTangentX;
        pathPoints[i * 2 + 1] = h00 * lastPaintY + h10 * tangentY + h01 * paintY + h11 * endTangentY;
        pathRadii[i] = lastBrushRadius + (brushRadius - lastBrushRadius) * u;
      }
      tangentX = endTangentX;
      tangentY = endTangentY;

      gl!.uniform2fv(blobUniforms.u_path, pathPoints);
      gl!.uniform1fv(blobUniforms.u_pathRadius, pathRadii);
      gl!.uniform1f(blobUniforms.u_pointerDown, hasPaint ? 1.0 : 0.0);
      gl!.uniform1f(blobUniforms.u_strength, blobStrength);
      gl!.uniform1f(blobUniforms.u_dTime, dt);
      gl!.uniform1f(blobUniforms.u_duration, fadeDuration);
      gl!.uniform1f(blobUniforms.u_aspect, aspect);
      gl!.uniform1f(blobUniforms.u_dwell, 1 - speedT);

      drawQuad(blobProgram!);

      // Swap
      const tmp = fbA;
      fbA = fbB;
      fbB = tmp;

      // --- Pass 2: composite (render to screen) ---
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);

      gl!.useProgram(displayProgram!);

      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, fbA.tex);
      gl!.uniform1i(displayUniforms.u_mask, 0);

      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, refTexture);
      gl!.uniform1i(displayUniforms.u_refImage, 1);

      gl!.uniform1f(displayUniforms.u_refLoaded, refImageLoaded ? 1.0 : 0.0);
      gl!.uniform1f(displayUniforms.u_canvasAspect, aspect);
      gl!.uniform1f(displayUniforms.u_refAspect, refAspect);
      gl!.uniform1f(
        displayUniforms.u_time,
        reducedMotionMq.matches ? 0 : (now - startTime) / 1000,
      );

      drawQuad(displayProgram!);

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
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
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
