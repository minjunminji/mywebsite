import { type Brush } from './brush';
import {
  ACCENT_RGB,
  BLOB_FS,
  DISPLAY_FS,
  QUAD_VS,
  type EdgeParams,
  type RevealView,
} from './shaders';

// The mask is a smooth field, so it looks the same at half resolution
// (bilinear upsampling) and costs a quarter of the fill rate.
const MASK_SCALE = 0.5;

export type PaintParams = {
  dt: number;
  /** Seconds a fully revealed pixel takes to fade. */
  fadeDuration: number;
  /** Dwell build-up per 60Hz frame. */
  strength: number;
  /** Aspect ratio (w/h) of the area the mask covers. */
  aspect: number;
};

export type DrawParams = {
  /** Device-pixel rect on the default framebuffer: x, y (from bottom), w, h. */
  viewport: readonly [number, number, number, number];
  aspect: number;
  time: number;
  view: RevealView;
  edge: EdgeParams;
  accent?: readonly [number, number, number];
  /** Part of the reference image to show: x, y (from top-left), w, h in 0..1. Whole image by default. */
  crop?: readonly [number, number, number, number];
};

export type RevealRenderer = {
  /** Size the mask for a drawing area of w×h device pixels (no-op if unchanged). */
  resize(w: number, h: number): void;
  /** Pass 1: decay the mask and paint this frame's brush path into it. */
  paint(brush: Brush, painting: boolean, p: PaintParams): void;
  /** Clear the whole default framebuffer to transparent. */
  clear(): void;
  /** Pass 2: composite (or a debug view) into a viewport of the canvas. */
  draw(p: DrawParams): void;
  setReference(img: HTMLImageElement): void;
  dispose(): void;
};

const FULL_CROP = [0, 0, 1, 1] as const;

