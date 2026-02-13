# Ryan Kim - Portfolio Website

A hand-drawn, scroll-driven portfolio that feels more like moving through a short film than clicking through pages.

I am a sophomore Computer Engineering student at UBC, and I built this site to combine illustration, interaction design, and frontend engineering in one place.

## Live Site

- Add your URL here: `https://imryan.kim

## What This Site Is

This portfolio is one continuous animated scene:

- a custom loading phase that preloads core assets
- a landing + train sequence
- an interactive About section with a cursor-based reveal effect
- a Projects section that transitions through illustrated scenes
- a sticky music player with waveform controls

Everything is intentionally linear and story-like so the experience feels guided, not just navigated.

## Featured Projects Inside

- **This Website**: custom scroll-state scene engine in Next.js/React
- **Rebase**: AI-native resume builder
- **Mango**: webcam full-body gesture controls for games

## Stack

- Next.js 15
- React 19
- TypeScript
- WaveSurfer.js
- Custom WebGL2 shader (`RevealFluid`)

## Implementation Notes

- Scene orchestration lives in `src/components/ScrollScenePlayer.tsx`
- WebGL reveal effect lives in `src/components/RevealFluid.tsx`
- Audio UI lives in `src/components/StickyAudioPlayer.tsx`
- App entry points are `app/page.tsx` and `app/layout.tsx`

## Performance Work

Recent improvements:

- Converted heavy scene assets to WebP
- Added startup preloading before intro playback
- Added windowed preloading as phases progress
- Switched scene fitting behavior to keep the full drawing visible (`contain`)
- Added a loading overlay transition so users do not see partially loaded UI

## Local Development

Requirements:

- Node.js 20+
- pnpm

```bash
pnpm install
pnpm dev
```

Other useful commands:

```bash
pnpm build
pnpm start
pnpm lint
pnpm exec tsc --noEmit
```

## Project Structure

- `app/`: Next.js app router entry files
- `src/components/`: core interactive components
- `public/Animation/`: frame-by-frame scene images
- `public/`: other media (audio, project images, reference assets, resume)

