# Ryan Kim - Portfolio Website

A hand-drawn, navigation-driven portfolio where every section is an illustrated scene and animated frame sequences carry you between them — more short film than web page.

I am a junior Computer Engineering student at UBC, and I built this site to combine illustration, interaction design, and frontend engineering in one place.

## Live Site

- Add your URL here: `https://imryan.kim

## What This Site Is

This portfolio is one continuous hand-drawn world:

- a custom loading phase that preloads core assets
- a landing + train sequence
- an interactive About section with a cursor-based reveal effect
- a Projects section whose illustrated scenes you move through
- an Experience section as the final stop

A persistent story nav — which doubles as a progress indicator — is the only way to move around: clicking a node plays the hand-drawn frame sequences forward or backward to transition between sections. There is no scrolling.

## Featured Projects Inside

- **This Website**: custom nav-driven frame-by-frame scene engine in Next.js/React
- **Rebase**: AI-native resume builder
- **Mango**: webcam full-body gesture controls for games

## Stack

- Next.js 15
- React 19
- TypeScript
- Custom WebGL2 shaders (`RevealFluid` + the SDF liquid cursor)

## Implementation Notes

- Scene orchestration lives in `src/components/StoryPlayer.tsx`
- The story data model (stops, nav, content) lives in `src/components/story/storyData.ts`
- WebGL reveal effect lives in `src/components/RevealFluid.tsx`
- The WebGL2 SDF liquid cursor lives in `src/components/CustomCursor.tsx`
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
- `public/`: other media (project images, video, reference assets, resume)

