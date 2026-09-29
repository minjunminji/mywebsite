# Portfolio performance audit — 2026-09-29

The largest opportunities are desktop image scheduling and time to usable navigation. Mobile text renders quickly, but unnecessary asset weight remains. JavaScript bundle size is a secondary concern.

## Scope and measurements

Reviewed the local Next.js source, built production output, and exercised https://www.imryan.kim/ in Chromium. No application code was changed. Live deployment and local source were not proven to be the same commit, although the relevant asset sizes and observed behavior agree.

Fresh browser contexts used desktop 1440×900 at DPR 2 and mobile 390×844 at DPR 3. Each configuration was sampled once; these are diagnostic lab observations, not Lighthouse scores or real-user Core Web Vitals. Mobile is browser emulation, not a physical phone. No field INP measurement was collected.

| Observation | Desktop | Mobile |
| --- | --- | --- |
| Unthrottled observed LCP | 312 ms | 364 ms |
| Throttled observed LCP | 8,488 ms | 684 ms |
| Throttled first contentful paint | 732 ms | 684 ms |
| Throttled navigation pointer-interactive | 8,474 ms | Not applicable |
| Layout shifts during sampled loads | None | None |

Throttle settings: 1.6 Mbps download, 0.75 Mbps upload, 150 ms latency, 4× CPU slowdown. Sampling continued for 16 seconds after DOMContentLoaded. Desktop scene and background images were still incomplete at the end, so the desktop LCP is provisional and the completed-resource byte count would understate total downloads. Mobile completed 20 resource entries totaling 1,261,923 encoded body bytes, excluding the document and HTTP overhead. Both throttled samples recorded one 54 ms long task.

Production build succeeded with image-element lint warnings and a workspace-root warning. Next.js reported a static home route, 22.3 kB route size and 128 kB first-load JavaScript. Build completion does not measure runtime animation smoothness.

## Findings, ordered by priority

### 1. High: desktop requests the entire animation library immediately

Evidence: `src/components/StoryPlayer.tsx:160` loops over `ALL_PRELOAD_FRAMES` and creates an image request for every asset. The list at the end of `src/components/story/storyData.ts` contains 91 assets totaling 7,424,815 bytes locally. These include transitions, project stills, About reference art, and invisible project backgrounds that are unnecessary for the opening scene.

Playback starts on timers without waiting for image load or decode. In the throttled live sample, even the currently displayed train-loop image remained incomplete after the sampling window. The 7.42 MB payload alone represents about 37 seconds of transfer at 1.6 Mbps, ignoring overhead; this is a bandwidth calculation, not a measured load time.

Recommendation: prioritize the first visible frame and a small decoded intro buffer; schedule subsequent intro frames ahead of playback; defer other scenes with bounded concurrency and prefetch the next likely transition. Do not solve this by blocking all content until the entire library loads. Keep a decoded frame visible when the next one is unavailable.

### 2. High: navigation has a built-in startup delay

Evidence: `src/components/StoryPlayer.tsx:168` runs four landing frames twice at 180 ms per frame, then 20 train frames at 12 FPS. `src/components/story/StoryNav.tsx:65` adds a 750 ms delay and 800 ms fade before enabling pointer interaction. The nominal delay is approximately 4.66 seconds after the intro effects start, before resource and scheduling delays. The TLDR control uses a similar gate.

Recommendation: expose a usable TLDR/skip control immediately, let the intro continue behind usable navigation, and skip or shorten the intro for reduced-motion preferences and repeat visits. Validate time to usable controls separately from LCP: a fast first illustration does not mean the portfolio content is accessible yet.

### 3. Medium: favicon and mobile artwork dominate avoidable transfer

Evidence: `public/favicon.png` is 512×512 and 404,252 bytes. The four mobile landing-loop WebPs total 506,362 bytes and are 1920×1080 each. `src/components/mobile/MobileTldr.tsx:84` mounts all four full frames and crops them through CSS. Together, the favicon and loop comprise about 72% of the measured mobile resource-body bytes.

Recommendation: generate an appropriately sized favicon and separate mobile artwork cropped and resized for its actual rendered dimensions. Preserve sufficient resolution for high-DPR screens. Use a single still for reduced motion, and avoid loading unused animation frames in that mode. Current reduced-motion handling stops the timer but still mounts all four images.

### 4. Medium: hidden carousel video continues playing

Evidence: `src/components/StoryPlayer.tsx:811` gives every carousel video `autoPlay`, `loop`, and `preload="auto"`, while visibility is controlled only by opacity. On the live site, switching “this website” to media 2 left the timelapse at opacity 0 with `paused: false`; playback advanced from 5.141 to 6.642 seconds during a 1.5-second observation. The source timelapse is 17.36 MB; the Mango video is 18.22 MB. Those file sizes are not claims that browsers download each whole file immediately.

Recommendation: pause inactive media and media covered by overlays; start playback only for the active visible slide. Use poster images and conservative preloading, and evaluate lower-bitrate/resolution encodes against the displayed pane size.

### 5. Medium: About renders continuously at uncapped device resolution

