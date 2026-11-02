// src/components/explainer/tokens.ts
// Shared look for the shader explainer: the site's white-on-blueprint, with
// figure ink knocked back so full white can mark the thing under discussion.
import { INK as SITE_INK, PAPER, PAPER_RGB } from '@/theme';

export { PAPER, PAPER_RGB };
/** Prose: the site's full ink. */
export const TEXT = SITE_INK;
/** Figure ink: white ~75% of the way out of the blue, opaque for canvas use. */
export const INK = '#bfd0ee';
export const MUTED = '#a6bce7';
export const RULE = 'rgba(255, 255, 255, 0.18)';
export const FAINT = 'rgba(255, 255, 255, 0.4)';
/** The one accent: "the thing under discussion" in every figure. Full white. */
export const ACCENT = SITE_INK;

/** ACCENT / INK as 0..255 RGB triples, for canvas fillStyle alpha compositing. */
export const ACCENT_RGB: readonly [number, number, number] = [255, 255, 255];
export const INK_RGB: readonly [number, number, number] = [191, 208, 238];

export const SANS = 'var(--font-alte-haas-grotesk), Arial, sans-serif';
export const MONO = 'var(--font-inconsolata), monospace';

/** Reading measure for body text inside the main pane. */
export const COLUMN = '42.5rem'; // ~680px
/** Two-pane layout: a thin rail of sticky headers beside the main pane. */
export const RAIL = 'clamp(11rem, 20vw, 16rem)';
export const RAIL_GAP = 'clamp(2.5rem, 5vw, 4.5rem)';
export const PAGE_MAX = '72rem';
/** Top padding of the article, and where rail headers stick while scrolling. */
export const PAGE_TOP = 'clamp(4.5rem, 12vh, 7.5rem)';
