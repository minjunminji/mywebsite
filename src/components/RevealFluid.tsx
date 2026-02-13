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

    const blobFS = `#version 300 es
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D u_prev;
      uniform vec2 u_pointer;
      uniform float u_pointerDown;
      uniform float u_radius;
      uniform float u_strength;
      uniform float u_dTime;
      uniform float u_duration;
      uniform float u_aspect;

      void main() {
        float prev = texture(u_prev, vUv).r;

        // Decay
        prev -= clamp(u_dTime / u_duration, 0.0, 0.1);
        prev = clamp(prev, 0.0, 1.0);

        // Add blob at pointer
        if (u_pointerDown > 0.5) {
          vec2 uv = (vUv - 0.5) * 2.0 * vec2(u_aspect, 1.0);
          vec2 mouse = u_pointer * vec2(u_aspect, 1.0);
          float d = distance(uv, mouse);
          float f = 1.0 - smoothstep(u_radius * 0.1, u_radius, d);
          prev += f * u_strength;
          prev = clamp(prev, 0.0, 1.0);
        }

        fragColor = vec4(prev, 0.0, 0.0, 1.0);
      }
    `;

    const blobProgram = createProgramFromSources(quadVS, blobFS);
    if (!blobProgram) return;

    const blobUniforms = {
      u_prev: gl.getUniformLocation(blobProgram, 'u_prev'),
      u_pointer: gl.getUniformLocation(blobProgram, 'u_pointer'),
      u_pointerDown: gl.getUniformLocation(blobProgram, 'u_pointerDown'),
      u_radius: gl.getUniformLocation(blobProgram, 'u_radius'),
      u_strength: gl.getUniformLocation(blobProgram, 'u_strength'),
      u_dTime: gl.getUniformLocation(blobProgram, 'u_dTime'),
      u_duration: gl.getUniformLocation(blobProgram, 'u_duration'),
      u_aspect: gl.getUniformLocation(blobProgram, 'u_aspect'),
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

      void main() {
        float rawMask = texture(u_mask, vUv).r;
        vec2 texel = 1.0 / vec2(textureSize(u_mask, 0));

        // Expand the occlusion mask by ~1px so the drawing below cannot peek
        // through at antialiased/resampled blob edges.
        float occlusionMask = rawMask;
        occlusionMask = max(occlusionMask, texture(u_mask, vUv + vec2(texel.x, 0.0)).r);
        occlusionMask = max(occlusionMask, texture(u_mask, vUv - vec2(texel.x, 0.0)).r);
        occlusionMask = max(occlusionMask, texture(u_mask, vUv + vec2(0.0, texel.y)).r);
        occlusionMask = max(occlusionMask, texture(u_mask, vUv - vec2(0.0, texel.y)).r);
        occlusionMask = max(occlusionMask, texture(u_mask, vUv + vec2(texel.x, texel.y)).r);
        occlusionMask = max(occlusionMask, texture(u_mask, vUv + vec2(texel.x, -texel.y)).r);
        occlusionMask = max(occlusionMask, texture(u_mask, vUv + vec2(-texel.x, texel.y)).r);
        occlusionMask = max(occlusionMask, texture(u_mask, vUv - vec2(texel.x, texel.y)).r);
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

        float reveal = smoothstep(0.01, 0.04, occlusionMask) * inBounds;

        // Flip Y for image (WebGL UV origin is bottom-left, image is top-left)
        vec2 refUv = vec2(clamp(fitUv.x, 0.0, 1.0), 1.0 - clamp(fitUv.y, 0.0, 1.0));
        vec4 ref = texture(u_refImage, refUv);

        // Composite ref image over page background so transparent ref pixels
        // still occlude the drawing underneath this canvas.
        // Ref texture is uploaded premultiplied to avoid white fringes on
        // transparent gradients.
        vec3 bg = vec3(0.965, 0.949, 0.918); // #f6f2ea
        vec3 refOverBg = ref.rgb + bg * (1.0 - ref.a);
        vec3 color = mix(bg, refOverBg, reveal);

        // Use binary alpha for occlusion. This avoids semi-transparent blob
        // edges that allow the underlying drawing layer to bleed through.
        float a = step(0.01, occlusionMask) * u_refLoaded * inBounds;
        fragColor = vec4(color * a, a);
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
    };

    /* ------------------------------------------------------------------ */
    /*  Framebuffer ping-pong (stores the mask)                            */
    /* ------------------------------------------------------------------ */

    function createFBO(w: number, h: number) {
      const tex = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, tex);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
      const fbo = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
      return { tex, fbo, w, h };
    }

    let fbW = canvas.width || 512;
    let fbH = canvas.height || 512;
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
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('touchmove', onTouchMove, { passive: true } as AddEventListenerOptions);
    window.addEventListener('touchend', onTouchEnd);

    /* ------------------------------------------------------------------ */
    /*  Animation loop                                                     */
    /* ------------------------------------------------------------------ */

    let lastTime = performance.now();

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
        resizeFBOs(cw, ch);
      }

      const aspect = canvas!.width / canvas!.height;

      // --- Pass 1: update blob mask (render to fbB, reading fbA) ---
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbB.fbo);
      gl!.viewport(0, 0, fbW, fbH);
      gl!.useProgram(blobProgram!);

      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, fbA.tex);
      gl!.uniform1i(blobUniforms.u_prev, 0);

      gl!.uniform2f(blobUniforms.u_pointer, pointerX, pointerY);
      gl!.uniform1f(blobUniforms.u_pointerDown, pointerActive ? 1.0 : 0.0);
      gl!.uniform1f(blobUniforms.u_radius, pointerRadius);
      gl!.uniform1f(blobUniforms.u_strength, blobStrength);
      gl!.uniform1f(blobUniforms.u_dTime, dt);
      gl!.uniform1f(blobUniforms.u_duration, fadeDuration);
      gl!.uniform1f(blobUniforms.u_aspect, aspect);

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
