# Nav-Driven Story Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the scroll-driven hand-drawn animation with a navigation-driven experience where a persistent story-nav (doubling as a progress indicator) is the only control, playing the existing frame sequences forward/reverse at a fixed framerate.

**Architecture:** Incremental extraction. A pure `buildFrameQueue` function + a `useFramePlayer` hook own the new control model; a data-driven `<StoryNav>` renders the progress bar; a new `<StoryPlayer>` reuses the existing rendering (frame `<img>`, about text, project side-panels, corner menu) but is driven by the hook instead of scroll. Scroll is removed entirely.

**Tech Stack:** Next.js 15 (app router), React 19, TypeScript, wavesurfer.js (unchanged). Vitest added (dev-only) to TDD the one piece of pure logic.

**Companion design doc:** `docs/plans/2026-06-27-nav-driven-story-design.md`

**Conventions in this repo:**
- Path alias `@/*` → `src/*`.
- Components live in `src/components`. All styling is inline-style objects (no CSS modules); the ink color is `#1f1812`, font `'Cascadia Mono', monospace`, background `#f6f2ea`.
- Package manager is **pnpm**. Run all commands from the worktree root: `C:\Users\ryank\Documents\Code\mywebsite\.worktrees\nav-driven-story`.
- No test suite exists. Verification per task uses, as appropriate: `pnpm exec tsc --noEmit` (typecheck), `pnpm lint`, `pnpm vitest run` (pure tests), and a manual dev-server visual check (`pnpm dev`).
- Pre-existing lint state: only `@next/next/no-img-element` **warnings** (expected — keep using `<img>`; `next/image` fights frame animation). Treat warnings as the clean baseline; zero new **errors** is the bar.

---

## Task 1: Add Vitest for pure-logic tests

**Files:**
- Modify: `package.json`

**Step 1: Install vitest (dev)**

Run: `pnpm add -D vitest`
Expected: vitest added under devDependencies, lockfile updated.

**Step 2: Add the test script**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

**Step 3: Verify it runs (no tests yet)**

Run: `pnpm vitest run`
Expected: exits 0 with "No test files found" (acceptable for this step).

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "Add vitest for pure-logic unit tests"
```

---

## Task 2: Story data module

The single source of truth for frame lists, stops, segments, nav, and section content. Pure data + tiny helpers — no React.

**Files:**
- Create: `src/components/story/storyData.ts`

**Step 1: Create the file**

```ts
// Pure data model for the nav-driven story. No React here.

// --- Frame asset lists (reused verbatim from the original ScrollScenePlayer) ---
export const landingFrames = [
  '/Animation/landingloop1.png',
  '/Animation/landingloop2.png',
  '/Animation/landingloop3.png',
  '/Animation/landingloop4.png',
] as const;

export const trainSequenceFrames = Array.from(
  { length: 20 },
  (_, i) => `/Animation/train${i + 1}.png`,
);

export const trainLoopFrames = [
  '/Animation/trainloop1.png',
  '/Animation/trainloop2.png',
  '/Animation/trainloop3.png',
  '/Animation/trainloop4.png',
] as const;

export const aboutFrames = [
  '/Animation/aboutloop1.png',
  '/Animation/aboutloop2.png',
  '/Animation/aboutloop3.png',
  '/Animation/aboutloop4.png',
] as const;

export const trans1Frames = Array.from({ length: 25 }, (_, i) => `/Animation/1trans${i + 1}.png`);
export const trans2Frames = Array.from({ length: 22 }, (_, i) => `/Animation/2trans${i + 1}.png`);
export const turnstileFrames = Array.from({ length: 6 }, (_, i) => `/Animation/turnstile${i + 1}.png`);
export const turnstileBackgroundFrame = '/turnstile_background.png';

export const projectStills = {
  thisWebsite: '/Animation/thiswebsite.png',
  rebase: '/Animation/rebase.png',
  mango: '/Animation/mango.png',
} as const;

// --- Stops: the flat, ordered player timeline ---
export type StopId = 'landing' | 'about' | 'thisWebsite' | 'rebase' | 'mango';

export type Stop = {
  id: StopId;
  loop?: readonly string[]; // animated rest frames (landing, about)
  still?: string; // static rest frame (projects)
  isProject?: boolean;
};

