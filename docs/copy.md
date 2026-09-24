
#  site copy

  

All the words on the site, in the order a visitor meets them. Rewrite anything under a heading. When you're done, I'll put it back into the code.

  

**Conventions**

  

- Keep the `##` / `###` headings so I know where each piece goes. Everything under a heading is yours to change.

- Paragraphs are separated by a blank line. Add or remove paragraphs and bullets as you like.

-  `[text](url)` is a link. `[[text]]` is an in-page button (the piano trigger and the shader-explainer link). Keep the brackets if you want it to stay clickable.

- In the explainer, `backticks` show up as inline code, `**bold**` as bold, `*italic*` as italic.

- The site is lowercase on purpose, and CSS lowercases the nav and project titles anyway. Write however you want and I'll match.

-  `<!-- comments -->` say which file a section comes from. You can ignore them.

  

---

  

##  browser tab

  

<!-- app/layout.tsx -->

  

###  title

  

ryan kim

  

###  meta description (search engines, link previews)

  

Hand-drawn animation personal website

  

---

  

##  nav + corner buttons

  

<!-- src/components/story/storyData.ts (NAV), StoryPlayer.tsx -->

  

###  nav items

  

- ryan kim

- about

- projects

- this website

- rebase

- mango

- experience

  

###  top-right button

  

tldr

  

---

  

##  about

  

<!-- src/components/story/storyData.ts (ABOUT_LINES, ABOUT_PIANO_LINE), StoryPlayer.tsx -->

  

###  greeting (bold)

  

hi, i'm ryan 👋

  

###  body

  

i'm a junior computer engineering student at the university of british columbia, and i love building things that make me or other people happy

  

in my spare time, i like to play [[piano]], cook, and play soccer

  

###  hint under the text

  

move your cursor over the drawing to reveal the reference

  

---

  

##  piano player

  

<!-- src/components/piano/PianoPlayer.tsx -->

  

###  first-open hint

  

you can drag this anywhere, collapse it, and keep listening as you explore the site

  

###  while loading

  

loading…

  

###  if the video fails

  

couldn't load the video — [watch on youtube](https://www.youtube.com/watch?v=QSbZHTvbjR4)

  

---

  

##  projects

  

<!-- src/components/story/storyData.ts (PROJECT_CONTENT) -->

  

###  this website: title

  

this website

  

###  this website: tech stack

  

Next.js, React, TypeScript, WebGL2

  

###  this website: body

my old portfolio was a hand-drawn interactive view of my own desk, but it felt static. so i rebuilt it as an animated hand-drawn world you navigate, where each section is its own scene.

i challenged myself to learn animation and built a custom frame-by-frame scene system in next.js + react. clicking through the nav plays the hand-drawn sequences forward or backward to move you from one place to the next.

remember painting over my drawing on the about page? that's a custom webgl2 shader i wrote. [[here's how it works →]]

  

this project is where my love for illustration, design, and frontend engineering all meet.

  

###  this website: media captions

  

1. timelapse of drawing

2. my old website

  

---

  

###  rebase: title

  

rebase

  

###  rebase: link

  

http://tryrebase.io/

  

###  rebase: tech stack

  

React.js, Next.js, Supabase, Typst, Inngest, Redis

  

###  rebase: body

  

an ai-native resume builder that treats your career as a structured database instead of a folder of near-identical files.

the core is a data model i designed around one idea: every experience should live exactly once. each experience is an atomic "blob" with two layers: 
- the "base content" is the raw source of truth, everything you've ever done in that role, written as loosely as you want. 
- "bullet versions" are polished, version-controlled phrasings you can mix and match across resumes.

for a user, that means one place to see and edit each experience. for an LLM writing your resume bullets, it means clean, scoped context. the main flow is input a job description, then, via a multi-model routing layer, an LLM model of your choice picks your most relevant experiences, and writes fresh bullets from the full base content instead of from whatever limited phrasing you used last time.

since bullets are only as good as their source, rebase keeps that base content growing. i built the "quick add" feature to minimize the friction it takes to log a win on one of your experiences, and the "refine" feature asks you targeted questions about your existing blobs to turn vagueness into specifics (this also reduced hallucination by a lot!).

