import { PATH_SUBDIV } from './brush';

/** Display-shader edge parameters. The live site always uses DEFAULT_EDGE. */
export type EdgeParams = {
  /** Mask value where the reveal edge sits. */
  threshold: number;
  /** How far the noise pushes that edge in/out. threshold - amp/2 must stay > 0. */
  noiseAmp: number;
  /** fbm octaves, 0..4 (0 = no noise). */
  octaves: number;
  /** Edge antialias width in multiples of a screen pixel's field change. */
  softness: number;
};

export const DEFAULT_EDGE: EdgeParams = { threshold: 0.15, noiseAmp: 0.14, octaves: 4, softness: 1.5 };

/** Display shader output: 0 = composite, 1 = raw mask, 2 = mask + noise field. */
export type RevealView = 0 | 1 | 2;

/** The explainer's accent (#c8412b) as linear-ish 0..1 RGB for u_accent. */
export const ACCENT_RGB: readonly [number, number, number] = [0.784, 0.255, 0.169];

export const QUAD_VS = `#version 300 es
  in vec2 a_position;
  out vec2 vUv;
  void main() {
    vUv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Blob mask shader (ping-pong feedback).
export const BLOB_FS = `#version 300 es
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
    // #region decay
    float prev = texture(u_prev, vUv).r;
    prev -= clamp(u_dTime / u_duration, 0.0, 0.1);
    prev = clamp(prev, 0.0, 1.0);
    // #endregion

    // Paint the stroke along this frame's curved brush path, so there
    // are no gaps when the cursor moves a long way between frames and no
    // corners where one frame's stroke meets the next.
    if (u_pointerDown > 0.5) {
      // #region stroke
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
      // #endregion
      // #region dwell
      // Extra build-up only while the cursor dwells (slow/resting), so
      // hovering still spreads the reveal outward. Strength is tuned per
      // 60Hz frame; scale by dt so it's refresh-rate independent.
      prev += f * u_strength * u_dTime * 60.0 * u_dwell;
      prev = clamp(prev, 0.0, 1.0);
      // #endregion
    }

    fragColor = vec4(prev, 0.0, 0.0, 1.0);
  }
`;

// Display shader (reveal reference through mask).
export const DISPLAY_FS = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;

  uniform sampler2D u_mask;
  uniform sampler2D u_refImage;
  uniform float u_refLoaded;
  uniform float u_canvasAspect;
  uniform float u_refAspect;
  // Sub-rect of the reference image to fit to the canvas: x, y (from the
  // image's top-left), w, h, in 0..1 image UVs. (0, 0, 1, 1) is the whole image.
  uniform vec4 u_refCrop;
  uniform float u_time;
  // Edge parameters (see EdgeParams) and explainer debug views.
  uniform float u_threshold;
  uniform float u_noiseAmp;
  uniform float u_edgeSoftness;
  uniform int u_octaves;
  uniform int u_view;
  uniform vec3 u_accent;

  const vec3 PAPER = vec3(0.969, 0.969, 0.961); // #f7f7f5
  const vec3 INK = vec3(0.122, 0.094, 0.071);   // #1f1812

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // #region fbm
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

  float fbm(vec2 p, int octaves) {
    if (octaves <= 0) return 0.5;
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      sum += amp * valueNoise(p);
      norm += amp;
      p = p * 2.03 + vec2(17.1, 9.2);
      amp *= 0.5;
    }
    return sum / norm;
  }
  // #endregion

  void main() {
    float mask = texture(u_mask, vUv).r;

    // #region edge
    // Page-anchored noise (aspect-corrected so blotches aren't stretched)
    // wobbles the edge like ink bleeding into paper. It drifts slowly
    // rather than following the cursor.
    vec2 noiseUv = vUv * vec2(u_canvasAspect, 1.0) * 6.0;
    float n = fbm(noiseUv + vec2(u_time * 0.04, -u_time * 0.03), u_octaves);
    float field = mask + (n - 0.5) * u_noiseAmp;

    // Screen-space AA: a constant ~1.5px edge regardless of how steep the
    // field is at that point (fading blobs, overlapping strokes, etc).
    float fw = fwidth(field);
    float w = max(fw * u_edgeSoftness, 1e-4);
    float edge = smoothstep(u_threshold - w, u_threshold + w, field);
    // #endregion

    if (u_view == 1) {
      fragColor = vec4(mix(PAPER, u_accent, mask), 1.0);
      return;
    }
    if (u_view == 2) {
      float contour = 1.0 - smoothstep(0.0, 1.5 * fw + 1e-4, abs(field - u_threshold));
      vec3 c = mix(PAPER, INK, clamp(field, 0.0, 1.0) * 0.85);
      fragColor = vec4(mix(c, u_accent, contour), 1.0);
      return;
    }

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
    vec2 cropUv = u_refCrop.xy + vec2(fitUv.x, 1.0 - fitUv.y) * u_refCrop.zw;
    vec2 refUv = clamp(cropUv, 0.0, 1.0);
    vec4 ref = texture(u_refImage, refUv);

    // Composite ref image over page background so transparent ref pixels
    // still occlude the drawing underneath this canvas.
    // Ref texture is uploaded premultiplied to avoid white fringes on
    // transparent gradients.
    vec3 refOverBg = ref.rgb + PAPER * (1.0 - ref.a);
    // Alpha follows the same ramp as the reveal so the blob edge
    // cross-fades straight into the drawing underneath. (A binary alpha
    // here painted a ring of flat bg wherever the mask was above the
    // alpha cutoff but below the reveal ramp.)
    fragColor = vec4(refOverBg * reveal, reveal);
  }
`;

/** Every [shader, region] pair the explainer quotes. Tested to exist. */
export const GLSL_REGIONS = [
  ['blob', 'decay'],
  ['blob', 'stroke'],
  ['blob', 'dwell'],
  ['display', 'fbm'],
  ['display', 'edge'],
] as const;

/** The dedented lines between `// #region name` and the next `// #endregion`. */
export function glslExcerpt(src: string, name: string): string {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.trim() === `// #region ${name}`);
  if (start < 0) throw new Error(`glsl region not found: ${name}`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === '// #endregion');
  if (end < 0) throw new Error(`glsl region not closed: ${name}`);
  const body = lines.slice(start + 1, end);
  const indent = Math.min(
    ...body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length),
  );
  return body.map((l) => l.slice(indent)).join('\n').trim();
}