export const STOPS: readonly Stop[] = [
  { id: 'landing', loop: trainLoopFrames },
  { id: 'about', loop: aboutFrames },
  { id: 'thisWebsite', still: projectStills.thisWebsite, isProject: true },
  { id: 'rebase', still: projectStills.rebase, isProject: true },
  { id: 'mango', still: projectStills.mango, isProject: true },
];

// SEGMENTS[i] is the frame sequence connecting STOPS[i] -> STOPS[i+1]
export const SEGMENTS: readonly (readonly string[])[] = [
  trans1Frames, // landing -> about
  trans2Frames, // about -> thisWebsite
  turnstileFrames, // thisWebsite -> rebase
  turnstileFrames, // rebase -> mango
];

export const stopIndexById = (id: StopId): number => STOPS.findIndex((s) => s.id === id);

// --- Nav: what the bar renders (landing is the implicit unfilled origin, not listed) ---
export type NavChild = { stopId: StopId; label: string };
export type NavEntry = { label: string; stopId: StopId; children?: readonly NavChild[] };

export const NAV: readonly NavEntry[] = [
  { label: 'about', stopId: 'about' },
  {
    label: 'projects',
    stopId: 'thisWebsite',
    children: [
      { stopId: 'thisWebsite', label: 'this website' },
      { stopId: 'rebase', label: 'rebase' },
      { stopId: 'mango', label: 'mango' },
    ],
  },
];

// --- Section content (moved verbatim from the original ScrollScenePlayer) ---
export const ABOUT_LINES = [
  "hi, i'm ryan!",
  "i'm a sophomore computer engineering student at the university of british columbia, and i love building things that make me or other people happy.",
  'in my spare time, i like to produce music, cook, and play soccer.',
] as const;

export type ProjectContent = {
  key: 'thisWebsite' | 'rebase' | 'mango';
  title: string;
  body: readonly string[];
  linkHref?: string;
  imageSrc?: string;
  imageAlt?: string;
  imageCaption?: string;
  carouselImages?: readonly { src: string; alt: string }[];
  videoEmbedSrc?: string;
  videoTitle?: string;
};

// NOTE: copy the full PROJECT_CONTENT array verbatim from the original
// src/components/ScrollScenePlayer.tsx (lines ~75-128) into here.
export const PROJECT_CONTENT: readonly ProjectContent[] = [
  /* ...copy verbatim... */
];

export type CornerLink = {
  key: 'github' | 'linkedin' | 'resume';
  label: string;
  href: string;
  icon: 'external' | 'download';
  openInNewTab?: boolean;
  download?: boolean;
};

// NOTE: copy the full CORNER_LINKS array verbatim from the original (lines ~172-194).
export const CORNER_LINKS: readonly CornerLink[] = [
  /* ...copy verbatim... */
];

// All frames to preload on mount.
export const ALL_PRELOAD_FRAMES: readonly string[] = [
  ...landingFrames,
  ...trainSequenceFrames,
  ...trainLoopFrames,
  ...trans1Frames,
  ...aboutFrames,
  ...trans2Frames,
  ...turnstileFrames,
  turnstileBackgroundFrame,
  projectStills.thisWebsite,
  projectStills.rebase,
  projectStills.mango,
];
```

**Step 2: Fill the two `verbatim` arrays**

Open the original `src/components/ScrollScenePlayer.tsx`, copy the `PROJECT_CONTENT` array (≈lines 75–128) and `CORNER_LINKS` array (≈lines 172–194) into the placeholders above, unchanged.

**Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

**Step 4: Commit**

```bash
git add src/components/story/storyData.ts
git commit -m "Add story data model (stops, segments, nav, content)"
```

---

## Task 3: `buildFrameQueue` pure function (TDD)

The trickiest pure logic: concatenating the connecting frame sequences between two stops, reversed when moving backward. This is where an off-by-one ruins the feel — so test first.

**Files:**
- Create: `src/components/story/frameQueue.ts`
- Test: `src/components/story/frameQueue.test.ts`

**Step 1: Write the failing test**

Tests use fake, easily-readable segments (no dependency on real assets / aliases):

```ts
import { describe, expect, it } from 'vitest';
import { buildFrameQueue } from './frameQueue';

