// src/components/explainer/tokens.ts
// Shared look for the shader explainer: the site's ink-on-paper, one accent.
export const INK = '#1f1812';
export const PAPER = '#f7f7f5';
export const MUTED = '#6f655a';
export const RULE = 'rgba(31, 24, 18, 0.12)';
export const FAINT = 'rgba(31, 24, 18, 0.35)';
/** The one accent: "the thing under discussion" in every figure. */
export const ACCENT = '#c8412b';

/** ACCENT / INK as 0..255 RGB triples, for canvas fillStyle alpha compositing. */
export const ACCENT_RGB: readonly [number, number, number] = [200, 65, 43];
export const INK_RGB: readonly [number, number, number] = [31, 24, 18];

export const SERIF = 'var(--font-neuton), Georgia, serif';
export const SANS = 'var(--font-geist-sans), sans-serif';
export const MONO = 'var(--font-inconsolata), monospace';

/** Text column and figure breakout widths. */
export const COLUMN = '42.5rem'; // ~680px
export const WIDE = '60rem'; // ~960px
