// src/theme.ts
// Site palette: white ink on blueprint blue. Keep in sync with the :root
// custom properties in app/globals.css and the GLSL PAPER in reveal/shaders.ts.
export const PAPER = '#0041ba';
export const PAPER_RGB: readonly [number, number, number] = [0, 65, 186];
export const INK = '#ffffff';
export const INK_RGB: readonly [number, number, number] = [255, 255, 255];
/** Secondary text (captions, tech stacks): ink knocked back toward the paper. */
export const INK_SOFT = 'rgba(255, 255, 255, 0.78)';

/** The ink at the given alpha, for faint rules, inactive dots, etc. */
export const inkAlpha = (a: number) => `rgba(255, 255, 255, ${a})`;
/** The paper at the given alpha, for fades into the page. */
export const paperAlpha = (a: number) => `rgba(0, 65, 186, ${a})`;
