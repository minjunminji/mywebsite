# Custom Cursor — Design

**Date:** 2026-06-28
**Status:** Validated, ready for implementation

## Summary

Replace the OS cursor with a single **black circle** that shows the **negative**
of whatever is behind it — black on the cream page, light over ink, inverting the
hand-drawn art and the About reveal canvas alike. It is one element with
`mix-blend-mode: difference`.

When free, it snaps **1:1** to the pointer (no lag) — a re-skinned cursor. When it
reaches a **text label** (the only clickable things on the site), it behaves like
**liquid**: it sticks, swells from a circle into a **pill** hugging that label, and
— because the blend is preserved — the label text reads inverted inside the pill
(black pill, light text). It melts back to a circle on the way out.

## Look

- **Negative, not literally black.** The element is **white** (`#fff`) under
  `mix-blend-mode: difference`. Difference is `|backdrop − source|`, so white
  inverts the backdrop and black does nothing. Over the cream `#f7f7f5` the dot
  reads as near-black; over ink `#1f1812` it flips light. This is the "negative of
  whatever's behind it" — for free, including the WebGL reveal output.
- **The pill inverts its label for free.** A difference element over the label
  inverts the composited pixels beneath it, so no text needs re-drawing — the
  label simply appears light inside the black pill.
- **Size** is a tunable (`D`, starting ~18px); to be dialed in by eye.

## Behavior

A 3-mode state machine, driven by one `requestAnimationFrame` loop over mutable
refs (no React re-renders):

- **free** — target is a circle of diameter `D` centered on the pointer; position
  **snaps 1:1** (no easing) so it feels precise. A subtle, tunable velocity-stretch
  (squash along the travel direction, decaying when slowing) gives fast flicks a
  liquid streak; defaults mild.
- **pinned** — on `pointerover` of a target, position + size **spring** toward the
  label's padded rect, swelling circle → **pill** (`border-radius = height / 2`)
  with a slight elastic overshoot. The rect is re-read **every frame**, so the pill
  tracks moving targets (the nav docking animation, Experience scroll, resize).
- **releasing** — on `pointerout`, it springs back toward the circle-at-pointer and
  melts down, then hands control back to **free** (snap resumes) once within an
  epsilon. No teleport.

Spring integrator: `v += (target − current) · stiffness; v *= damping;
current += v` — slight overshoot, fast settle.

## Targeting

- Delegated `pointerover` / `pointerout` on `document`; resolve the target with
  `e.target.closest('a, button, [role="button"]')`. That matches exactly the
  site's text labels: corner-menu links, project-title links, the `StoryNav`
  labels (`home` / `about` / `projects` / `experience` + project children), and the
  `software` / `product` lens toggles.
- The **carousel arrows and dots** are the only clickable non-text elements; they
  get a `data-cursor-skip` marker so they keep the plain dot instead of swelling
  into a pill around an icon.

## Architecture

- **`src/components/CustomCursor.tsx`** (new, `'use client'`) — renders one
  `position: fixed` `<div>`: white background, `mix-blend-mode: difference`,
  `pointer-events: none`, `z-index: 2147483647` (above the nav's 25). Owns the
  pointer listeners, the rAF loop, and the state machine.
- **Mount in `app/layout.tsx`'s `<body>`** (after `{children}`). Body has no
  `isolation` / `transform` / `filter`, so the cursor blends against the **entire**
  composited page — the requirement for the negative effect to cover the drawing
  and the reveal canvas.
- All tunables (`D`, pill padding, stiffness, damping, magnetic-drift max,
  velocity-stretch max) grouped at the top of the file for experimentation.

## Gating & accessibility

- **Pointer type:** activate only under `(hover: hover) and (pointer: fine)`. On
  touch, render nothing and leave the native cursor untouched.
- **Hide the native cursor:** the component adds a class to `<html>`; a
  `globals.css` rule does `.cursor-hidden, .cursor-hidden * { cursor: none
  !important; }`. The `!important` overrides the inline `cursor: pointer` /
  `cursor: default` scattered through the components.
- **Reduced motion** (`prefers-reduced-motion: reduce`): keep the cursor and the
  pill (a core affordance) but stiffen the spring to near-instant — no bounce.
- **First paint:** hidden until the first `pointermove`; hide on `pointerleave` /
  window blur.

## Risks / notes

- **Blend isolation:** the effect depends on no ancestor of the cursor creating an
  isolation/group boundary. Verified today (body is clean). If a future wrapper
  adds `transform` / `filter` / `isolation` around the app root, the cursor must
  stay a direct child of `<body>` (or move to a portal) to keep blending against
  the whole page.
- **`width`/`height`/`border-radius` per frame** on one childless fixed element is
  cheap, but keep it to the single element — never animate layout-affecting props
  on the page underneath.
- **Difference over near-white:** the dot is `|0.969 − 1| ≈ 0.03`, i.e. ~`#080808`
  — visually black, not pure `#000`. Intended; white source is what makes it
  invert ink.

## Out of scope (v1)

- True gooey **metaball** merging (SVG blur+threshold "liquid bridge"). The elastic
  single-shape morph delivers the feel without the per-frame filter cost and the
  fragility of combining a goo filter with full-page difference blend.
- Proximity "reach from a distance" grab (engage is true hover + generous pill
  padding). Can be added later if hover doesn't feel sticky enough.
- Per-element cursor variants beyond pill / skip.
