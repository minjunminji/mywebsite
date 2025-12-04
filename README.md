# Ryan Kim — Personal Website

An interactive, single‑page portfolio built with Next.js that uses a hand‑drawn desk illustration as the main navigation. Visitors can pan/zoom around the SVG and click hotspots to open contextual popups linking to projects, music, resume, and social profiles.

Live stack: Next.js App Router, React, CSS Modules, Tailwind (via PostCSS), and react‑zoom‑pan‑pinch for the canvas interactions.

## Features

- Interactive SVG desk map with smooth pan/zoom
- Clickable hotspots that open styled popups
- External links to projects, resume, YouTube, GitHub, LinkedIn, Instagram
- App Router structure with custom fonts (Geist, JetBrains Mono)
- SVGR enabled to import SVGs as React components when needed

## Tech Stack

- Framework: Next.js 15 (App Router)
- UI: React 19, CSS Modules, Tailwind CSS 4 (via `@tailwindcss/postcss`)
- Interactions: `react-zoom-pan-pinch`
- Tooling: ESLint (flat config), JS path aliases (`@/*`)
- SVG tooling: `@svgr/webpack` (configured in `next.config.mjs`)

## Getting Started

Prerequisites: Node.js (LTS recommended) and npm.

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Open http://localhost:3000 to view the site.

Build for production:

```bash
npm run build
npm start
```

Lint:

```bash
npm run lint
```

## Project Structure

- `src/app/layout.js` — Global HTML shell, fonts, metadata
- `src/app/page.js` — Home route; renders the interactive desk
- `src/app/globals.css` — Global sizing/layout styles
- `src/components/DeskDrawing.js` — Core interactive SVG viewer and popup logic
- `src/components/DeskDrawing.module.css` — Layout/styles for the viewer
- `src/components/Popup.js` & `Popup.module.css` — Popup UI component and styles
- `public/assets/deskdrawing.svg` — Main desk illustration (hotspots live here)
- `public/assets/websiteresume.pdf` — Resume served via the “Resume” hotspot
- `public/assets/referenceimage.jpg` — Reference image shown in a popup

## Editing Content

Hotspots and popup content are defined in `src/components/DeskDrawing.js`:

- The `popupsData` object maps hotspot IDs to React content shown in popups.
- Click handling matches the clicked SVG group’s `id` to a key in `popupsData`.
- Special cases like `Resume`, `Github`, `Linkedin`, etc., open external links.

Updating hotspots in the SVG:

1. Open `public/assets/deskdrawing.svg` in an editor (or a vector tool).
2. Wrap clickable regions in `<g id="Your-Hotspot-Id"> ... </g>` groups.
3. Ensure each group’s `id` matches a key in `popupsData` (or a handled special case).

Styling:

- Viewer/container styles live in `DeskDrawing.module.css`.
- Popup look-and-feel is in `Popup.module.css`.
- Global full-viewport sizing is in `src/app/globals.css`.

## Configuration

- `next.config.mjs`: Adds an SVGR rule for importing `.svg` files as React components when needed.
- `eslint.config.mjs`: Flat config extending `next/core-web-vitals` with common ignores.
- `postcss.config.mjs`: Enables Tailwind via `@tailwindcss/postcss` plugin.
- `jsconfig.json`: Path alias `@/*` → `./src/*`.

## Notes

- Fonts are loaded with `next/font/google` (Geist, Geist Mono, JetBrains Mono).
- The viewer calculates an initial transform to center the SVG and scales to fit.
- Large assets are served from `public/` for simplicity.