Evidence: `src/components/RevealFluid.tsx:153` multiplies canvas dimensions by the full device pixel ratio. Its animation loop always paints the mask and composites the full canvas, even with a stationary pointer. The live About page produced 512 WebGL draw calls during approximately two seconds of observation without further pointer movement. This demonstrates continuous work, not measured GPU utilization or frame drops. At DPR 2 the full-screen canvas has four times as many pixels as at DPR 1.

The mask is already half resolution, and the separate custom cursor already uses a bounded canvas, caps DPR, and sleeps when the free dot settles. Keep those optimizations.

Recommendation: cap or adapt About rendering resolution, pause it when covered by the TLDR overlay, and sleep when the pointer is inactive and the mask has fully faded. Preserve drawing while a visible brush or animated edge still needs updates. Profile on actual integrated-GPU/high-refresh devices before choosing a quality cap.

### 6. Medium: static artwork requires browser revalidation

Evidence: live responses for `/Animation/train1.webp` and `/favicon.png` use `Cache-Control: public, max-age=0, must-revalidate`. This does not prove repeat visits re-download every body; valid cached bodies can be reused after revalidation. It does mean these URLs lack a long browser freshness lifetime.

Recommendation: version or fingerprint assets, then give those immutable URLs a long cache lifetime. Keep revalidation for unversioned filenames that may change. Next.js documents the default public-folder caching behavior: https://nextjs.org/docs/app/api-reference/file-conventions/public-folder.

## Lower-priority code opportunities

- `src/components/mobile/ResponsiveStory.tsx:4` statically imports the desktop story. Both mobile and desktop downloaded the same initial application chunks. Split desktop-only code, while preserving server-rendered mobile content and correct hydration. `PianoContext.tsx` also statically imports the optional player implementation, although it correctly defers the actual YouTube embed until requested.
- `src/components/story/useFramePlayer.ts:121` updates React state every animation frame for navigation fill, causing the owning story component to render at display refresh rate even though artwork advances at 12 or 24 FPS. Consider isolating this update in the nav or driving just the fill property imperatively. No React profiler attribution was collected, so prioritize this after confirmed bandwidth issues.
- The README describes windowed preloading and a loading phase that do not match the current all-at-once preloader. Update the documentation alongside a preload change.

## Recommended sequence and verification

1. Resize the favicon; pause hidden video.
2. Implement prioritized, bounded frame loading with decode readiness.
3. Make navigation or TLDR immediately available.
4. Generate smaller mobile art and improve versioned-asset caching.
5. Profile and tune About rendering; then consider desktop code splitting and nav render isolation.

Repeat cold and warm desktop/mobile runs after changes. Compare transfer bytes, time to usable navigation, incomplete displayed frames, hidden-video playback, and idle GPU work. Check both forward/backward scene transitions and fast multi-stop navigation. Use real-user LCP/INP/CLS data for population-level conclusions; these lab samples alone cannot establish a Core Web Vitals pass.

## First implementation pass — `perf/portfolio-loading`

Implemented a shared four-request frame queue with a six-frame look-ahead, decoding before playback and skipping failed frames. Intro and scene transitions retain their current drawing while a requested frame loads. Unrelated scenes and project backgrounds no longer load during startup. TLDR is immediately accessible, including while the intro waits for images. Reduced-motion visitors skip the desktop intro and rest-loop animation.

Project videos now pause on inactive slides, during scene transitions, under overlays, and when the document is hidden. About rendering caps DPR at 2 and stops while an overlay covers it. Mobile uses cropped 960×260 WebPs, loading extra frames near the artwork only when motion is allowed. The favicon is now a separate 48×48 asset. The original source assets remain available.

Asset generation: the favicon was resized with Sharp to 48×48 PNG; mobile frames were cropped at `{left:0, top:490, width:1920, height:520}`, resized to 960×260, and encoded as WebP at quality 85 from the original desktop WebPs.

Measured on the local production build:

- Favicon: 404,252 → 6,660 bytes (98% smaller).
- Four mobile frames: 506,362 → 206,714 bytes (59% smaller).
- Mobile completed resource bodies: approximately 565 KB, or 410 KB with reduced motion. The live baseline was 1.26 MB; deployment compression and timing can differ from localhost. Neither mobile sample requested desktop animation frames.
- Desktop startup: approximately 3.62 MB of image bodies; no About, transition, or project-background requests before navigation.
- At 1.6 Mbps, 150 ms latency, and 4× CPU slowdown, TLDR opened at 497 ms in one local sample. The displayed drawing was complete when sampled five seconds later. This does not claim the entire intro completed that quickly.
- Hidden timelapse paused, resumed when selected, and paused under TLDR. Mango playback and forward/backward scene navigation passed. Intentionally aborting `train5.webp` and `1trans2.webp` did not block later navigation.
- At device DPR 3, About used a 2880×1800 backing canvas for a 1440×900 viewport. No WebGL draw calls were observed during a 500 ms sample with TLDR covering About and the cursor settled.
- The core desktop flow produced no page exceptions. Mobile had no horizontal overflow.
- All 93 unit tests passed. Production build passed with the existing image-element and workspace-root warnings; first-load JavaScript is now 129 kB (previously 128 kB).

Still deferred: fingerprinted long-lived asset caching, desktop code splitting, nav render isolation, video re-encoding, and sleeping the visible About shader after its mask fully fades. Full scene navigation still follows the intro; TLDR provides immediate access to the portfolio content. These changes have not been deployed.
