# Project Reading — Design

**Date:** 2026-11-01
**Status:** Designed (not yet implemented)

**Builds on:** the `theme/blueprint-blue` branch (white-on-blue theme, sketched
cursor, piano player living outline and `src/components/piano/sketchOutline.ts`),
which is not on `main` yet.

**Prototype:** `docs/plans/2026-11-01-project-reading-prototype.html` is the
approved throwaway prototype (glide reading + living-line media; pick the
"bloom" tab for the approved uncrumple). It ran inside a preview server, so its
`/files/...` image paths won't resolve if opened directly; the code is the
reference. Port its crumple and reading logic rather than re-deriving them from
the numbers below.

## Intent

Today each project is a scrolling wall of body copy with a media carousel
parked underneath it, and the two have nothing to do with each other. Faced
with that much text at once, a visitor doesn't know where to look first and
mostly doesn't read it.

The projects section becomes a guided read, modeled on Apple's internships
page: one continuous block of large text in which only the sentence you're on
is lit and everything else is faint. Scrolling moves the light forward one
sentence at a time. Each sentence can bring its own media onto the empty left
half of the screen, over the turnstile drawing, so what you're reading and what
you're looking at are always the same thing.

Success: a visitor reads a project sentence by sentence without effort, and the
media lands exactly when the sentence that's about it does.

## Goals

- Project copy is read one highlighted chunk at a time.
- Media is attached to chunks and appears beside them, not in a separate block.
- Media is presented in the site's living-line language (the cursor and piano
  player outline) and enters and leaves with an "uncrumpling paper" motion.
- The turnstile drawing and the nav-driven move between projects stay exactly
  as they are; the media lands on top of the drawing.
- Projects can carry live, interactive UI components as media, not only images
  and video.

## Non-goals

- The about section. A separate, larger change is planned for it.
- The mobile tl;dr layout (`MobileTldr`). It is untouched.
- Designing the specific live UI components for each project. This design
  provides the slot; Ryan designs the components per project later.
- Rewriting project copy. Ryan re-authors the copy into chunks; the build ships
  with the current copy split at sentence boundaries as a starting point.
- The ruled-lines / hard-edges restyle explored earlier. It was dropped.

## Anti-goals

- Scroll-jacking that fights the user: no snapping, no one-sentence-per-flick.
  The text glides like a normal page (see Reading).
- Hiding or replacing the turnstile to show media. Continuity between projects
  depends on it.
- More than one piece of media on screen at once.

## Reading

**Decided with Ryan:**

- Each project's body renders as one continuous block of large text: no
  paragraph breaks, no lists, no other formatting. Lists in the current copy
  are folded into running sentences.
- Everything is faint except the **active chunk**, which is full white. Faint
  text is white at about 22% (prototype value).
- **Glide, not step.** Scrolling moves the text block like a normal scroll
  container. The active chunk is the last chunk whose first line has reached a
  fixed **reading spot** near the top of the text area. (Prototype: 150px below
  the top of the text viewport, with top padding so chunk 1 starts at the spot
  and bottom padding so the last chunk can reach it.)
- **Scroll anywhere.** While a project is on screen, wheel / trackpad input
  anywhere on the page scrolls that project's text, not only over the text.
- **End of text: nothing.** At the last chunk, further scrolling does nothing.
  It does not advance to the next project.
- Title and tech stack stay above the text block, as now.

**Builder's calls (Claude's, flagged for Ryan to check):**

- A chunk is author-defined: usually one sentence, sometimes two short ones.
  Content declares chunks explicitly; the renderer never splits sentences
  itself.
