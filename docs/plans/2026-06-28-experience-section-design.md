# Experience Section — Design

**Date:** 2026-06-28
**Status:** Validated, ready for implementation planning

## Summary

Add a final **experience** section to the nav-driven site. It is the one section
with **no hand-drawn element** — the type *is* the art. Set in **Inconsolata
(monospace)** on the existing cream/ink palette, it reads like a résumé: three
experiences, each anchored by its year, with bullets that **decrypt** into place.

A headline doubles as a two-way lens toggle — **"here's me as a `software`/`product`
engineer"** — and switching the lens re-decrypts the bullets into a role-tailored
reading of the same career. Arriving at the section plays a one-time signature
animation: a `2025` from the previous project morphs into a vertical stack of
years, which then ripple-decrypt the full résumé into view.

Ryan supplies the final bullet copy; this work builds the scaffold, animation
system, and data structure it drops into.

## Content

Three experiences, top-to-bottom (most recent first):

| Year        | Company               | Title                        |
|-------------|-----------------------|------------------------------|
| `2026`      | shopify               | software engineer intern     |
| `2025-2026` | ubc sailbot           | software website lead        |
| `2025`      | paladin technologies  | systems engineering intern   |

- **Two lenses:** `software`, `product` (AI engineer dropped).
- **Year, company, and title are fixed** across lenses — only the **bullets**
  (and the headline's lens word) change. Same career, two readings of it.
- **Bullet count may differ per lens** (e.g. 3 as software, 2 as product).
- Lowercase throughout, to match the site's voice (about, nav, project titles).

## Look

- **Palette — monochrome.** Cream `#f7f7f5`, ink `#1f1812`. No accent color
  (a terracotta pop is the generic "AI résumé" default and would fight the
  hand-drawn sections). The only color *state* is **resolved vs. unresolved**:
  scrambling glyphs render in pale ink `rgba(31,24,18,0.28)` (the nav's pale)
  and snap to full ink the instant they resolve. That pale→ink flip is the
  decryption's signature, for free.
- **Type — Inconsolata, hierarchy by weight/size, not family.** Years large and
  heavy, company names medium, bullets light. Monospace means scrambling glyphs
  sit in fixed cells, so nothing reflows as it resolves.

### Layout

```
                     software
   here's me as a  ┌─────────┐ engineer        ← headline = the lens toggle
                   └─────────┘
                     product

   2026        shopify / software engineer intern
               › decrypted bullet one ...
               › decrypted bullet two ...

   2025-2026   ubc sailbot / software website lead
               › bullet ...
               › bullet ...

   2025        paladin technologies / systems engineering intern
               › bullet ...
               › bullet ...
```

The **year is a left anchor column** — it doubles as each block's **ripple
origin** during the entrance.

### The lens toggle (headline)

The headline *is* the control. The slot after "as a" holds a **vertical stack**
of the two lens words; the selected word sits on the sentence baseline in full
ink, the other rests just below in pale. Click the pale one and the stack
**slides** vertically so that word locks onto the baseline — a small slot-machine
embedded in the sentence. Both words are always visible.

Monospace details:
- The slot is **fixed to 8 cells** (width of "software") so the trailing
  "engineer" never shifts horizontally on toggle — only the stack slides.
- On switch the **word stack slides** (the toggle's own motion) while the
  **bullets do an in-place scramble** below — two distinct motions, not redundant.

## Motion

### Entrance (one-time signature)

Fires on arrival at the section (directly from mango, or after the project
frame-transitions run up to mango on a longer jump). Three waves fire together;
snappy (~3.4s total):

1. **Isolate (~0.4s):** mango's copy fades out, leaving only its `2025`.
2. **Travel (~0.7s, eased):** that `2025` glides to vertical center, then settles
   ~⅓ in from the left.
3. **Stack (~0.8s):** a second year slides up from behind it, then a third —
   forming the tight vertical stack `2026` / `2025` / `2025`; then sailbot's
   `2026` morphs in to complete `2025-2026`.
4. **Ripple-decrypt (~1.5s):** from each year (top-left of its block) a circular
   wave expands; characters resolve from pale scramble to ink **at the wave's
   leading edge**. As text fills, blocks grow and the years **space apart** into
   their final positions. All three waves fire **simultaneously**. Lands on the
   **software** lens.

**Reduced motion** (`prefers-reduced-motion`): skip the morph; resolve straight
into the final layout with a quick fade. Same end state.

### Lens toggle

- Headline word stack **slides** to the chosen lens.
- Every **bullet** re-decrypts into its role-tailored version via an **in-place
  scramble** that resolves **left-to-right with a small per-line stagger**
  (~0.6–0.9s). Tighter than the entrance ripple, which stays reserved for the
  one-time arrival.
- Block height transitions smoothly when bullet count/length changes between
  lenses.
- Lenses are inert until the entrance finishes (same as nav nodes mid-transition).

## Architecture

The site is nav-driven (no scroll). `experience` becomes the 4th top-level nav
node and the final stop. Its transition is **not** hand-drawn frames, so it needs
a small, deliberate extension to the player — anticipated by the prior design doc.

### Data (`storyData.ts`)

- `StopId` gains `'experience'`.
- `STOPS` gains `{ id: 'experience', isExperience: true }` — no `loop`/`still`
  (text only).
- `SEGMENTS` gains a 5th entry `[]` — no frames for `mango → experience`; the
  morph is the transition.
- `NAV` gains `{ label: 'experience', stopId: 'experience' }` (4th node).
- New `EXPERIENCE` data + `LENSES`:

```ts
export type Lens = 'software' | 'product';
export const LENSES: readonly Lens[] = ['software', 'product'];

export type ExperienceEntry = {
  key: 'shopify' | 'sailbot' | 'paladin';
  year: string;            // '2026' | '2025-2026' | '2025'
  company: string;         // 'shopify'
  title: string;           // 'software engineer intern'
  bullets: Record<Lens, readonly string[]>;  // variable length per lens
};
export const EXPERIENCE: readonly ExperienceEntry[];  // Ryan fills bullets
```

- Helper `isExperienceStop(index)`.

### New components / hooks

- **`useDecrypt`** — the reusable scramble→resolve primitive, rAF-driven, glyph
  cycling capped (~20–30fps) and stopping when resolved. Two modes:
  - **ripple** — per-char resolve time = distance from a given origin point (the
    year) → the entrance.
  - **scan** — resolve left-to-right with a per-line stagger → the toggle.
  - Honors `prefers-reduced-motion` (instant resolve).
- **`ExperienceSection.tsx`** — renders the résumé layout, the inline slot-toggle
  + lens state, and the entrance timeline (isolate → travel → stack → ripple).

### Player hand-off (`useFramePlayer` / `StoryPlayer`)

- `experience` is the last stop (index 5). Its frame-queue leg is empty, so:
  - **From mango (adjacent):** empty queue → arrives instantly; the entrance
    plays (morph from a `2025` anchor at mango's position).
  - **Longer jump (e.g. about → experience):** plays project frames up to mango,
    arrives at experience, entrance plays.
- The main frame `<img>` **hides** on experience (no art); cream shows behind the
  text. Project backdrop layers stay off (experience is not a project).
- **Leaving experience:** section fades (~0.4s), *then* the player runs the
  reverse frames mango → target — the "just fade out."
- Nav fill: experience node fills as `fillProgress` reaches its index (snap on
  arrival in v1; optional short sweep over the morph).
- **`2025` seed:** baseline is a `2025` appearing at mango's anchor point then
  morphing. Polish: FLIP from the actual `2025` span in mango's copy when
  arriving directly from it (wrap that word in a ref'd span). Degrades cleanly to
  the baseline if mango's copy ever loses "2025".

### Setup

- Add **Inconsolata** via `next/font/google` in `app/layout.tsx`
  (`--font-inconsolata`), added to the `<html>` className alongside Geist.
- New keyframes in `globals.css` for the slot slide / fades; the scramble itself
  is JS/rAF-driven.

## Risks / notes

- **Mango coupling:** the entrance routes through mango and seeds from its `2025`.
  The FLIP enhancement assumes mango's copy contains "2025"; if it ever doesn't,
  the baseline fade-in path still works.
- **Performance:** the scramble runs rAF over many characters — cap glyph-cycle
  rate and stop per-character once resolved.
- **Mobile:** inherits the site's portrait-rotate overlay; résumé text uses
  `clamp()` sizing and must fit the fixed 100vh stage (allow internal scroll only
  if a lens's content overflows on small screens).

## Out of scope (v1)

- Mid-transition click interrupt (matches the rest of the site — deferred).
- More than two lenses.
- Any hand-drawn art in this section (intentionally text-only).
