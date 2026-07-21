# TLDR Takeover — Design

**Date:** 2026-07-21
**Status:** Designed (not yet implemented)

## Summary

Add a persistent **`tldr`** button to the top-right corner. On the landing it
fades in *with the nav* and sits alone in the corner. Clicking it opens a
**full-screen, fully opaque takeover** — a quiet single-column "reader" page in
the site's paper/ink/lowercase style with a short first-person rundown of Ryan
(modeled on [akylai.xyz](https://www.akylai.xyz/)), an X (and Esc) to dismiss.
Closing returns you to exactly where you were, untouched.

On every page *after* the landing, the existing GitHub + LinkedIn icons fade in
to the right of `tldr`, and `tldr` **slides left** to make room; returning home
collapses them and `tldr` glides back to the corner. The button is always
mounted after the intro — only its horizontal position changes.

## The top-right cluster (choreography)

The whole top-right becomes **one right-anchored flex row** at `top/right:
1.5rem`, ordered `[ tldr ] [ github ] [ linkedin ]`.

- The two social icons live inside a **collapsible wrapper**. On the landing
  (`player.position === 0`) the wrapper collapses to **zero width**, so the
  right-anchored row shrinks and `tldr` sits flush in the corner, alone.
- Leaving home (`player.position !== 0`) expands the wrapper to its natural width
  and fades the icons in. Because the row is anchored to the right edge, it grows
  **leftward**, pushing `tldr` left by exactly the icons' width — pure reflow, no
  hand-computed offsets. Coming back collapses it and `tldr` returns right.

The collapse reuses the **exact trick the nav already uses** for the projects
sub-nodes (`StoryNav.tsx:268`): an `inline-grid` wrapper animating
`grid-template-columns: 0fr → 1fr` with `overflow: hidden` on the inner element,
plus a negative `margin-left` to swallow the flex gap when collapsed. One curve
drives the whole move so it reads as a single coordinated motion.

This replaces the current top-right block (`StoryPlayer.tsx:323-364`), whose
social icons are gated on `cornerVisible = introDone && player.position !== 0`.
That same "off-landing" signal now drives the wrapper's expand/collapse.

## The takeover overlay

A full-viewport `position: fixed` layer above everything (nav is `zIndex 25`,
socials `20`; the overlay sits at `~50` — still **below** the custom-cursor
canvas at `2147483647`, so the metaball keeps tracking over it).

- **Fully opaque paper** (`#f7f7f5`) — a real takeover that covers the scene, not
  a translucent modal.
- **X in the top-right** dismisses; **Esc** also closes.
- **Content:** a single centered column, `max-width ~42rem`, generous vertical
  rhythm — akylai's proportions in the site's paper/ink palette, lowercase Geist
  Sans (`var(--font-geist-sans)`), ink `#1f1812`.
- **Overflow:** if the column is taller than the viewport (mobile), it scrolls
  internally with the same thin scrollbar + edge-fade used on the project pane
  (`custom-scroll` + `useScrollFade`).
- **Return-to-place is automatic:** the overlay is just a layer and never touches
  the story state, so closing reveals the scene exactly where it was.
- While open, the overlay covers the corner cluster; it carries its **own** X and
  its **own** footer links instead, keeping the reading surface clean.

## Content

First-person, current-thing-first, short scannable bullets — akylai's format in
Ryan's voice. Final copy (locked):

> **ryan kim**
>
> - computer engineering at ubc (class of 2028) and a ubc presidential scholar.
>   currently a software engineer intern at shopify, doing mobile development on
>   the admin app used by millions of merchants.
> - leading a team of 7 — product, design, and engineering — at ubc sailbot; most
>   recently we're building an internal hiring portal.
> - founded rebase, an AI-native career dashboard — took a 3-person team from
>   concept to private beta with 20+ users.
> - i like building things that live between engineering and design — this whole
>   site is a hand-drawn, frame-by-frame world i illustrated and wrote a custom
>   scene engine for.
> - i play valorant — peaked immortal, top 4000 NA in V26A3.
> - i play piano; my favorite composer is chopin. here's me [performing his first
>   piano concerto](https://youtu.be/ueOshaElP9E?si=PRTsosLeGCpK43uT) with the VSO
>   SOM orchestra.
> - some of my favorite artists are fujii kaze, wave to earth, and exo.
> - based in vancouver.
>
> *github · linkedin · email*

Notes:
- The chopin line renders an inline underlined hyperlink on "performing his first
  piano concerto" → the YouTube URL, `target="_blank"`.
- The artists line is **static for now**, but kept isolated so it can later be
  fed by the Spotify `top/artists?time_range=short_term` endpoint (via a stored
  refresh token + cached serverless route). When live, the phrasing switches to
  *"on repeat this month: …"*. Not in this build.
- Footer is text links `github · linkedin · email` (not the icons). `github` and
  `linkedin` reuse the `SOCIAL_LINKS` hrefs; `email` is a `mailto:` to
  `ryankim373@gmail.com`.

## Motion & timing (all reuse existing values)

- **`tldr` fade-in:** `opacity 800ms ease 750ms`, gated on `introDone` —
  byte-for-byte the nav's timing (`StoryNav.tsx:314`), so they bloom together on
  the landing. Stays visible thereafter (no re-fade on later navigation).
- **The left-shift:** `grid-template-columns` + `margin-left` animate on `600ms
  cubic-bezier(0.65,0,0.35,1)` (the nav's `LAYOUT` curve), keyed off
  `player.position !== 0`. Icons fade in `~400ms` once the space opens.
- **Overlay open/close:** fades + drifts up `opacity/transform 300ms ease` on
  open, reverses on close. Stays **mounted** (toggled by an `open` prop) so focus
  and Esc behave; `aria-hidden` + `pointer-events: none` when closed.

## Architecture / files

- **`src/components/story/storyData.ts`** — add a `TLDR` data block: the name,
  the bullets (modeled as **text segments** so the one chopin link is inline data,
  not hardcoded JSX), and the footer links.
- **`src/components/story/TldrOverlay.tsx`** (new, `'use client'`) — the takeover:
  paper bg, X (Esc + click), centered `~42rem` column, bullets, footer; internal
  scroll via `useScrollFade` + `custom-scroll`. `role="dialog"`,
  `aria-modal="true"`; focus moves to the X on open and back to the `tldr` button
  on close. Props: `{ open: boolean; onClose: () => void }`.
- **`src/components/StoryPlayer.tsx`** — add `tldrOpen` state; refactor the
  existing top-right block (`:323-364`) into the `[tldr][social-cluster]`
  right-anchored row; render `<TldrOverlay open={tldrOpen} onClose={…} />`.

No new dependencies. Nothing touches the story/frame engine, `useFramePlayer`, or
the scene rendering.

## Accessibility & cursor

- Esc closes; focus to X on open, restored to the `tldr` button on close.
- Tag the `tldr` button, the X, the footer links, and the inline concerto link
  with `data-cursor-pad` so the metaball wraps them like the existing chevrons /
  social icons.
- The `tldr` button stays non-interactive until the intro fade finishes (mirror
  the nav's `interactive` gate, `StoryNav.tsx:50-59`) so the cursor doesn't blob
  a button that hasn't appeared yet.

## Risks / notes

- **Right-anchored reflow depends on the gap collapse.** When the social wrapper
  is `0fr`, the flex `gap` would still space `tldr` off the corner — the negative
  `margin-left` (nav's trick) must exactly cancel the gap so `tldr` lands flush at
  `right: 1.5rem`.
- **Overlay vs. cursor blend.** The custom cursor uses `mix-blend-mode:
  difference` against the whole page; an opaque paper overlay is fine (it's just a
  lighter backdrop for the difference), but keep the overlay a plain layer with no
  `isolation`/`filter` that would break the cursor's full-page blend.

## Out of scope (this build)

- **Live Spotify top-artists feed** — designed for, isolated, but shipped static.
  Follow-up: Spotify app registration, one-time OAuth to capture a refresh token,
  a cached serverless route, and a static fallback.
- **Resume link** in the footer — omitted; no hosted PDF to point at yet.
