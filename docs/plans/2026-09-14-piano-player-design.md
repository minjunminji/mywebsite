# Persistent Piano Player — Design

**Date:** 2026-09-14
**Status:** Design validated, not yet implemented

## Intent

Let visitors listen to Ryan's Chopin Piano Concerto No. 1 (mvt. 1) performance while
they explore the site. The recording is ~18 minutes and lives on YouTube, so this is a
background-listening feature, not a clip to glance at.

Summoned by clicking the word **piano** in the about copy, it opens a small floating
window that survives navigation to every other stop.

## The trigger

`ABOUT_LINES[2]` reads "in my spare time, i like to play piano, cook, and play soccer".
The word `piano` becomes the affordance — a subtle underline, clickable, summoning the
player. The copy does the work; no new chrome is introduced on the about screen.

Two notes:

- The about `<section>` is currently `pointerEvents: 'none'` (`StoryPlayer.tsx:249`).
  Pointer events must be re-enabled on the trigger span only, not the whole section.
- `ABOUT_LINES` is a flat string array. The line needs to become segmented (or parsed)
  so `piano` can be wrapped in its own element.

Clicking `piano` while the player is already open is a no-op — it does not restart
playback or reposition the window.

## Architecture

### Persistence is free

There is no routing. `app/page.tsx` renders a single `<StoryPlayer />`, and navigation
is state (`player.currentStop`), not route changes. A player mounted in
`app/layout.tsx` alongside `<CustomCursor />` therefore survives all navigation with no
portal, context, or state-lifting machinery.

### The never-unmount rule

**The iframe must never unmount, never change `src`, and never move in the DOM tree.**
Any of the three reloads the embed and loses playback position in an 18-minute video.

Consequences:

| Behavior | Implementation | Never |
|---|---|---|
| Drag | CSS `transform` on the window wrapper | Re-parenting |
| Collapse | Animate the iframe's rect / scale | Conditional rendering |
| Close | `pauseVideo()` + hide wrapper | Unmount |

The iframe is **absolutely positioned** within the window wrapper. "Tucked inside the
header bar" is a different set of coordinates, not a different parent. The header and
the iframe stay siblings permanently.

### Lazy first mount

The iframe mounts on the **first** `piano` click, then never tears down. An
always-mounted YouTube embed costs a few hundred KB on every page load for visitors who
never use the feature.

## States

```
HIDDEN        Not yet summoned, or closed. Wrapper hidden, video paused.

EXPANDED  (~400px wide)
┌────────────────────────────────────────┐
│ ⠿  ▶   ━━━━━━━●──────────  4:32   ▭ ✕ │
├────────────────────────────────────────┤
│                                        │
│          [ video, no UI ]              │
│                                        │
└────────────────────────────────────────┘

COLLAPSED  (same width, iframe scaled into a slot on the right)
┌────────────────────────────────────────┐
│ ⠿ ▶  ━━━━●────────  4:32  ▭ ✕ ┌──────┐│
└───────────────────────────────└──────┘─┘
```

The collapsed bar keeps the **same width** as the expanded window, so nothing reflows
horizontally. The iframe scales into a reserved slot on the right; the scrub bar gives
up ~70px. The slot is a flex spacer animating `0 → 64px`, with the absolutely
positioned iframe landing on top of it.

## Geometry: scale, don't resize

The iframe has a **fixed intrinsic size** (400×225) and the collapse animates
`transform: scale()` on its wrapper — `scale(1)` expanded, `scale(0.16)` collapsed.

Two reasons this beats animating width/height:

- YouTube embeds misbehave below roughly 200px — controls break, the player sometimes
  errors. At a constant 400×225 internally, the player always believes it is
  normal-sized and is merely painted smaller.
- Transform transitions are GPU-composited; width/height transitions force relayout on
  every frame and will jank.

Both states are 16:9, so one scale value covers the entire animation.

**Rounded bottom corners:** apply `overflow: hidden` + `border-radius` to a wrapper
around the iframe, never to the iframe itself, and add `transform: translateZ(0)` to
that wrapper. Safari drops the clip on transformed descendants otherwise, and square
corners poke out mid-animation.

## YouTube embed configuration

Use the **IFrame Player API** (`YT.Player`), not a bare `<iframe src>` — programmatic
control is required for custom transport and for play-on-summon.

Parameters:

```
controls=0          Removes the entire bottom control bar
iv_load_policy=3    No annotations or cards
disablekb=1         No keyboard shortcuts stealing arrow keys
rel=0               Limits end-screen suggestions to the same channel
playsinline=1       Prevents iOS fullscreen hijack
enablejsapi=1       Required for API control
```

**Do not bother with** `modestbranding` (deprecated, now a no-op) or `showinfo`
(removed in 2018).

### The hover-chrome problem

Even with `controls=0`, hovering the video fades in YouTube's title, channel, share,
and "Watch on YouTube" overlay. No supported parameter removes it.

**Solution:** a transparent shield div over the iframe with `pointer-events: auto`. The
cursor never reaches the player, so the hover chrome never fires — no title bar, no
share buttons, no context menu. The video remains fully visible at full size; input is
simply routed to our own controls.

The shield does double duty: iframes swallow `pointermove`, so dragging would stutter
the instant the cursor crossed the video without it.