export function createRevealRenderer(gl: WebGL2RenderingContext): RevealRenderer | null {
  function createShader(type: number, src: string) {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function createProgram(vsSrc: string, fsSrc: string) {
    const vs = createShader(gl.VERTEX_SHADER, vsSrc);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  const blobProgram = createProgram(QUAD_VS, BLOB_FS);
  const displayProgram = createProgram(QUAD_VS, DISPLAY_FS);
  if (!blobProgram || !displayProgram) return null;

  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  function drawQuad(program: WebGLProgram) {
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const blobU = {
    prev: u(blobProgram, 'u_prev'),
    path: u(blobProgram, 'u_path'),
    pathRadius: u(blobProgram, 'u_pathRadius'),
    pointerDown: u(blobProgram, 'u_pointerDown'),
    strength: u(blobProgram, 'u_strength'),
    dTime: u(blobProgram, 'u_dTime'),
    duration: u(blobProgram, 'u_duration'),
    aspect: u(blobProgram, 'u_aspect'),
    dwell: u(blobProgram, 'u_dwell'),
  };
  const displayU = {
    mask: u(displayProgram, 'u_mask'),
    refImage: u(displayProgram, 'u_refImage'),
    refLoaded: u(displayProgram, 'u_refLoaded'),
    canvasAspect: u(displayProgram, 'u_canvasAspect'),
    refAspect: u(displayProgram, 'u_refAspect'),
    refCrop: u(displayProgram, 'u_refCrop'),
    time: u(displayProgram, 'u_time'),
    threshold: u(displayProgram, 'u_threshold'),
    noiseAmp: u(displayProgram, 'u_noiseAmp'),
    edgeSoftness: u(displayProgram, 'u_edgeSoftness'),
    octaves: u(displayProgram, 'u_octaves'),
    view: u(displayProgram, 'u_view'),
    accent: u(displayProgram, 'u_accent'),
  };

  // Store the mask as half-float when we can render to it. With RGBA8 each
  // value is rounded to 1/255 per frame, so the per-frame decay rounds to
  // zero on high-refresh displays (the blob never fades on 240Hz) and the
  // reveal edge bands. R16F is filterable in core WebGL2.
  const floatMask = !!gl.getExtension('EXT_color_buffer_float');

  function createFBO(w: number, h: number) {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (floatMask) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }

  function deleteFBO(f: { tex: WebGLTexture; fbo: WebGLFramebuffer }) {
    gl.deleteTexture(f.tex);
    gl.deleteFramebuffer(f.fbo);
  }

  let fbW = 1;
  let fbH = 1;
  let fbA = createFBO(fbW, fbH);
  let fbB = createFBO(fbW, fbH);

  let refTexture: WebGLTexture | null = null;
  let refAspect = 1;

  return {
    resize(w, h) {
      const mw = Math.max(1, Math.floor(w * MASK_SCALE));
      const mh = Math.max(1, Math.floor(h * MASK_SCALE));
      if (mw === fbW && mh === fbH) return;
      deleteFBO(fbA);
      deleteFBO(fbB);
      fbW = mw;
      fbH = mh;
      fbA = createFBO(mw, mh);
      fbB = createFBO(mw, mh);
    },

    paint(brush, painting, p) {
      // Render to fbB, reading fbA, then swap.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbB.fbo);
      gl.viewport(0, 0, fbW, fbH);
      gl.useProgram(blobProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbA.tex);
      gl.uniform1i(blobU.prev, 0);
      gl.uniform2fv(blobU.path, brush.path);
      gl.uniform1fv(blobU.pathRadius, brush.radii);
      gl.uniform1f(blobU.pointerDown, painting ? 1.0 : 0.0);
      gl.uniform1f(blobU.strength, p.strength);
      gl.uniform1f(blobU.dTime, p.dt);
      gl.uniform1f(blobU.duration, p.fadeDuration);
      gl.uniform1f(blobU.aspect, p.aspect);
      gl.uniform1f(blobU.dwell, 1 - brush.speedT);
      drawQuad(blobProgram);
      const tmp = fbA;
      fbA = fbB;
      fbB = tmp;
    },

    clear() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    draw(p) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(p.viewport[0], p.viewport[1], p.viewport[2], p.viewport[3]);
      gl.useProgram(displayProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbA.tex);
      gl.uniform1i(displayU.mask, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, refTexture);
      gl.uniform1i(displayU.refImage, 1);
      gl.uniform1f(displayU.refLoaded, refTexture ? 1.0 : 0.0);
      gl.uniform1f(displayU.canvasAspect, p.aspect);
      const crop = p.crop ?? FULL_CROP;
      // The fit is against the cropped region's shape, not the whole image's.
      gl.uniform1f(displayU.refAspect, (refAspect * crop[2]) / crop[3]);
      gl.uniform4f(displayU.refCrop, crop[0], crop[1], crop[2], crop[3]);
      gl.uniform1f(displayU.time, p.time);
      gl.uniform1f(displayU.threshold, p.edge.threshold);
      gl.uniform1f(displayU.noiseAmp, p.edge.noiseAmp);
      gl.uniform1f(displayU.edgeSoftness, p.edge.softness);
      gl.uniform1i(displayU.octaves, p.edge.octaves);
      gl.uniform1i(displayU.view, p.view);
      const a = p.accent ?? ACCENT_RGB;
      gl.uniform3f(displayU.accent, a[0], a[1], a[2]);
      drawQuad(displayProgram);
    },

    setReference(img) {
      refAspect = img.height > 0 ? img.width / img.height : 1;
      if (refTexture) gl.deleteTexture(refTexture);
      refTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, refTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    },

    dispose() {
      deleteFBO(fbA);
      deleteFBO(fbB);
      if (refTexture) gl.deleteTexture(refTexture);
      gl.deleteBuffer(quadBuf);
      gl.deleteProgram(blobProgram);
      gl.deleteProgram(displayProgram);
    },
  };
}