// 4 segments connecting 5 stops (0..4), each with distinct readable frames.
const seg = [
  ['a0', 'a1'], // 0 -> 1
  ['b0', 'b1', 'b2'], // 1 -> 2
  ['c0', 'c1'], // 2 -> 3
  ['d0', 'd1'], // 3 -> 4
];

describe('buildFrameQueue', () => {
  it('returns empty when from === to', () => {
    expect(buildFrameQueue(2, 2, seg)).toEqual([]);
  });

  it('forward single segment', () => {
    expect(buildFrameQueue(0, 1, seg)).toEqual(['a0', 'a1']);
  });

  it('forward across multiple segments (no stop at intermediate)', () => {
    expect(buildFrameQueue(0, 2, seg)).toEqual(['a0', 'a1', 'b0', 'b1', 'b2']);
  });

  it('forward across the project turnstiles', () => {
    expect(buildFrameQueue(2, 4, seg)).toEqual(['c0', 'c1', 'd0', 'd1']);
  });

  it('backward single segment plays reversed', () => {
    expect(buildFrameQueue(1, 0, seg)).toEqual(['a1', 'a0']);
  });

  it('backward across multiple segments plays each reversed, in reverse order', () => {
    expect(buildFrameQueue(2, 0, seg)).toEqual(['b2', 'b1', 'b0', 'a1', 'a0']);
  });

  it('does not mutate the source segments', () => {
    buildFrameQueue(2, 0, seg);
    expect(seg[1]).toEqual(['b0', 'b1', 'b2']);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm vitest run src/components/story/frameQueue.test.ts`
Expected: FAIL — `buildFrameQueue` not found / module missing.

**Step 3: Write the minimal implementation**

```ts
// Builds the ordered list of frames to play when moving from one stop to
// another. Forward = segments concatenated in order; backward = each crossed
// segment reversed, in reverse order. Skipped stops are passed straight
// through (their frames are included, but the caller never parks there).
export function buildFrameQueue(
  from: number,
  to: number,
  segments: readonly (readonly string[])[],
): string[] {
  if (from === to) {
    return [];
  }

  const queue: string[] = [];

  if (to > from) {
    for (let s = from; s < to; s += 1) {
      queue.push(...segments[s]);
    }
  } else {
    for (let s = from - 1; s >= to; s -= 1) {
      queue.push(...[...segments[s]].reverse());
    }
  }

  return queue;
}
```

**Step 4: Run to verify it passes**

Run: `pnpm vitest run src/components/story/frameQueue.test.ts`
Expected: PASS (7 tests).

**Step 5: Commit**

```bash
git add src/components/story/frameQueue.ts src/components/story/frameQueue.test.ts
git commit -m "Add buildFrameQueue with tests (forward/reverse/skip)"
```

---

## Task 4: `useFramePlayer` hook

Owns playback state and the single `navigateTo` action. Parked → animates the current stop's rest loop. Transitioning → steps through the queue at a fixed FPS, then arrives.

**Files:**
- Create: `src/components/story/useFramePlayer.ts`

**Step 1: Create the hook**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SEGMENTS, STOPS } from '@/components/story/storyData';
import { buildFrameQueue } from '@/components/story/frameQueue';

const LOOP_INTERVAL_MS = 180;
const PLAYBACK_FPS = 12;

function restFrame(index: number): string {
  const stop = STOPS[index];
  return stop.loop?.[0] ?? stop.still ?? '';
}

export type FramePlayer = {
  currentStop: number;
  /** Where we're parked, or heading during a transition. Drives the nav. */
  position: number;
  isTransitioning: boolean;
  displayFrame: string;
  navigateTo: (target: number) => void;
};

/**
 * @param active when false (during the intro) the hook stays idle so the
 * parked rest-loop doesn't run and steal the displayed frame.
 */
export function useFramePlayer(active: boolean): FramePlayer {
  const [currentStop, setCurrentStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayFrame, setDisplayFrame] = useState(restFrame(0));

  const queueRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const targetRef = useRef(0);

  // Parked: animate the current stop's rest loop (or hold its still).
  useEffect(() => {
    if (!active || isTransitioning) {
      return;
    }

    const stop = STOPS[currentStop];

    if (!stop.loop) {
      setDisplayFrame(stop.still ?? '');
      return;
    }

    const frames = stop.loop;
    let frame = 0;
    setDisplayFrame(frames[0]);

    const id = window.setInterval(() => {
      frame = (frame + 1) % frames.length;
      setDisplayFrame(frames[frame]);
    }, LOOP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [active, isTransitioning, currentStop]);

  // Transitioning: step through the frame queue at a fixed FPS.
  useEffect(() => {
    if (!isTransitioning) {
      return;
    }

    let rafId = 0;
    let previous = 0;
    const frameDuration = 1000 / PLAYBACK_FPS;

    const tick = (timestamp: number) => {
      if (previous === 0) {
        previous = timestamp;
      }

      if (timestamp - previous >= frameDuration) {
        previous = timestamp;
        const queue = queueRef.current;

        if (queueIndexRef.current >= queue.length) {
          setCurrentStop(targetRef.current);
          setIsTransitioning(false);
          return;
        }

        setDisplayFrame(queue[queueIndexRef.current]);
        queueIndexRef.current += 1;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(rafId);
  }, [isTransitioning]);

  const navigateTo = useCallback(
    (next: number) => {
      if (isTransitioning || next === currentStop) {
        return; // ignore clicks mid-transition (v1)
      }

      const queue = buildFrameQueue(currentStop, next, SEGMENTS);
      targetRef.current = next;
      setTarget(next);

      if (queue.length === 0) {
        setCurrentStop(next);
        return;
      }

      queueRef.current = queue;
      queueIndexRef.current = 0;
      setIsTransitioning(true);
    },
    [currentStop, isTransitioning],
  );

  return {
    currentStop,
    position: isTransitioning ? target : currentStop,
    isTransitioning,
    displayFrame,
    navigateTo,
  };
}
```

**Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors. (The hook is exercised visually in Task 6.)

**Step 3: Commit**

```bash
git add src/components/story/useFramePlayer.ts
git commit -m "Add useFramePlayer hook (parked loops + queue playback)"
```

---

## Task 5: `<StoryNav>` component

Presentational progress bar. Reads `position`/`isTransitioning`, calls `navigateTo`. Centered on landing; docks to top once you leave; fills up to `position`; the projects node widens inline to reveal its 3 children.

**Files:**
- Create: `src/components/story/StoryNav.tsx`

**Step 1: Create the component**

```tsx
'use client';

import { NAV, STOPS, stopIndexById, type NavEntry } from '@/components/story/storyData';

const INK = '#1f1812';
const PALE = 'rgba(31, 24, 18, 0.28)';

type StoryNavProps = {
  position: number; // current/target stop index
  visible: boolean; // false during the intro
  isTransitioning: boolean;
  onNavigate: (stopIndex: number) => void;
};

export default function StoryNav({ position, visible, isTransitioning, onNavigate }: StoryNavProps) {
  const docked = position !== 0;
  const projectsExpanded = position >= stopIndexById('thisWebsite');

  const nodeColor = (stopIndex: number) => (position >= stopIndex ? INK : PALE);
  const connectorColor = (stopIndex: number) => (position >= stopIndex ? INK : PALE);

  const handleClick = (stopIndex: number) => {
    if (isTransitioning) {
      return;
    }
    onNavigate(stopIndex);
  };

  return (
    <nav
      aria-label="Story navigation"
      style={{
        position: 'fixed',
        left: '50%',
        top: docked ? '1.6rem' : '50%',
        transform: docked ? 'transl(-50%, 0)'.replace('transl', 'translate') : 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        gap: docked ? '0.55rem' : '0.9rem',
        fontFamily: "'Cascadia Mono', monospace",
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'lowercase',
        fontSize: docked ? 'clamp(0.78rem, 1vw, 0.95rem)' : 'clamp(1.05rem, 1.8vw, 1.6rem)',
        opacity: visible ? 1 : 0,
        transition:
          'top 520ms cubic-bezier(0.65,0,0.35,1), font-size 520ms ease, gap 520ms ease, opacity 360ms ease',
        pointerEvents: visible && !isTransitioning ? 'auto' : 'none',
        userSelect: 'none',
        zIndex: 25,
        whiteSpace: 'nowrap',
      }}
    >
      {NAV.map((entry: NavEntry, entryIndex) => {
        const entryStopIndex = stopIndexById(entry.stopId);
        const isProjects = Boolean(entry.children);

        return (
          <div key={entry.label} style={{ display: 'flex', alignItems: 'center', gap: 'inherit' }}>
            {/* connector before each entry (the path filling in) */}
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: docked ? '2.2rem' : '3.2rem',
                height: '2px',
                background: connectorColor(entryStopIndex),
                transition: 'background 360ms ease, width 520ms ease',
              }}
            />
            {!isProjects || !projectsExpanded ? (
              <button
                type="button"
                onClick={() => handleClick(entryStopIndex)}
                style={navButtonStyle(nodeColor(entryStopIndex))}
              >
                {entry.label}
              </button>
            ) : (
              // Expanded projects: render the children inline (the bar gets wider).
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'inherit' }}>
                {entry.children!.map((child, childIndex) => {
                  const childStopIndex = stopIndexById(child.stopId);
                  return (
                    <span
                      key={child.stopId}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 'inherit' }}
                    >
                      {childIndex > 0 ? (
                        <span
                          aria-hidden
                          style={{
                            display: 'inline-block',
                            width: '1.8rem',
                            height: '2px',
                            background: connectorColor(childStopIndex),
                            transition: 'background 360ms ease, width 520ms ease',
                          }}
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleClick(childStopIndex)}
                        style={{
                          ...navButtonStyle(nodeColor(childStopIndex)),
                          fontSize: '0.82em',
                          // children animate in
                          opacity: 0,
                          animation: `storyChildIn 320ms ease forwards`,
                          animationDelay: `${childIndex * 90}ms`,
                        }}
                      >
                        {child.label}
                      </button>
                    </span>
                  );
                })}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function navButtonStyle(color: string): React.CSSProperties {
  return {
    border: 'none',
    background: 'transparent',
    padding: '0.1rem 0.15rem',
    margin: 0,
    cursor: 'pointer',
    color,
    fontFamily: 'inherit',
    fontWeight: 'inherit',
    fontSize: 'inherit',
    letterSpacing: 'inherit',
    textTransform: 'inherit',
    lineHeight: 1,
    transition: 'color 360ms ease',
  };
}
```

> Note: remove the `.replace(...)` hack in the snippet above — write the transform value directly as `docked ? 'translate(-50%, 0)' : 'translate(-50%, -50%)'`. (The hack is only here to flag that the docked transform keeps the X centering.)

**Step 2: Add the child-fade keyframe**

In `app/globals.css`, append:

```css
@keyframes storyChildIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 0 errors (img warnings only).

**Step 4: Commit**

```bash
git add src/components/story/StoryNav.tsx app/globals.css
git commit -m "Add StoryNav progress-bar component"
```

> The exact spacing/sizes/animation timing here are a first pass — expect to tune them by eye during Task 8's visual pass.

---

## Task 6: `<StoryPlayer>` — stage, intro, and player wiring

The new top-level component. Renders the intro, then the player-driven frame stage + the nav. **Defer** the about text and project side-panels to Task 7 so this task stays verifiable on its own.

**Files:**
- Create: `src/components/StoryPlayer.tsx`

**Step 1: Create the component (stage + intro + nav only)**

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  ALL_PRELOAD_FRAMES,
  landingFrames,
  trainSequenceFrames,
  turnstileBackgroundFrame,
} from '@/components/story/storyData';
import { useFramePlayer } from '@/components/story/useFramePlayer';
import StoryNav from '@/components/story/StoryNav';

const LANDING_LOOP_INTERVAL_MS = 180;
const TRAIN_SEQUENCE_INTERVAL_MS = 1000 / 12;
const LANDING_LOOP_REPEATS = 4;

type IntroPhase = 'landing' | 'trainSequence' | 'done';

export default function StoryPlayer() {
  const [introPhase, setIntroPhase] = useState<IntroPhase>('landing');
  const [introFrame, setIntroFrame] = useState(landingFrames[0]);

  const introDone = introPhase === 'done';
  const player = useFramePlayer(introDone);

  // Preload every frame once.
  useEffect(() => {
    ALL_PRELOAD_FRAMES.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  // Intro: landing loop x4 -> 20-frame train build -> hand off to player.
  useEffect(() => {
    if (introPhase === 'landing') {
      let frame = 0;
      let loops = 0;
      setIntroFrame(landingFrames[0]);
      const id = window.setInterval(() => {
        frame = (frame + 1) % landingFrames.length;
        setIntroFrame(landingFrames[frame]);
        if (frame === 0) {
          loops += 1;
          if (loops >= LANDING_LOOP_REPEATS) {
            window.clearInterval(id);
            setIntroPhase('trainSequence');
          }
        }
      }, LANDING_LOOP_INTERVAL_MS);
      return () => window.clearInterval(id);
    }

    if (introPhase === 'trainSequence') {
      let frame = 0;
      setIntroFrame(trainSequenceFrames[0]);
      const id = window.setInterval(() => {
        frame += 1;
        if (frame >= trainSequenceFrames.length) {
          window.clearInterval(id);
          setIntroPhase('done');
          return;
        }
        setIntroFrame(trainSequenceFrames[frame]);
      }, TRAIN_SEQUENCE_INTERVAL_MS);
      return () => window.clearInterval(id);
    }

    return undefined;
  }, [introPhase]);

  const onLanding = introDone && player.position === 0 && !player.isTransitioning;
  const useTrainBlend = !introDone || player.position === 0;
  const frame = introDone ? player.displayFrame : introFrame;
  const showTurnstileBg = player.position >= 2; // project stops

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: '#f6f2ea' }}>
      <img
        src={turnstileBackgroundFrame}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: showTurnstileBg ? 0.25 : 0,
          transition: 'opacity 320ms ease',
          zIndex: 0,
        }}
      />
      <img
        src={frame}
        alt="Hand-drawn animated scene"
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          userSelect: 'none',
          mixBlendMode: useTrainBlend ? 'multiply' : 'normal',
          zIndex: 1,
        }}
      />

      <StoryNav
        position={player.position}
        visible={introDone}
        isTransitioning={player.isTransitioning}
        onNavigate={player.navigateTo}
      />
    </div>
  );
}
```

**Step 2: Point the page at it (temporarily, to view it)**

Modify `app/page.tsx`:

```tsx
import StoryPlayer from '@/components/StoryPlayer';

export default function HomePage() {
  return (
    <main>
      <StoryPlayer />
    </main>
  );
}
```

**Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 0 errors.

**Step 4: Visual check**

Run: `pnpm dev`, open the printed localhost URL.
Expected:
- Intro plays: landing loop a few times, then the train build animation, once.
- Nav fades in centered showing `about —— projects`, all pale, train loop cycling behind.
- Click **about** → trans1 plays forward at a steady rate; nav animates up to the top and shrinks; the `about` node + its connector fill black; about loop cycles.
- Click **projects** → trans2 plays; the projects node expands inline into `this website / rebase / mango` (children animate in); turnstile background fades in.
- Click **mango** from `this website` → turnstile plays twice straight through (no stop at rebase).
- Click **about** from a project → sequences play in reverse; children collapse; fill recedes.
- Clicks during a transition do nothing.
- No scrollbar; page doesn't scroll.

Fix any issues before committing.

**Step 5: Commit**

```bash
git add src/components/StoryPlayer.tsx app/page.tsx
git commit -m "Add StoryPlayer: intro + frame stage + nav wiring"
```

---

## Task 7: Port section content (about text, project panels, corner menu)

Bring across the remaining UI from the original component, rewired to the player instead of scroll. Drop the removed pieces.

**Files:**
- Modify: `src/components/StoryPlayer.tsx`
- Reference (read-only): `src/components/ScrollScenePlayer.tsx`

**Step 1: About text (fires on arrival)**

- Add state: `const [aboutSeed, setAboutSeed] = useState(0);`
- Add an arrival effect:

```tsx
useEffect(() => {
  if (introDone && !player.isTransitioning && player.currentStop === 1) {
    setAboutSeed((s) => s + 1);
  }
}, [introDone, player.isTransitioning, player.currentStop]);
```

- Port the about `<section>` JSX from the original (≈lines 1011–1079) into the stage. Replace its visibility condition `opacity: phase === 'about' ? 1 : 0` with `opacity: onAbout ? 1 : 0`, where `const onAbout = introDone && !player.isTransitioning && player.currentStop === 1;`. Use `aboutSeed` in place of `aboutAnimationSeed`, and import `ABOUT_LINES` from storyData. Keep the existing `aboutCharFadeIn` keyframe (already in globals.css) and the `ABOUT_INITIAL_DELAY_MS` / `ABOUT_CHAR_STAGGER_MS` / `ABOUT_LINE_GAP_MS` constants (copy them into StoryPlayer).

**Step 2: Project side-panel (current project stop)**

- Port the project `<aside>` JSX (≈lines 1125–1479) plus the carousel state and helpers (`projectCarouselIndex`, `stepProjectCarousel`, `jumpProjectCarousel`, `hoveredProjectLink`) and `PROJECT_CONTENT` (now imported from storyData).
- Replace the panel visibility `opacity: phase === 'projects' ? 1 : 0` with `opacity: onProject ? 1 : 0`, where `const onProject = introDone && !player.isTransitioning && player.currentStop >= 2;`.
- Replace the old `projectBlocksRef` scroll-snap mechanism: instead of scrolling a tall block container by `projectBlockIndex`, render **only the current project's** content, chosen by `player.currentStop` (2→thisWebsite, 3→rebase, 4→mango). Map: `const activeProject = PROJECT_CONTENT[player.currentStop - 2];`. Delete `projectBlocksRef`, `projectBlockIndex`, and the effect that scrolled it.

**Step 3: Corner menu (top-left)**

- Port the corner-menu `<div>` JSX (≈lines 894–1010) plus its state (`isCornerMenuOpen`, `hoveredCornerLink`, `cornerMenuCloseTimeoutRef`, `openCornerMenu`, `closeCornerMenuWithDelay`) and import `CORNER_LINKS` from storyData.
- Replace the scroll-driven `cornerTitleOpacity` with: visible once you leave landing. Use `const cornerVisible = introDone && player.position !== 0;` and set the wrapper `opacity: cornerVisible ? 0.9 : 0`, `pointerEvents: cornerVisible ? 'auto' : 'none'`, with a `transition: 'opacity 360ms ease'`.

**Step 4: Confirm removed pieces are absent**

Ensure StoryPlayer does **not** contain: the "this website is a work in progress" text, the top scroll-progress bar, the "scroll!" hint, the wheel handler, the scroll handler, the scroll-lock effect, or any `*_VH` constant.

**Step 5: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 0 errors.

**Step 6: Visual check**

Run: `pnpm dev`. Verify:
- About text animates in char-by-char each time you arrive at `about` (including arriving again after leaving).
- Each project node shows its own content: `this website` (image + caption), `rebase` (carousel with working arrows/dots), `mango` (YouTube embed). Links open in new tabs.
- Corner menu hidden on landing; appears top-left after you leave; hover opens github/linkedin/resume.
- No WIP text, no progress bar, no scroll hint.

**Step 7: Commit**

```bash
git add src/components/StoryPlayer.tsx
git commit -m "Port about text, project panels, and corner menu to StoryPlayer"
```

---

## Task 8: Remove the old component and finalize

**Files:**
- Delete: `src/components/ScrollScenePlayer.tsx`
- Verify: `app/page.tsx` (already points at StoryPlayer from Task 6)

**Step 1: Delete the old component**

Run: `git rm src/components/ScrollScenePlayer.tsx`

**Step 2: Confirm nothing references it**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors (no dangling imports).

**Step 3: Full production build**

Run: `pnpm build`
Expected: build succeeds.

**Step 4: Full lint + tests**

Run: `pnpm lint && pnpm vitest run`
Expected: lint clean (img warnings only); 7 frameQueue tests pass.

**Step 5: Final visual tuning pass**

Run: `pnpm dev`. Walk every path (forward, backward, multi-skip, all 3 projects, return to landing). Tune StoryNav spacing/sizes/animation timing and the dock animation by eye until it feels right. Commit tuning separately if substantial.

**Step 6: Commit**

```bash
git add -A
git commit -m "Remove scroll-driven ScrollScenePlayer; finalize nav-driven story"
```

---

## Done criteria

- [ ] No scroll anywhere; fixed single screen.
- [ ] Intro plays once, then nav fades in centered.
- [ ] Clicking any node navigates (forward/reverse, multi-skip plays straight through); mid-transition clicks ignored.
- [ ] Nav docks to top on leaving landing; fills to current position; projects node expands inline into 3 children.
- [ ] About text fires on arrival; each project shows its own content panel; corner menu works.
- [ ] `pnpm build`, `pnpm lint`, `pnpm vitest run` all green.
- [ ] Adding an `experience` section later requires only new `STOPS` + `NAV` entries + transition frames.
```