### End screen

At the end of 18 minutes the related-video grid appears regardless of `rel=0`. Listen
for `onStateChange === ENDED`, then `seekTo(0)` and pause — the end screen never gets a
chance to render.

## Transport controls

All through the IFrame API:

- **Play/pause** — driven by `onStateChange`, *not* purely by the click handler.
  YouTube changes state on its own (buffering, ads) and a button tracking only local
  clicks will desync from reality.
- **Progress** — poll `getCurrentTime()` / `getDuration()` on a 250ms interval while
  playing. **The interval must stop when paused** so a timer isn't spinning forever in
  the background.
- **Scrub** — `seekTo(seconds, true)`, with pointer capture on the track so the drag
  survives the cursor leaving the bar.

At ~150px of track for 18 minutes, each pixel is roughly 7 seconds. Coarse, but
appropriate for background listening.

**Volume is deliberately out of scope.** People use system volume, and every added
control squeezes an already-coarse scrub bar.

## Close and the ♪ affordance

Close is `pauseVideo()` + hide the wrapper. Playback position is preserved for free and
nothing plays while hidden. Reopening restores exactly where the listener left off.

Because the summoning affordance (`piano`) exists only on the about screen, closing the
player from, say, the experience stop would otherwise strand the listener with no way
back. So: **once summoned even once, a small ♪ joins the top-right corner cluster** —
the flex row at `StoryPlayer.tsx:342` that already holds `tldr` and the social icons.
It is the site's established global-controls location, and it keeps the player one
click away from anywhere.

The ♪ does not appear before the first summon.

## Dragging

- Pointer events on the header; `transform: translate()` on the window wrapper.
- Clamp to the viewport so the window cannot be dragged off-screen.
- The shield div (above) keeps the drag smooth across the iframe.
- `RevealFluid` listens on `window` pointermove (`RevealFluid.tsx:348`), so dragging
  across the about screen will smear the reference reveal open. Events originating
  inside the player must be ignored by that handler.

## Styling

Match existing tokens rather than inventing new ones:

| Token | Value | Precedent |
|---|---|---|
| Ink | `#1f1812` | About copy, nav, corner name |
| Paper | `#f7f7f5` | `globals.css` body |
| Border | `1.5px solid #1f1812` | Project figures (`StoryPlayer.tsx:623`) |
| Radius | `12px` | Project figures |
| Font | `var(--font-geist-sans)` | Everywhere |
| Case | lowercase | `tldr`, nav labels |

Buttons should carry `data-cursor-pad="-4"` to match how the custom cursor treats other
controls.

## Out of scope

- Volume control
- Playlist / multiple tracks
- Mobile — `layout.tsx:42` gates the site to desktop
- Resizing the window (drag to move only)

## Spawn position

The player spawns **anchored to the word that summoned it**: `piano` sits directly on
the player's top-left corner, so the window unfolds down-and-right from the word.

```
  in my spare time, i like to play
  piano, cook, and play soccer
  │
  └─┬──────────────────────────────┐
    │ ⠿  ▶  ━━━●────────  0:04  ▭ ✕│
    ├──────────────────────────────┤
    │                              │
    │      [ video, no UI ]        │
    │                              │
    └──────────────────────────────┘
```

Implementation: `getBoundingClientRect()` on the trigger span at click time. The
window's top-left is set to the span's `left` / `bottom`.

Three things this implies:

- **The anchor is captured once, not tracked.** The coordinates are read at click time
  and become plain viewport position. The about copy unmounts on navigation
  (`StoryPlayer.tsx:237`); the player must not follow it or care.
- **Spawn must be clamped like a drag.** The about copy is vertically centred and
  `piano` is on the last line, so on a short viewport the word sits low enough that a
  ~265px-tall window would hang off the bottom. Clamp to viewport on spawn using the
  same logic as the drag, shifting up rather than overflowing.
- **It will cover the hint line.** "move your cursor over the drawing to reveal the
  reference" sits `4em` below the copy and lands under the player. Acceptable — the
  listener just chose the player over the hint — but it is a deliberate tradeoff, not
  an oversight.

**Anchoring applies only to the first summon from `piano`.** Reopening from the corner
♪ restores the last position instead, since the ♪ is reachable from stops where the
word doesn't exist and snapping to a stale coordinate would be arbitrary.

## Defaults chosen (override freely)

- **Spawn state:** expanded, playing.
- **Position persistence across reloads:** none. `localStorage` is a cheap later
  addition if it proves annoying.

## The video

**Video ID: `QSbZHTvbjR4`**

Use the bare ID only. If a URL ever arrives carrying `list=…` / `start_radio=1` (an
auto-generated YouTube radio mix, depending on where the link was copied from), strip
them — a `list` param turns the embed into a playlist and queues unrelated videos after
the performance ends, which also defeats the `ENDED` handler above.

Note that the TLDR copy in `storyData.ts` links to a *different* recording
(`ueOshaElP9E`, the concerto with the VSO SOM orchestra). That link is deliberate and
separate from what the player embeds.

## Open items

- `public/song/arigato.mp3` (2.9MB) is committed but referenced nowhere in `src/` or
  `app/`. It appears to be a leftover from an earlier music idea and should be deleted
  unless it has a purpose.