this all culminates in a custom Typst-based rendering engine. structured resume data flows through a template adapter layer that turns each selected experience and bullet version into Typst source. that same source powers both a live SVG preview and client-side PDF export, so what you see is what you download. the engine supports multiple templates, custom fonts, configurable contact links and formatting, user-defined section ordering, and a one-page overflow warning. because compilation happens entirely in the browser through WebAssembly, exporting a resume requires no server-side document generation.

  

###  rebase: media captions

  

(none. the four screenshots have no captions)

  

---

  

###  mango: title

  

mango

  

###  mango: link

  

https://devpost.com/software/mango-full-body-gesture-control-for-any-game

  

###  mango: tech stack

  

Python, PyAutoGUI, OpenCV, MediaPipe

  

###  mango: body

  

mango turns any webcam into a full-body game controller, so you can play minecraft with gestures and movement, no vr headset or external sensors required.

  

it tracks body motion in real time and maps your movements directly to in-game inputs for a hands-free, immersive control experience.

  

built in 12 hours with opencv, mediapipe holistic, python, and pyinput, this project won 1st place at hellohacks 2025.

  

---

  

##  experience

  

<!-- src/components/story/storyData.ts (EXPERIENCE), experience/ExperienceSection.tsx -->

  

###  headline

  

here's me as a {software | product} engineer:

  

(The visitor picks `software` or `product`, and the bullets below change to match. You can reword around the `{…}` slot or rename the two lenses.)

  

###  shopify

  

-  **year:** 2026

-  **company:** shopify

-  **title:** software engineer intern

  

**software bullets**

  

- drove delivery of an AI storefront-generation experience across \textbf{17} merged PRs from prototype to release readiness, building the TypeScript and GraphQL generation flows, real-time server-driven progress, generated-theme navigation, and accessible cross-device UI

- shipped merchant-facing changes in a large full-stack TypeScript/GraphQL web application, scoping a fix in a shared UI component to 1 of its 5 call sites to avoid regressions and correcting a responsive-breakpoint failure, each with new unit tests and reviewer instructions requiring no local setup
- fixed an intermittent Skia/JSI crash caused by the canvas mounting mid-navigation while the JavaScript runtime was busy starting AI generation; rendered a static fallback through the transition and deferred the live canvas until interactions settled

  

**product bullets**

  

- redesigned the AI theme-generation experience, converting a blocking 2-minute synchronous wait into an asynchronous background workflow with real-time toast notifications on completion — keeping merchants unblocked throughout.

- assumed full product ownership of the mobile experience, coordinating alignment across design, product, and engineering leadership to ship a multi-surface interface (including a custom Skia-based motion loader reused across full-screen and inline states) now rolling out as a core experiment on track to become the default mobile theme-generation flow.

  

###  ubc sailbot

  

-  **year:** 2025-2026

-  **company:** ubc sailbot

-  **title:** software website lead

  

**software bullets**

  

- built an end-to-end AIS ship-tracking data pipeline using MongoDB, Redis caching, and webhooks, replacing a commercial vendor and saving $25k/year in subscription fees

- engineered a real-time React telemetry dashboard that visualizes autonomous sailboat sensor data, designing the ingestion layer to consume streaming telemetry and store in MongoDB for low-latency frontend fetching

  

**product bullets**

  

- lead a cross-functional subteam of 7 full-stack developers and UI designers, managing deliverables and aligning technical roadmaps with the mechanical and electrical engineering subteams.

- owning the product lifecycle for a new recruitment and hiring portal, gathering cross-subteam requirements to streamline the team's engineering onboarding and applicant tracking.

  

###  paladin technologies

  

-  **year:** 2025

-  **company:** paladin technologies

-  **title:** systems engineering intern

  

**software bullets**

  

- built a parallelized Python (Pandas) ETL pipeline that automated a manual geospatial workflow, reducing processing time from 8 hours to under 30 seconds (>1,000× speedup) through optimized file I/O and vectorization

- developed automated web scrapers to ingest, normalize, and schema-map unstructured vendor data from 200+ hardware platforms into a centralized database for technical evaluation

  

