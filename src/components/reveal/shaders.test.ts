import { describe, expect, it } from 'vitest';
import { BLOB_FS, DEFAULT_EDGE, DISPLAY_FS, GLSL_REGIONS, glslExcerpt } from './shaders';

describe('glslExcerpt', () => {
  it('returns the dedented body of a region without marker lines', () => {
    const src = 'a\n  // #region x\n    foo();\n      bar();\n  // #endregion\nb';
    expect(glslExcerpt(src, 'x')).toBe('foo();\n  bar();');
  });

  it('throws on a missing region', () => {
    expect(() => glslExcerpt('nothing here', 'x')).toThrow(/x/);
  });

  it('finds every region the explainer quotes', () => {
    for (const [shader, name] of GLSL_REGIONS) {
      const src = shader === 'blob' ? BLOB_FS : DISPLAY_FS;
      const body = glslExcerpt(src, name);
      expect(body.length).toBeGreaterThan(0);
      expect(body).not.toMatch(/#region|#endregion/);
    }
  });
});

describe('DEFAULT_EDGE', () => {
  it('keeps an empty mask hidden (threshold - amp/2 > 0)', () => {
    expect(DEFAULT_EDGE.threshold - DEFAULT_EDGE.noiseAmp / 2).toBeGreaterThan(0);
  });

  it('matches the pre-extraction constants', () => {
    expect(DEFAULT_EDGE).toEqual({ threshold: 0.15, noiseAmp: 0.14, octaves: 4, softness: 1.5 });
  });
});
