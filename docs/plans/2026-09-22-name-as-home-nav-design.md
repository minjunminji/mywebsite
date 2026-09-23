# Name-as-Home Nav — Design

**Date:** 2026-09-22
**Status:** Validated, ready for implementation planning
**Branch:** `nav-name-home` (experiment)

## Summary

Drop the `home` node. The corner "ryan kim" — currently inert — becomes the
home button and the head of the nav. On the landing, the nav is just
`about  projects  experience` with no connector lines. Leaving the landing, the
words glide to the top-left and join "ryan kim"; once they land, the connector
lines draw in, forming the full bar:

```
ryan kim ── about ── projects ── experience
```

Going home mirrors this exactly.

## Structure

**Data (`storyData.ts`).** The `NAV` entry `{ label: 'home', stopId: 'landing' }`
becomes `{ label: 'ryan kim', stopId: 'landing' }`. It is still stop 0 and
always inked, so the fill model is unchanged.

**One element.** "ryan kim" becomes the first node inside `<StoryNav>`, a real
`<button>` that navigates home. The separate corner-name `<div>` in
`StoryPlayer.tsx` (PORT BLOCK B) is deleted. `cornerVisible` stays — the
top-right cluster still uses it.

**Two states, keyed off `docked`:**

| | Landing (undocked) | Docked |
|---|---|---|
| Position | centered, 33% from top | top-left at `1.5rem` / `1.5rem` |
| "ryan kim" | collapsed (`0fr` grid), invisible | expanded, inked |
| Connectors | slot width reserved, line `scaleX(0)` | line `scaleX(1)` |
| Word ink | solid | pale / progress-filled |
| Size | large | docked size (name adopts the nav's type) |

Connector slots keep their width on the landing, so words glide straight into
their final positions and lines grow into empty space — nothing shifts after
landing. If landing spacing reads too wide, tighten the landing gap so the
visual rhythm stays even.

Moving to the corner transitions `left: 50% → 1.5rem` and
`translate(-50%) → 0`, the same technique the current dock move uses.

## Choreography

**Entering** (`docked` flips true on click — forward nav already docks
immediately, `useFramePlayer.ts:172`):

| t | Event |
|---|---|
| 0 → 600ms | Whole nav glides top-left and shrinks (`LAYOUT_MS`, `LAYOUT_EASE`); "ryan kim" expands + fades in; words fade solid → pale |
| 600 → 900ms | All connectors draw simultaneously, `scaleX 0 → 1`, `transform-origin: left` |

**Going home** (`docked` flips false on arrival — backward nav already holds the
dock until arrival):

| t | Event |
|---|---|
| 0 → 300ms | All lines retract together toward their left ends |
| 300 → 900ms | Glide back to center; name collapses + fades; words brighten to solid |

Ordering is direction-dependent via transition delays chosen by the target
state (lines delay 600ms when docking; glide delays 300ms when undocking).
Pure CSS.

**Projects sub-nodes.** On a landing → projects jump, delay the child reveal
until the lines have drawn: glide → lines → children. Project-to-project
behavior is unchanged.

## Ink hold on the first leg

The ink for stop 1 (`ryan kim → about` connector, then `about`) starts sweeping
at the start of `trans1`, and the first connector occupies roughly the first
third of that sweep (~0.7s) — before the lines draw at 0.6–0.9s.

Fix: hold the ink in *time*, in the player's fill loop. Leaving the landing
(stop 0), the sweep starts `NAV_ASSEMBLY_MS` (900ms) late and covers the rest
of the transition; returning to it, the sweep ends `NAV_ASSEMBLY_MS` early:

```
t = fillWindowT(elapsed, total, from === 0 ? NAV_ASSEMBLY_MS : 0, to === 0 ? NAV_ASSEMBLY_MS : 0)
```

`fillWindowT` and the timing constants live in `navTiming.ts`, shared with
`StoryNav`'s CSS delays. A stop-space fraction was rejected: the fill is eased
for single steps and linear at 2× for skips, so no fixed fraction equals a
fixed 0.9s. Going home, ink finishes draining ~0.9s before arrival, the pale
bar rests a beat, then the lines retract — a symmetric mirror.

## Accessibility

- "ryan kim" button: `aria-label="ryan kim, home"`.
- Collapsed on the landing: `aria-hidden` and `tabIndex={-1}`.
- Existing reveal gate (no interaction until the intro fade completes) still
  applies.

## Testing

**Unit:**
- `fillWindowT` in `navTiming.test.ts`: linear with no holds, holds at 0
  through the start hold, reaches 1 early by the end hold, clamps, and never
  divides by zero when holds exceed the window.
- Update `storyData.test.ts` for the relabeled entry.

**Browser** (1024px and wide):
- landing → about
- landing → projects (children wait for lines)
- landing → experience
- any stop → ryan kim (drain → retract → glide)
- widest docked bar (projects expanded) against the top-right cluster at
  1024px; estimated ~670px + ~250px cluster. Recheck after the piano player
  branch merges (its ♪ widens the cluster).

## Out of scope

- Per-word staggered glide (FLIP) — considered; rejected in favor of a single
  glide + simultaneous line draw.
- Mobile layout — the site is desktop-gated below 1024px.