- Inline actions stay inline and clickable inside a chunk (the "here's how it
  works →" shader explainer trigger). It is clickable whether or not its chunk
  is lit.
- Keyboard: Page Up/Down, arrow keys and Space scroll the text the same way.
- Arriving at a project starts at chunk 1. Returning to a project you've
  visited also starts at chunk 1 (no remembered position).

## Media

**Decided with Ryan:**

- Media is attached to a chunk. When that chunk becomes active, its media
  appears on the left side of the screen, over the turnstile drawing.
- **One at a time.** When a different media is due, the current one leaves
  first, then the new one enters.
- Media kinds: image, video, and **live UI component** (an interactive React
  component, e.g. a sample rebase feature that animates and can be clicked).
- **Frame: living line.** Media sits inside the same boiling pencil outline as
  the piano player (8fps boil, 1.25x the cursor's wobble) and is clipped to it,
  so its edge wobbles with the line.
- **Enter: uncrumple. Leave: scrunch.** Media enters as a small, tilted,
  crumpled ball with large angular facets around its edge; parts of the edge
  open at different times as it untilts and grows; the facets relax into the
  clean living line, and faint crease lines across the media fade out as it
  flattens. It leaves by the exact reverse, faster. Each entrance uses a fresh
  random crumple.

  Prototype values that read well: enter 900ms, leave 420ms; the crumple holds
  briefly then opens (ease-in-out cubic); start scale 0.14 and start tilt
  ±8–16° easing to 1 and 0; 9 edge facets with amplitude 0.34 x frame height;
  up to 70% inward pull on late-opening parts of the edge; 5 crease lines,
  each drawn as a dark line with a light 1px offset highlight.

**Builder's calls (Claude's, flagged for Ryan to check):**

- Media is a function of position, not scroll history: the media shown is the
  media of the nearest chunk at or before the active chunk that has any, or
  none if no chunk up to the active one has media. So a chunk without media
  keeps the media before it up, scrolling back up restores earlier media, and
  above a project's first media chunk the left side is empty (the turnstile
  alone). This is what the prototype does.
- Leaving a project (nav to another stop) scrunches its media away.
- Videos play muted and looped while on screen and pause when they leave.
- Placement: one fixed slot, centred in the empty area left of the project
  panel, sized to fit the media's aspect ratio within a maximum box (prototype:
  about 440x248 for 16:9). The slot does not move between media.
- Media and live components are interactive (pointer events on); the living
  line itself is not.
- The current carousels (`carouselImages`), the single `imageSrc` /
  `videoSrc` media blocks and the carousel dots are removed. Each existing
  image or video is attached to the chunk it best illustrates.
- No captions. The lit chunk is the media's caption; alt text / video titles
  stay for accessibility.

## Motion and accessibility

- Reduced motion: no crumple; media fades in and out in place, and the living
  line holds still (no boil), matching the cursor and piano player.
- The lit chunk is presentation only. Screen readers get the full text in
  order, unchanged. Media gets alt text / titles as now.
- The custom cursor's existing rules apply over media (it wraps clickable
  elements; over white media it turns blue via `data-cursor-ink="paper"`).

## Constraints from the codebase

- Project content lives in `PROJECT_CONTENT` in
  `src/components/story/storyData.ts` and is read only by `StoryPlayer.tsx`
  (and its tests). The `ProjectContent` type changes shape: body becomes a list
  of chunks, each with text segments (plain or action) and optional media.
- The project panel is rendered inline in `StoryPlayer.tsx` (the "PORT BLOCK C"
  aside). It currently uses `useScrollFade` for a masked edge fade; the fade is
  dropped for the project text.
- The site has no page scroll; everything is fixed full-viewport. Wheel input
  anywhere must be routed to the project text only while a project is the
  active stop, and must not interfere with the piano player, the tl;dr
  overlay, the shader explainer or the experience section, which have their
  own scroll containers.
- The living line already exists twice: the cursor's WebGL shader and the
  piano player's 2D canvas + `src/components/piano/sketchOutline.ts` (rounded
  box SDF, marching-squares trace, noise wobble, clip-path). The media frame
  should reuse the piano player's approach and helpers rather than add a third
  implementation.
- `public/` media: `oldwebsite.webp`, `animationtimelapse.mp4`, `rebase1–4.webp`,
  `mango.mp4` + `mango-poster.jpg`.
- `ProjectVideo` lazily loads and plays only when active; keep that behaviour.

## Left to the builder

- Component structure, state management and how the reading spot is computed.
- The exact reading-spot position, text size and faint opacity, within the
  spirit of the prototype (large bold text, ~30px, faint ~22%).
- How wheel input is captured globally and handed to the text container.
- Performance: the living-line frame must sleep between boil steps like the
  piano player.
- The initial chunk split and media mapping of the current copy (Ryan will
  revise it).
- Tests for the chunk model, active-chunk selection and media sequencing.
