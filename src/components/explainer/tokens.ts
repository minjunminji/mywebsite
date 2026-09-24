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

/** Reading measure for body text inside the main pane. */
export const COLUMN = '42.5rem'; // ~680px
/** Two-pane layout: a thin rail of sticky headers beside the main pane. */
export const RAIL = 'clamp(11rem, 20vw, 16rem)';
export const RAIL_GAP = 'clamp(2.5rem, 5vw, 4.5rem)';
export const PAGE_MAX = '72rem';
/** Top padding of the article, and where rail headers stick while scrolling. */
export const PAGE_TOP = 'clamp(4.5rem, 12vh, 7.5rem)';
