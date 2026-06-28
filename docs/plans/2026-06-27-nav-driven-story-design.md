# Nav-Driven Story — Design

**Date:** 2026-06-27
**Status:** Validated, ready for implementation planning

## Summary

Convert the personal site from a scroll-driven hand-drawn animation into a
**navigation-driven** experience. Scroll is removed entirely. A persistent
**story nav** — which doubles as a progress indicator — becomes the only way to
move between sections. Clicking a node plays the existing hand-drawn frame
sequences at a fixed framerate to transition into that section.

## Interaction model

- One linear sequence of "stops":
  `landing (train loop) → about → [projects: this website → rebase → mango]`.
- Adjacent stops are joined by a frame sequence:
  - `landing ↔ about` → `trans1` (`1trans*`, 25 frames)
  - `about ↔ projects(this website)` → `trans2` (`2trans*`, 22 frames)
  - between the 3 projects → `turnstile` (6 frames)
- Clicking a node sets a target. The player runs the concatenated connecting
  sequences **forward or reverse** at a fixed FPS to reach it.
- **Skipping nodes** (e.g. landing → projects) plays all intermediate sequences
  back-to-back **without stopping** — no intermediate loop, text, or effect fires.
- **Backward** navigation plays the frame sequence(s) **in reverse**.
- **No scrolling** anywhere. Fixed single 100vh/100vw screen.
- **Intro** plays once on load: landing loop ×4 → 20-frame train build → settles
  into the train loop, at which point the nav **fades in centered**.

## Architecture

Incremental extraction (chosen over in-place refactor or full rewrite): keep the
existing rendering code (frame `<img>`, about text, project side-panels, corner
menu, audio player) and isolate the genuinely new control layer.

### 1. Stop-list data model

`STOPS` — the flat, ordered player timeline. Each stop knows its resting visual
and the frame sequence connecting it to the next stop:

```
[
  { id:'landing',     rest: trainLoop (animated),  toNext: trans1  (25f) },
  { id:'about',       rest: aboutLoop (animated),  toNext: trans2  (22f), onArrive: aboutText },
  { id:'thisWebsite', rest: thiswebsite still,     toNext: turnstile (6f), content: image },
  { id:'rebase',      rest: rebase still,          toNext: turnstile (6f), content: carousel },
  { id:'mango',       rest: mango still,           toNext: null,           content: video },
]
```

`NAV` — what the bar renders; groups the 3 projects under one parent. Landing is
**not** listed (it is the implicit unfilled origin):

```
[
  { label:'about',    stopId:'about' },
  { label:'projects', stopId:'thisWebsite',
    children:[ 'this website', 'rebase', 'mango' ] },
]
```

The player only thinks in the flat `STOPS` array (indices 0–4). The nav maps
clicks onto stop indices.

**Extensibility:** adding an `experience` section later = one more `STOPS` entry
+ one more `NAV` entry + its transition frames. No control-logic changes.

### 2. `useFramePlayer` hook

Owns all playback state and exposes one action, `navigateTo(targetIndex)`.

State:
- `currentStop` — index parked at (starts at `0`, landing)
- `isTransitioning` — true while a sequence plays
- `displayFrame` — exact image `src` shown now

Modes:
- **Parked:** an interval animates `displayFrame` through the current stop's
  `rest` loop (train loop / about loop cycle; project stops hold their still with
  the turnstile background faded in).
- **Transitioning:** `navigateTo` builds a **frame queue** — forward concatenates
  each segment `current → target−1` in order; backward concatenates segments
  `current−1 → target` reversed — then steps through it via
  `requestAnimationFrame` at a fixed `PLAYBACK_FPS`. Jumping multiple nodes is
  just a longer queue; it never parks at intermediates.
- **On arrival:** set `currentStop = target`, clear `isTransitioning`, start the
  stop's rest loop, fire its `onArrive` (e.g. re-seed + play the about text).

**Clicks during a transition are ignored** (v1; interrupt-and-retarget can be
added later if it feels stiff).

Replaces: the scroll handler, wheel-clamp handler, both rAF transition easers,
and all `*_VH` constants.

### 3. `<StoryNav>` component

Data-driven from `NAV`; presentational only (calls `navigateTo`, reads
`currentStop`). Horizontal row of nodes joined by connector lines.

Two layout states, animated between with a single eased CSS transition:
- **Centered (landing only):** large, centered; hidden during intro, fades in
  once the train build finishes and the loop runs.
- **Docked (any non-landing stop):** shrinks and slides to top-center.

**Fill = current position:** nodes and connector segments up to the current
position render solid black; everything ahead is pale (low-opacity ink). Going
backward **un-fills** the part ahead.

**Projects expansion:** "projects" is a single node until `currentStop` is a
project (index ≥ 2). On arrival the node **expands inline — the bar itself gets
wider** (same row, not a second row) — and the 3 child nodes animate in
(width/opacity/stagger); the active child is filled. Leaving projects collapses
them.

Nodes/children are non-interactive while `isTransitioning`.

### 4. Render & integration changes

Main component renamed `ScrollScenePlayer` → `StoryPlayer` (update `app/page.tsx`
import). Becomes a fixed `100vh`/`100vw` stage.

Removed:
- Tall scroll container + `position: sticky` wrapper.
- `handleScroll`, wheel-clamp handler, both rAF transition easers, scroll-lock
  effect, every `*_VH` constant, `scrollProgress`.
- Top scroll-progress bar.
- The "scroll!" hint (the nav fade-in is the new call-to-action).
- The "this website is a work in progress" text (removed entirely).

Kept / rewired:
- Intro timers (`introLanding` ×4 → `introTrainSequence` 20f) hand off to the
  player parked at `landing`; nav fades in.
- Frame preloading on mount — unchanged.
- `<img>` stage renders `displayFrame` from the hook. Train blend-mode keys off
  `currentStop === landing` (+ during `trans1`).
- About text fires via `onArrive` at the about stop.
- Project side-panel (image / carousel / video) shows the current project stop's
  content; carousel arrows & video unchanged. Turnstile now plays as the `toNext`
  segment between project stops (no scroll trigger).
- Audio player (top-right) — unchanged.
- "ryan kim" corner menu (top-left) — kept; fade-in triggers on leaving landing
  (replacing scroll-opacity).

## Open items / future

- Mid-transition click interrupt-and-retarget (deferred).
- `experience` section (deferred; data model already supports it).
