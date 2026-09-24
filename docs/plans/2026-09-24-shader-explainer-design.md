# Shader Explainer — Design

**Date:** 2026-09-24
**Status:** Designed (not yet implemented)

## Summary

Add a full-screen, editorial-style **explainer takeover** for the WebGL2 ink
reveal shader on the about page (`RevealFluid.tsx`). It's opened from a bold
inline link in the **"this website"** project body. The explainer walks
through the shader's math and logic in six chapters, each with an animated,
interactive figure — layered so a skimmer gets the idea from a sentence and a
figure, and an engineer can expand the equations and real GLSL.

## Entry point

A new paragraph in the `thisWebsite` project body:

> remember painting over my drawing on the about page? that's a custom webgl2
> shader i wrote. **here's how it works →**

- `ProjectContent.body` widens from `readonly string[]` to paragraphs that are
  either a plain string or an array of segments; a segment can be plain text or
  a trigger (`{ text, action: 'shaderExplainer' }`). Other projects are
  unchanged.
- The trigger renders as a real `<button>` (keyboard + screen reader
  accessible), inheriting the body font, `fontWeight: 600` against the body's
  300, no button chrome, and the existing project-link hover underline.
- The entry point lives only in the projects section. The about section stays
  uncluttered — the reveal works because it's a quiet surprise. (A delayed,
  engagement-triggered hint on the about page is a possible later addition.)

## Takeover shell

`ShaderExplainer.tsx`, modeled on `TldrOverlay.tsx`:

- `position: fixed`, opaque `#f7f7f5`, 300ms opacity fade, `role="dialog"`,
  `aria-modal`, `inert` + `aria-hidden` when closed.
- Esc / X closes; focus moves to the close button on open and back to the
  trigger on close. Story state is untouched — closing lands you back on the
  project.
- `useScrollFade` for the scroll edges.
- **Differs from tldr:** loaded via `next/dynamic` and mounted on first open
  only (it's heavy); stays mounted afterward so the fade-out plays and reopening
  is instant.
- Each figure animates only while intersecting the viewport and while the
  takeover is open.
- No GPU conflict: `RevealFluid` mounts only on the about stop, and the trigger
  lives on a project stop, so they never run together.

## Visual direction — clean, professional, editorial

Reference: Bartosz Ciechanowski's explorables, Distill.

- **Type**
  - Body: **Neuton** (Google Fonts via `next/font`, 400 / 400 italic / 700),
    ~20px (Neuton runs small), line-height ~1.6, measure ≤ ~68ch. Loaded only
    inside the explainer.
  - UI (figure labels, slider names, chapter numerals, captions): Geist Sans.
  - Code, equations, live readouts: Inconsolata (already loaded).
  - Site voice stays lowercase.
- **Color:** ink `#1f1812` on paper `#f7f7f5`; hairline rules at ~12% ink; one
  accent color per figure for the thing under discussion, everything else
  neutral. No gradients, no heavy shadows.
- **Layout:** text column ~680px; figures break out to ~960px; collapses to
  phone width with 16px gutters.

## Page structure

1. **Title block** — lowercase headline, one-line dek, small Geist metadata
   (`webgl2 · ~6 min · interactive`).
2. **Hero figure** — a live instance of the real reveal over the about drawing:
   play first, read after.
3. **Chapters** — each is:
   1. Numeral ("01") + heading.
   2. **The idea** — 2–3 short plain-language paragraphs.
   3. **The figure** — breaks out of the column, framed by hairline rules;
      controls in a quiet row beneath (thin sliders, text toggles, Inconsolata
      readouts); magazine-style caption.
   4. **"show the math"** — text toggle expanding equations plus the relevant
      GLSL excerpt from the real source.
4. **Outro** — link to the source on GitHub, short "what i'd do next".

## Chapters

| # | Topic | Figure | Rendering |
|---|---|---|---|
| 01 | two passes & ping-pong feedback | raw red mask texture beside the final composite, toggle between | WebGL (real shader) |
| 02 | painting a stroke | drag segment endpoints; live distance-field heatmap + `smoothstep` falloff curve | 2D canvas |
| 03 | smoothing the cursor | `1 - exp(-dt·k)` follow; naive per-frame segments vs cubic Hermite; tangent slider; toggle the old unscaled-tangent loop bug | 2D canvas |
| 04 | speed & dwell | draw pad with live speed / `speedT` / radius graphs; dwell build-up | 2D canvas |
| 05 | decay & precision | RGBA8 vs R16F fade staircase; refresh-rate slider showing decay rounding to zero at 240Hz | 2D canvas / SVG |
| 06 | the ink edge | value noise → fbm octave by octave; threshold slider; zoom into `fwidth` antialiasing | WebGL (real shader) |

## Architecture

### Shared source of truth

Extract from `RevealFluid.tsx` into `src/components/reveal/`:

- `shaders.ts` — quad VS, blob (mask) FS, display FS.
- `brush.ts` — pure functions: exponential follow step, Hermite path sampling,
  speed → `speedT` → target radius.

`RevealFluid` and the explainer both import these, so the explainer always
shows the code that actually runs. The 2D-canvas figures call the same
`brush.ts` functions, so they're faithful to the real brush.

### Debug uniforms

The display shader gains uniforms that default to current behavior (live site
output unchanged):

- `u_view` — composite / raw mask / pre-threshold field
- `u_octaves` — fbm octave count
- `u_threshold` — edge threshold
- `u_noiseAmp` — noise amplitude

### WebGL budget

Three contexts total (hero, ch01, ch06) — well under the ~16 browser cap.
Shared setup in `useGlFigure.ts`.

### Figure kit

- `<Figure>` — hairline frame, caption, IntersectionObserver-driven play/pause.
- `<Slider>`, `<Toggle>`, `<Readout>`, `<MathToggle>`.

### Reduced motion

Figures render a static state until interacted with; nothing autoplays. Edge
noise drift is frozen, matching `RevealFluid`.

## Files

```
src/components/reveal/
  shaders.ts
  brush.ts
  brush.test.ts
src/components/explainer/
  ShaderExplainer.tsx
  explainerFonts.ts
  useGlFigure.ts
  chapters/  Intro.tsx, Ch01Passes.tsx … Ch06Edge.tsx, Outro.tsx
  figure/    Figure.tsx, Slider.tsx, Toggle.tsx, Readout.tsx, MathToggle.tsx
```

Touched: `storyData.ts` (segment body type + new copy), `StoryPlayer.tsx`
(trigger rendering, `explainerOpen` state), `RevealFluid.tsx` (imports from
`reveal/`, no behavior change).

## Testing & verification

- **Refactor first, separate commit.** `brush.test.ts` pins current behavior
  before the extraction: Hermite endpoints hit exactly, follow step is
  frame-rate independent, radius stays within bounds.
- Pure math behind figures (e.g. the 8-bit decay quantization) gets vitest
  coverage.
- `pnpm test`, `pnpm lint`, `pnpm build` pass before handoff.
- Visual check is done by Ryan in the browser from a handoff checklist:
  open/close, Esc, focus return, each figure's controls, phone width, reduced
  motion, and the about-page reveal unchanged.

## Build order

1. `reveal/` extraction (+ tests).
2. Takeover shell + entry point.
3. Figure kit.
4. Chapters, starting with 02 and 03 (most self-contained), then 04, 05, 01,
   06, hero, outro.