**product bullets**

  

- led technical requirements gathering with City of Vancouver IT and field engineering teams to scope a 250+ site city-wide surveillance upgrade

- designed a standardized KMZ metadata specification adopted as the official municipal requirement across all deployment sites to ensure uniform geospatial data logging

- synthesized complex hardware capabilities into a structured technical decision matrix, streamlining the procurement process across 200+ vendors

  

---

  

##  tldr overlay

  

<!-- src/components/story/storyData.ts (TLDR_NAME, TLDR_BULLETS) -->

  

###  heading

  

ryan kim

  

###  bullets

  
- vancouver, canada
- computer engineering at ubc (class of 2028) and a ubc presidential scholar
- previous software engineer @shopify (summer 2026), doing mobile development for the merchant admin app

- leading a team of 7 at ubc sailbot, currently building an internal hiring portal

- built [rebase](https://www.tryrebase.io/), an AI-native career dashboard. took a 3-person team from concept to private beta with 20+ users

- i like building things that live between engineering and design. this whole site is a hand-drawn, frame-by-frame world i illustrated and wrote a custom scene engine for

- i play valorant, peaked immortal top 0.5% NA in V26A3

- i play piano; my favorite composer is chopin. here's me [performing his first piano concerto](https://youtu.be/QSbZHTvbjR4) with the VAMSO orchestra

- some of my favorite artists are fujii kaze, wave to earth, and exo

  

---

  

##  shader explainer ("here's how it works →")

  

<!-- src/components/explainer/ShaderExplainer.tsx and chapters/*.tsx -->

  

Equations and GLSL snippets in the "show the math" sections aren't listed here. Tell me if you want to change those too.

  

###  title

  

how the ink reveal works

  

###  subtitle (italic)

  

REMOVE THE SUBTITLE ENTIRELY

  

###  meta line

  

webgl2 · glsl es 3.0

~6 min · interactive

  

###  fig. 1 caption

  

try painting over the drawing! this is the same effect used on the about page.

  

###  intro

  

the reveal begins with a simple idea: wherever your cursor moves, uncover the drawing.

making that feel like ink takes a little more work. the page needs to remember where you painted, connect uneven cursor positions into a smooth stroke, and give the edge an organic texture.

the result is split between the cpu, which shapes the brush’s path, and two small programs on the gpu, which update and display the reveal.

  

---

  

###  01 title

  

giving the shader a memory

  

###  01 body

  


a fragment shader calculates the color of every pixel, then starts over on the next frame. by itself, it has no memory of where your cursor has already been.

to preserve that history, the effect stores it in a grayscale image called a **mask**. white pixels are fully revealed, black pixels are hidden, and gray pixels sit somewhere in between.

each frame has two steps. first, the **mask pass** fades the old mask slightly and paints the newest part of the stroke into it. then the **display pass** uses that updated mask to reveal the drawing.

there is one complication: the gpu can't safely read from a texture while writing new values into that same texture. instead, the effect keeps two copies. it reads from texture a and writes to texture b, then swaps them on the next frame. this back-and-forth technique is called **ping-pong rendering**.

  

###  01 fig. 2 caption

  

paint in either pane. the left shows the final effect; the right shows the grayscale mask underneath it.

  

###  01 fig. 2 labels

  

- left pane: what you see

- right pane: stored mask

- diagram boxes: texture a / texture b

- diagram arrow: read a → write b / read b → write a

- diagram note: slowed down - this swap happens ~once per frame

  

###  01 math notes

  

`Δt` is the time since the last frame; `T = 2.5s` is how long a fully revealed pixel takes to disappear.

  

the mask is rendered at half the width and height of the screen. because it contains smooth gradients, scaling it back up is difficult to notice, and processing it requires only one quarter as many pixels.

  

---

  

###  02 title

  

turning movement into a stroke

  

###  02 body

  


the mask shader runs once for every pixel. for each one, it needs to answer: **how close is this pixel to the brush’s path**?

the path is represented by several short line segments. the shader finds the closest point on each segment, measures the distance to it, and keeps the shortest distance it finds.

distance then becomes paint. pixels near the center of the path receive a value close to 1, pixels outside the brush receive 0, and `smoothstep` creates a soft transition between them.

where two segments meet, their paint values overlap. adding them together would make every joint darker than the rest of the stroke. those brighter joints would also take longer to fade, leaving a trail of dots. taking the **maximum** value instead produces one continuous stroke.

  

###  02 fig. 3 caption

  

drag the three points to reshape the path, then move over the field to inspect a pixel. switch from max to add to see paint collect at the joint.

  

###  02 fig. 3 controls

  

radius · combine (max / add) · distance · position on segment · paint value · highest value
  

###  02 math notes

  

the calculation adjusts the horizontal axis for the canvas’s aspect ratio. without that correction, a circular brush would stretch into an oval.

  

---

  

###  03 title

  

making the brush feel smooth

  

###  03 body

  


cursor positions arrive as separate samples. drawing a straight line between each pair works at low speeds, but quick movements expose the individual segments and make the stroke look angular.

instead of attaching the brush directly to the cursor, I let it follow slightly behind. every frame, it closes a fraction of the remaining distance. the delay is small, but it filters out abrupt changes and gives the brush a more natural sense of weight.

the fraction is calculated with `k = 1 − e^(−λΔt)`. including the elapsed time, `Δt`, makes the motion consistent across different frame rates.

the gaps between brush positions are filled with **cubic hermite curves**. each curve knows where it starts, where it ends, and the direction the brush is moving at both points. matching those directions between consecutive curves hides the joins.

an earlier version stored a tangent from the previous frame and reused it unchanged. when a long frame was followed by a short one, that tangent was much too large and could make the curve loop backward. storing velocity instead and scaling it to the current frame’s duration fixed the problem.

  

###  03 fig. 4 caption

  

move across the pad or watch the automatic path. choose uneven timing and enable the old tangent behavior to reproduce the looping bug.

  

###  03 fig. 4 controls

  

path (straight / hermite) · tangents (velocity × Δt / stale tangent) · timing (even / uneven) · follow speed · frame rate · distance closed per frame

  

###  03 math notes

  

this part runs on the cpu in typescript. each curve is sampled at 13 points, which are then sent to the shader as a uniform array.

  

---

  

###  04 title

  

responding to speed

  

###  04 body

  


a perfectly uniform brush looks more like a digital marker than wet ink. to make it feel more expressive, the brush changes with the speed of the cursor.

fast movement narrows the brush to 70% of its normal radius. as the cursor slows down, the brush expands back to full size.

stopping also changes how paint builds up. while the brush rests, it continues adding a small amount to the mask. more of the soft outer edge eventually crosses the reveal threshold, causing the visible mark to spread outward like ink soaking into paper.

both behaviors come from the same normalized speed value, `speedT`. it moves from 0 at low speed to 1 at high speed and provides a smooth control signal for the radius and paint build-up.

  

###  04 fig. 5 caption

  

move quickly, then pause. disable dwell build-up to see how the mark behaves when a resting brush stops adding paint.

  

###  04 fig. 5 controls

  

dwell build-up (on / off) · strength · view (mask / reveal) · charts: speed / radius / dwell amount

  

###  04 math notes

  

multiplying by `Δt·60` keeps the build-up consistent across refresh rates. the chosen strength behaves like a per-frame value at 60hz, even when the display runs faster or slower.

  

---

  

###  05 title

  

the 240hz bug

  

###  05 body

  


the mask should fade at the same speed on every display. each frame subtracts `Δt / 2.5s` from its stored value: about 0.0067 at 60hz, but only 0.0017 at 240hz.

the first version stored the mask in an 8-bit texture. that format has only 256 possible values, separated by steps of roughly 0.0039.

at 240hz, the requested fade of 0.0017 is smaller than half of one available step. the value rounds back to where it started, so a fully revealed pixel remains fully revealed forever. even at 60hz, rounding makes the fade roughly 15% faster than intended.

the solution was to store the mask as a 16-bit floating-point texture, or `R16F`. its values are spaced much more closely, so each small fade survives when the result is written back.

  

###  05 fig. 6 caption

  

select 240hz and zoom into the top 5%. the 8-bit value rounds back to 1 on every frame, while the half-float value continues to fall.

  

###  05 fig. 6 controls

  

refresh rate · zoom (full / top 5%) · fade requested per frame · 8-bit fade time · half-float fade time · swatches: ideal / half-float / 8-bit

  

###  05 math notes

  

webgl2 can render to an `R16F` texture when `EXT_color_buffer_float` is available. if the browser does not support that extension, the site falls back to `RGBA8`.

  

---

  

###  06 title

  

making the edge look like ink

  

###  06 body

  


the mask alone produces a smooth, regular outline. that's useful for a digital brush, but real ink doesn't spread through paper evenly.

to break up the edge, the display shader generates **value noise**: random values placed on a grid and smoothly blended together. one layer creates broad, soft variation.

the shader then combines several layers at different scales. each layer is finer and weaker than the one before it. this technique is called **fractal Brownian motion**, or **fbm**, and it creates detail at several sizes without losing the larger shapes.

the noise slightly raises or lowers the mask before the reveal threshold is applied. that moves different parts of the boundary inward or outward, creating the irregular ink edge.

finally, `fwidth` measures how quickly the value changes across a screen pixel. the shader uses that measurement to soften the boundary by about 1.5 pixels, preventing jagged edges whether the mask is sharp, faint, large, or small.

  

###  06 fig. 7 caption

  

start with no noise, then add the layers one at a time. disable antialiasing and inspect the enlarged edge in the loupe.

  

###  06 fig. 7 loupe label

  

magnified edge · pixel smoothing disabled

  

###  06 fig. 7 warning (shows when the noise is too high)

  

the noise is now strong enough to push untouched areas above the reveal threshold, creating stray speckles.

  

###  06 fig. 7 controls

  

noise layers · reveal threshold · noise strength · view (final image / mask field) · antialiasing (on / off)

  

---

  

###  end

  

put together, the effect is a small rendering loop with a few carefully chosen details: a texture that remembers, a brush that follows the cursor, curves that connect each frame, and noise that turns a digital boundary into ink.

the shaders themselves are only about 150 lines. most of the work was not making the effect possible, moreso the small decisions that made it feel natural.

  

###  end: your note (currently a visible placeholder on the site)

  

i’d still like to explore how the reveal could react to pressure, acceleration, or the texture of different kinds of paper.

  

###  end: links

  

- source on github →

- back to the site

  

###  math toggle button

  

+ show the math / − hide the math

  

---

  

##  screen-reader-only text (optional)

  

Nobody sees these on screen. Screen readers read them aloud. Worth a quick look if you want your voice everywhere, and fine to skip.

  

- main drawing alt text: Hand-drawn animated scene

- nav landmark: Story navigation

- name in nav: ryan kim, home

- ♪ button: Show piano player

- piano player: Expand player / Collapse player / Close player

- carousel: Previous {project} media / Next {project} media / Show {project} media {n}

- this website video title: Timelapse of drawing

- this website image alt: Old portfolio website screenshot

- rebase image alts: Rebase screenshot 1 … 4

- mango video title: Mango full-body gesture control demo

- tldr dialog: tldr — about ryan kim

- explainer dialog: how the ink reveal works

- close buttons: close

- fig. 1 canvas: live reveal: move the pointer over the drawing to paint

- fig. 2 canvas: live reveal, two panes: the composite on the left, its mask texture on the right. paint on either side.

- fig. 2 diagram: diagram: reading texture a, writing texture b / diagram: reading texture b, writing texture a

- fig. 3 canvas: drag the three points to reshape the brush's path; hover to probe the paint falloff at a pixel

- fig. 3 plot: falloff curve: paint versus distance from the segment

- fig. 4 canvas: brush-following demo: move the pointer over the pad, or watch the autopilot when idle

- fig. 5 canvas: the mask field: move the pointer, or watch the autopilot alternate fast strokes with resting

- fig. 6 chart: mask value over time at three storage precisions: ideal, half-float, and 8-bit

- fig. 7 canvas: live reveal with adjustable edge noise: move the pointer over the drawing, or watch the autopilot

- fig. 7 loupe: zoomed, unsmoothed view of the edge around the brush