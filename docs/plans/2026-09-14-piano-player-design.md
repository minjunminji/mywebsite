# Persistent Piano Player — Design

**Date:** 2026-09-14
**Status:** Implemented on `piano-player-marquee`; this document describes what shipped

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

- The about `<section>` is currently `pointerEvents: 'none'` (`StoryPlayer.tsx`).
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

EXPANDED  (400px wide)
┌────────────────────────────────────────┐
│ ⠿   me playing chopin piano co…   ▭ ✕ │
├────────────────────────────────────────┤
│                                        │
│     [ video, YouTube's controls ]      │
│                                        │
└────────────────────────────────────────┘

COLLAPSED  (same width, video scaled over the bar's right end)
┌───────────────────────────────────────┬──────┐
│ ⠿  me playing chopin pia…    ▭ ✕     │ ▓▓▓▓ │
└───────────────────────────────────────┴──────┘
```

The collapsed bar keeps the **same width** as the expanded window, so nothing reflows
horizontally. The video scales down over a reserved slot at the right; the title gives
up that width.

The bar carries only window controls — drag, collapse, close — plus a scrolling title
where transport would otherwise sit. Playback belongs to the embed.

## Geometry: scale, don't resize

The iframe has a **fixed intrinsic size** (400×225, passed explicitly — without it the
API builds a 640×390 iframe) and the collapse animates `transform: scale()` on its
wrapper: `scale(1)` expanded, about `scale(0.178)` collapsed.

Two reasons this beats animating width/height:

- YouTube embeds misbehave below roughly 200px — controls break, the player sometimes
  errors. At a constant 400×225 internally, the player always believes it is
  normal-sized and is merely painted smaller.
- Transform transitions are GPU-composited; width/height transitions force relayout on
  every frame and will jank.

Both states are 16:9, so one scale value covers the entire animation.

**The collapsed size is derived, never picked.** Its height is the bar's full *outer*
height and its width follows from 16:9, so it lands flush by construction and keeps
following `HEADER_H` if that ever changes. It sits *over* the bar's border rather than
inside it — tucking it inside leaves a hairline of paper between the two — which means
it must out-rank the header in z-order, since the header paints an opaque background.

**Rounded bottom corners:** apply `overflow: hidden` + `border-radius` to a wrapper
around the iframe, never to the iframe itself, and add `transform: translateZ(0)` to
that wrapper. Safari drops the clip on transformed descendants otherwise, and square
corners poke out mid-animation.

## YouTube embed configuration

Use the **IFrame Player API** (`YT.Player`), not a bare `<iframe src>` — the API is
still needed to start on summon and pause on close even though the embed owns transport.

Parameters:

```
controls=1          The embed owns transport
fs=0                No fullscreen button — this is a 400px window by design
color=white         Progress bar in white rather than YouTube red
iv_load_policy=3    No annotations or cards
rel=0               Limits end-screen suggestions to the same channel
start=241           Opens at 4:01, skipping the orchestral introduction
playsinline=1       Prevents iOS fullscreen hijack
enablejsapi=1       Required for API control
origin=<page>       Pairs with enablejsapi; the API warns without it
```

**Do not bother with** `modestbranding` (deprecated, now a no-op) or `showinfo`
(removed in 2018).

### How much of YouTube's UI can actually go

`controls` is binary — the bar can't be cherry-picked — and the iframe is cross-origin,
so CSS cannot reach inside it either. Only `fs=0` and `color=white` give genuine
per-piece control. The settings gear, captions button, YouTube wordmark, and the
title/share overlay on hover are all unreachable.

Masking individual regions with absolutely-positioned covers is possible in principle
but was rejected: YouTube's control bar auto-hides after a few seconds, so a static
cover sits over video content whenever the bar is hidden, and the positions are
hardcoded offsets against a layout that is not a contract.

The alternative — `controls=0` with transport built by hand — was implemented and
explored on the `piano-player` branch, then set aside in favour of this one.

### The shield

A transparent div over the iframe, present in exactly two situations:

- **While collapsed.** The video is ~71×40 there; YouTube's controls would be both
  unreadable and easy to hit by accident, so the whole thumbnail goes inert.
- **During a drag.** Iframes swallow `pointermove`, so a drag would stutter the instant
  the cursor crossed the video.

It must *not* be present while expanded and idle, or the native controls can't be
clicked. It also carries the header's drag handlers, so the collapsed bar moves as one
object rather than having a dead patch at its end.

### When it doesn't load

Without this, a blocked `youtube.com` — a corporate proxy, a privacy extension, a
region-locked or removed video — was a permanent silent dead-end: `ready` never came,
so nothing rendered; `visible` was true, so the ♪ was suppressed; and the word's
already-visible guard made every further click a no-op. Nothing happened, forever, with
no way out short of a reload.

Three layers now cover it:

- The API script has an `onerror` handler and the player registers `onError`, so a
  blocked host or an unembeddable video reports rather than hangs.
- A 15s ceiling on the whole boot catches the case where neither fires.
- Failure renders the window with a fallback panel — a one-line message and a link to
  the video on YouTube — so it is visible, closable, and offers an escape. There is no
  in-place retry; the link is the retry.

### End screen

At the end of 18 minutes the related-video grid appears regardless of `rel=0`. Listen
for `onStateChange === ENDED`, then `seekTo(0)` and pause — the end screen never gets a
chance to render. (Rewind goes to 0, not back to `start`.)

## The title

A marquee sits where transport would otherwise be: two identical copies of the text
translated by exactly `-50%`, so the second lands where the first began and the loop has
no seam. The trailing gap lives on each copy, which is what keeps that halfway point
honest. Edges are masked so the text dissolves instead of clipping against the bar, and
the animation is parked under `prefers-reduced-motion` — continuously moving text is a
common accessibility complaint.

**Volume is deliberately out of scope** — people use their system volume, and the embed
supplies its own control anyway.

## Close and the ♪ affordance

Close is `pauseVideo()` + hide the wrapper. Playback position is preserved for free and
nothing plays while hidden. Reopening restores exactly where the listener left off.

Because the summoning affordance (`piano`) exists only on the about screen, closing the
player from, say, the experience stop would otherwise strand the listener with no way
back. So: **once summoned even once, a small ♪ joins the top-right corner cluster** —
the top-right flex row in `StoryPlayer.tsx` that already holds `tldr` and the social icons.
It is the site's established global-controls location, and it keeps the player one
click away from anywhere.

The ♪ does not appear before the first summon.

## Dragging

- Pointer events on the header; `transform: translate()` on the window wrapper.
- Clamp to the viewport so the window cannot be dragged off-screen.
- The shield div (above) keeps the drag smooth across the iframe.
- `RevealFluid` listens on `window` pointermove (`RevealFluid.tsx`), so dragging
  across the about screen will smear the reference reveal open. Events originating
  inside the player must be ignored by that handler.

## Styling

Match existing tokens rather than inventing new ones:

| Token | Value | Precedent |
|---|---|---|
| Ink | `#1f1812` | About copy, nav, corner name |
| Paper | `#f7f7f5` | `globals.css` body |
| Border | `1.5px solid #1f1812` | Project figures (`StoryPlayer.tsx`) |
| Radius | `12px` | Project figures |
| Font | `var(--font-geist-sans)` | Everywhere |
| Case | lowercase | `tldr`, nav labels |

Buttons should carry `data-cursor-pad="-4"` to match how the custom cursor treats other
controls.

## Out of scope

- Volume control
- Playlist / multiple tracks
- Mobile — the desktop gate in `layout.tsx` turns mobile away
- Resizing the window (drag to move only)
- **The custom cursor over the expanded video.** `CustomCursor` tracks `window`
  pointermove, and the shield is deliberately absent while expanded so YouTube's
  controls can be clicked — which means the bare iframe swallows those events and the
  site's cursor freezes at the video's edge until the pointer re-emerges. This is the
  same class of problem fixed for `RevealFluid`, and it is not fixable here without a
  shield, which would defeat the point of native controls. Accepted cost of this
  variant, not an oversight.

## Spawn position

The player spawns **anchored to the word that summoned it**: `piano` sits directly on
the player's top-left corner, so the window unfolds down-and-right from the word.

```
  in my spare time, i like to play
  piano, cook, and play soccer
  │
  └─┬──────────────────────────────┐
    │ ⠿  me playing chopin…   ▭ ✕ │
    ├──────────────────────────────┤
    │                              │
    │           [ video ]          │
    │                              │
    └──────────────────────────────┘
```

Implementation: `getBoundingClientRect()` on the trigger span at click time. The
window's top-left is set to the span's `left` / `bottom`.

Three things this implies:

- **The anchor is captured once, not tracked.** The coordinates are read at click time
  and become plain viewport position. The about copy unmounts on navigation
  (`StoryPlayer.tsx`); the player must not follow it or care.
- **Spawn must be clamped like a drag.** The about copy is vertically centred and
  `piano` is on the last line, so on a short viewport the word sits low enough that a
  ~265px-tall window would hang off the bottom. Clamp to viewport on spawn using the
  same logic as the drag, shifting up rather than overflowing.
- **It will cover the hint line.** "move your cursor over the drawing to reveal the
  reference" sits `4em` below the copy and lands under the player. Acceptable — the
  listener just chose the player over the hint — but it is a deliberate tradeoff, not
  an oversight.

**Every summon from `piano` re-anchors to the word.** Reopening from the corner ♪ is
the exception: it restores the last position instead, since the ♪ is reachable from
stops where the word doesn't exist and snapping to a stale coordinate would be
arbitrary.

## Opening behaviour

- **Summoned from `piano`:** expanded, and it starts playing — that click is the
  browser gesture the audio needs.
- **Restored from the ♪:** expanded, and deliberately *silent*. The ♪ is a "put it
  back" control, not a play button; closing already paused the player, so it returns
  exactly where the listener left it.
- **Always expanded on open.** `collapsed` is reset whenever the window closes. It has
  to be: the player never unmounts, so the flag would otherwise survive a close, and the
  provider clamps the spawn against the *expanded* height — a collapsed reopen would
  land a 40px bar where a 265px window was expected.
- **Nothing renders until the embed is ready — with a floor.** A chrome-first shell
  around a loading hole looked worse than a short pause, so the window is withheld until
  `onReady`. But "nothing" must not become "nothing, forever": past 2.5s the window
  appears anyway with a quiet loading line, and a hard failure shows a way out (see
  below). `ready` latches on for good, so only the very first open ever waits.
- **Position persistence across reloads:** none. `localStorage` is a cheap later
  addition if it proves annoying.

## The video

**Video ID: `QSbZHTvbjR4`**

It opens at **4:01** via the `start` playerVar, skipping the orchestral introduction.
That applies to the initial load only — finishing rewinds to 0.

Use the bare ID only. If a URL ever arrives carrying `list=…` / `start_radio=1` (an
auto-generated YouTube radio mix, depending on where the link was copied from), strip
them — a `list` param turns the embed into a playlist and queues unrelated videos after
the performance ends, which also defeats the `ENDED` handler above.

This is the colour-graded upload of the concerto, replacing an earlier ungraded one
(`ueOshaElP9E`). Same performance, same length, so the durations quoted throughout this
document hold.

The TLDR copy in `storyData.ts` links to the same recording, so both places now point at
the graded upload. That link is a plain `youtu.be/<id>` — the `?si=…` share-tracking
param the old URL carried was dropped rather than carried across.

## Open items

- **The orchestra's name is inconsistent between two user-visible strings.** The
  marquee says "the VAM symphony orchestra"; the TLDR copy in `storyData.ts` says "the
  VSO SOM orchestra". Those are different institutions (Vancouver Academy of Music vs.
  Vancouver Symphony Orchestra / School of Music). Both are now on the page; one needs
  correcting.
- **`MOVE_MS` (340ms) has never been judged by eye** — it was picked before the collapse
  animation had ever run.
