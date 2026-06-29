# Custom Cursor — Design

**Date:** 2026-06-28
**Status:** Implemented (reworked twice — now a WebGL SDF metaball; see Revisions below)

> **Revision (2026-06-28): WebGL SDF metaball rework.** The DOM sticky-blob (the
> revision below, and the whole "Behavior"/"Architecture" body) was replaced with a
> full-viewport **WebGL2 canvas** that renders one **signed-distance-field** shape
> under `mix-blend-mode: difference`. Free movement is a plain round **dot**; on
> hover it **smooth-min's with a rounded box** that springs to wrap the element
> (one liquid body); on leave the box **"drains" off directionally** along the way
> the pointer left, down a tapering stream, back into the dot (a "tablecloth pull"
> feel). An fbm **domain-warp** wobbles the wrapped edge. This supersedes the
> rotate+stretch blob *and* the "true gooey metaball — out of scope" note below:
> the SDF gets real liquid merging in one cheap shader pass, no SVG goo filter. The
> `/cursor-lab` prototype that compared three techniques (spring-jelly, turbulence,
> SDF) has been **removed** now that SDF shipped, along with the now-unused
> `remapClamped` math helper. `CustomCursor.tsx` is the SDF cursor; the production
> gating (fine-pointer only, reduced-motion, native-cursor hide, focus/blur
> visibility, `data-cursor-skip`) carried over from the version below. Sections
> below are kept for history and describe the superseded sticky-blob.

> **Revision (2026-06-28): sticky-cursor rework.** The original hover behavior — a
> circle swelling into a **pill that hugs the label** — was replaced after review
> against a reference the user preferred (Olivier Larose's "sticky cursor"). The
> hover now **sticks to the element and grows into a fixed-size round blob that
> rotates and squash-stretches toward the pointer** (it does *not* wrap the text
> into a pill). Free movement stays snappy 1:1, and the negative/`difference` look
> is kept. The reference's "Magnetic" component (which physically drags page DOM
> toward the cursor) is intentionally **not** adopted. Sections below are updated to
> the shipped behavior; the pill is retained only in this note for history.

## Summary

Replace the OS cursor with a single **black circle** that shows the **negative**
of whatever is behind it — black on the cream page, light over ink, inverting the
hand-drawn art and the About reveal canvas alike. It is one element with
`mix-blend-mode: difference`.

When free, it snaps **1:1** to the pointer (no lag) — a re-skinned cursor. When it
reaches a **text label** (the only clickable things on the site), it **sticks** to
that element: it glides onto the label's center (leaning slightly toward the
pointer), **grows into a larger round blob**, and **rotates + squash-stretches
toward the pointer** as you move — a magnetic, liquid feel. Because the blend is
preserved, whatever is under the blob (the label text) reads inverted. It melts
back to the snappy dot on the way out.

## Look

- **Negative, not literally black.** The element is **white** (`#fff`) under
  `mix-blend-mode: difference`. Difference is `|backdrop − source|`, so white
  inverts the backdrop and black does nothing. Over the cream `#f7f7f5` the dot
  reads as near-black; over ink `#1f1812` it flips light. This is the "negative of
  whatever's behind it" — for free, including the WebGL reveal output.
- **The blob inverts whatever it covers for free.** A difference element over the
  label inverts the composited pixels beneath it, so no text needs re-drawing — the
  text simply reads light inside the dark blob.
- **Size** is tunable: free diameter `CURSOR_DIAMETER` (~18px) and the hover blob
  `CURSOR_HOVER_SIZE` (~56px); to be dialed in by eye.

## Behavior

A 3-mode state machine, driven by one `requestAnimationFrame` loop over mutable
refs (no React re-renders). Center and size are **springed**; rotation and stretch
are set **directly** each frame (instant, responsive to the pointer):

- **free** — a circle of diameter `CURSOR_DIAMETER` whose center **snaps 1:1** to
  the pointer (no easing, no stretch) so it feels precise.
- **pinned** — on `pointerover` of a target, with `rect = el.getBoundingClientRect()`
  re-read **every frame** (so it tracks the nav docking animation, Experience
  scroll, resize): the center springs toward `rect.center + STICK_LEAN · (pointer −
  rect.center)` (sticks to the element, leaning ~10% toward the pointer); the size
  springs toward `CURSOR_HOVER_SIZE`; the shape stays a **circle** (`border-radius:
  50%`). Each frame it also rotates to face the pointer (`angle = atan2(dy, dx)`)
  and squash-stretches toward it via a clamped remap — `scaleX: 1 → 1.3` over
  `rect.height/2`, `scaleY: 1 → 0.8` over `rect.width/2` (the reference's deliberate
  height-for-X / width-for-Y pairing). The elongation comes from `scale`, not the
  border-radius.
- **releasing** — on `pointerout`, center + size spring back toward the
  circle-at-pointer (a snappier `RELEASE_STIFFNESS`) while rotation/scale ease to
  neutral; hands back to **free** (snap resumes) once within an epsilon. No teleport.

Spring integrator: `v += (target − current) · stiffness; v *= damping;
current += v` — slight overshoot, fast settle.

## Targeting

- Delegated `pointerover` / `pointerout` on `document`; resolve the target with
  `e.target.closest('a, button, [role="button"]')`. That matches exactly the
  site's text labels: corner-menu links, project-title links, the `StoryNav`
  labels (`home` / `about` / `projects` / `experience` + project children), and the
  `software` / `product` lens toggles.
- The **carousel arrows and dots** are the only clickable non-text elements; they
  get a `data-cursor-skip` marker so they keep the plain dot instead of grabbing
  the blob around an icon.

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
  hover grow (a core affordance) but snap to targets with no rotation/stretch — no
  bounce.
- **First paint:** hidden until the first `pointermove`; hide on `pointerleave` /
  window blur.

## Risks / notes

- **Blend isolation:** the effect depends on no ancestor of the cursor creating an
  isolation/group boundary. Verified today (body is clean). If a future wrapper
  adds `transform` / `filter` / `isolation` around the app root, the cursor must
  stay a direct child of `<body>` (or move to a portal) to keep blending against
  the whole page.
- **`width`/`height` (+ `transform`) per frame** on one childless fixed element is
  cheap, but keep it to the single element — never animate layout-affecting props
  on the page underneath. (`border-radius` is a constant `50%`; the elongation is
  `scale`.)
- **Difference over near-white:** the dot is `|0.969 − 1| ≈ 0.03`, i.e. ~`#080808`
  — visually black, not pure `#000`. Intended; white source is what makes it
  invert ink.

## Out of scope (v1)

- **DOM-dragging "Magnetic" wrapper** — the reference also translates the page's
  clickable elements toward the cursor. Explicitly not wanted; only the cursor
  itself moves.
- True gooey **metaball** merging (SVG blur+threshold "liquid bridge"). The
  rotate+stretch blob delivers the liquid feel without the per-frame filter cost and
  the fragility of combining a goo filter with full-page difference blend.
- Proximity "reach from a distance" grab (engage is true hover). Can be added later
  if hover doesn't feel sticky enough.
- Per-element cursor variants beyond blob / skip.
