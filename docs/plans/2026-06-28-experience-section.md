# Experience Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a text-only, monospace "experience" section to the nav-driven site — a résumé of three experiences whose bullets decrypt into place, with a software/product lens toggle and a year-anchored ripple-decryption entrance.

**Architecture:** `experience` becomes the final stop in the existing nav-driven player. Its transition is a generated morph/decrypt (not hand-drawn frames), so its `SEGMENTS` leg is empty and the animation lives in a new `ExperienceSection` component. The decryption *timing math* is extracted into a pure, unit-tested module (`decrypt.ts`); a thin `useDecrypt` hook drives it with `requestAnimationFrame`. Visual components are verified by running the app.

**Tech Stack:** Next.js 15, React 19, TypeScript, Inconsolata via `next/font/google`, Vitest (pure-logic tests), inline-style components (matches the codebase).

**Design reference:** `docs/plans/2026-06-28-experience-section-design.md`

**Conventions to match (read before starting):**
- `src/components/StoryPlayer.tsx` — inline styles, fixed 100vh stage, how `onAbout`/`activeProject` gate rendered sections.
- `src/components/story/storyData.ts` — `STOPS`, `SEGMENTS`, `NAV`, helpers.
- `src/components/story/useFramePlayer.ts` — `navigateTo`, `displayFrame`, parked vs. transitioning.
- `src/components/story/frameQueue.test.ts` — the unit-test style to mirror.
- Ink `#1f1812`, pale ink `rgba(31,24,18,0.28)`, cream `#f7f7f5`, lowercase voice.

---

## Task 1: Add the Inconsolata font

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Add the font import and variable**

In `app/layout.tsx`, import Inconsolata from `next/font/google` and attach its variable to `<html>` alongside Geist.

```tsx
import './globals.css';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { Inconsolata } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';

const inconsolata = Inconsolata({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '900'],
  variable: '--font-inconsolata',
  display: 'swap',
});

// ...metadata, viewport unchanged...

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${inconsolata.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

**Step 2: Verify it builds and the font is available**

Run: `pnpm lint`
Expected: no errors.

Run: `pnpm dev`, open the site, and in DevTools confirm `getComputedStyle(document.documentElement).getPropertyValue('--font-inconsolata')` is non-empty. Stop the server.

**Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: load Inconsolata for the experience section"
```

---

## Task 2: Experience data model (no NAV entry yet — keeps main reachable-state unchanged)

Add the stop, the empty segment, the content structure, and helpers. **Do not** add the `NAV` entry yet — that makes it reachable, and it has nowhere to render until Task 5. Everything here is inert until then.

**Files:**
- Modify: `src/components/story/storyData.ts`
- Test: `src/components/story/storyData.test.ts` (create)

**Step 1: Write the failing test**

Create `src/components/story/storyData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  STOPS,
  SEGMENTS,
  EXPERIENCE,
  LENSES,
  stopIndexById,
  isExperienceStop,
} from './storyData';

describe('experience stop', () => {
  it('is the last stop', () => {
    const idx = stopIndexById('experience');
    expect(idx).toBe(STOPS.length - 1);
    expect(idx).toBeGreaterThan(0);
  });

  it('has no loop or still (text only)', () => {
    const stop = STOPS[stopIndexById('experience')];
    expect(stop.loop).toBeUndefined();
    expect(stop.still).toBeUndefined();
    expect(stop.isExperience).toBe(true);
  });

  it('has an empty segment leading into it', () => {
    // SEGMENTS[i] connects STOPS[i] -> STOPS[i+1]; the leg into experience is empty.
    expect(SEGMENTS.length).toBe(STOPS.length - 1);
    expect(SEGMENTS[SEGMENTS.length - 1]).toEqual([]);
  });

  it('isExperienceStop matches only the experience index', () => {
    STOPS.forEach((_, i) => {
      expect(isExperienceStop(i)).toBe(i === stopIndexById('experience'));
    });
  });
});

describe('experience content', () => {
  it('has three entries, each with both lenses populated', () => {
    expect(EXPERIENCE).toHaveLength(3);
    for (const entry of EXPERIENCE) {
      expect(entry.year).toBeTruthy();
      expect(entry.company).toBeTruthy();
      expect(entry.title).toBeTruthy();
      for (const lens of LENSES) {
        expect(Array.isArray(entry.bullets[lens])).toBe(true);
        expect(entry.bullets[lens].length).toBeGreaterThan(0);
      }
    }
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/story/storyData.test.ts`
Expected: FAIL (exports don't exist yet).

**Step 3: Implement the data model**

In `src/components/story/storyData.ts`:

- Extend the `StopId` union with `'experience'`.
- Add `isExperience?: boolean` to the `Stop` type.
- Append the stop to `STOPS`:

```ts
  { id: 'mango', still: projectStills.mango, isProject: true },
  { id: 'experience', isExperience: true },
```

- Append an empty segment to `SEGMENTS` (mango -> experience, no frames):

```ts
export const SEGMENTS: readonly (readonly string[])[] = [
  trans1Frames,    // landing -> about
  trans2Frames,    // about -> thisWebsite
  turnstileFrames, // thisWebsite -> rebase
  turnstileFrames, // rebase -> mango
  [],              // mango -> experience (generated morph, not frames)
];
```

- Add the helper near `isProjectStop`:

```ts
export const isExperienceStop = (index: number): boolean =>
  STOPS[index]?.isExperience === true;
```

- Add the lens + content model (placeholders Ryan will replace — keep them
  obviously placeholder but realistic-length so layout/animation can be judged):

```ts
export type Lens = 'software' | 'product';
export const LENSES: readonly Lens[] = ['software', 'product'];

export type ExperienceEntry = {
  key: 'shopify' | 'sailbot' | 'paladin';
  year: string;     // anchor + ripple origin
  company: string;
  title: string;    // fixed across lenses
  bullets: Record<Lens, readonly string[]>;
};

// PLACEHOLDER bullets — Ryan supplies final copy. Bullet count may differ per lens.
export const EXPERIENCE: readonly ExperienceEntry[] = [
  {
    key: 'shopify',
    year: '2026',
    company: 'shopify',
    title: 'software engineer intern',
    bullets: {
      software: [
        'placeholder software bullet one for shopify, roughly one line long.',
        'placeholder software bullet two describing systems and impact here.',
      ],
      product: [
        'placeholder product bullet one for shopify framed around outcomes.',
        'placeholder product bullet two about users and metrics here.',
      ],
    },
  },
  {
    key: 'sailbot',
    year: '2025-2026',
    company: 'ubc sailbot',
    title: 'software website lead',
    bullets: {
      software: [
        'placeholder software bullet one for sailbot about the data pipeline.',
        'placeholder software bullet two about leading the web team.',
      ],
      product: [
        'placeholder product bullet one for sailbot framed around delivery.',
      ],
    },
  },
  {
    key: 'paladin',
    year: '2025',
    company: 'paladin technologies',
    title: 'systems engineering intern',
    bullets: {
      software: [
        'placeholder software bullet one for paladin about the etl pipeline.',
        'placeholder software bullet two about tooling and adoption.',
      ],
      product: [
        'placeholder product bullet one for paladin framed around process.',
        'placeholder product bullet two about stakeholders and rollout.',
      ],
    },
  },
];
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/story/storyData.test.ts`
Expected: PASS.

Run: `pnpm vitest run` (the whole suite — frameQueue must still pass)
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/story/storyData.ts src/components/story/storyData.test.ts
git commit -m "feat: add experience stop + content model to story data"
```

---

## Task 3: Pure decryption timing module

The math that decides, for any character at any time, whether it shows its final glyph or a scramble glyph — for both the **ripple** (entrance) and **scan** (toggle) modes. Pure, deterministic, no React/rAF/`Math.random` so it is fully unit-testable.

**Files:**
- Create: `src/components/experience/decrypt.ts`
- Test: `src/components/experience/decrypt.test.ts`

**Step 1: Write the failing test**

Create `src/components/experience/decrypt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  SCRAMBLE_CHARS,
  scrambleGlyph,
  rippleDelayMs,
  scanDelayMs,
  displayChar,
  renderLine,
} from './decrypt';

describe('scrambleGlyph', () => {
  it('is deterministic and always within the charset', () => {
    for (let s = 0; s < 200; s += 1) {
      const g = scrambleGlyph(s);
      expect(SCRAMBLE_CHARS).toContain(g);
      expect(scrambleGlyph(s)).toBe(g); // stable
    }
  });
});

describe('rippleDelayMs', () => {
  it('is zero at the origin and grows with distance', () => {
    expect(rippleDelayMs(3, 2, 3, 2, 10, 20, 1)).toBe(0);
    const near = rippleDelayMs(4, 2, 3, 2, 10, 20, 1);
    const far = rippleDelayMs(9, 2, 3, 2, 10, 20, 1);
    expect(far).toBeGreaterThan(near);
  });
});

describe('scanDelayMs', () => {
  it('increases left-to-right and line-by-line', () => {
    expect(scanDelayMs(0, 0, 8, 120)).toBe(0);
    expect(scanDelayMs(5, 0, 8, 120)).toBe(40);
    expect(scanDelayMs(0, 1, 8, 120)).toBe(120);
  });
});

describe('displayChar', () => {
  it('keeps spaces as spaces', () => {
    expect(displayChar(' ', 0, 999, 1)).toBe(' ');
  });
  it('shows the final char once resolved (t >= delay)', () => {
    expect(displayChar('a', 100, 100, 1)).toBe('a');
    expect(displayChar('a', 250, 100, 1)).toBe('a');
  });
  it('shows a scramble glyph before resolving', () => {
    const g = displayChar('a', 0, 100, 1);
    expect(g).not.toBe('a');
    expect(SCRAMBLE_CHARS).toContain(g);
  });
});

describe('renderLine', () => {
  it('fully resolves when t exceeds all delays', () => {
    const text = 'hello world';
    const delays = text.split('').map((_, i) => i * 10);
    expect(renderLine(text, delays, 10_000, 0)).toBe(text);
  });
  it('preserves length while scrambling', () => {
    const text = 'abc def';
    const delays = text.split('').map(() => 1000);
    expect(renderLine(text, delays, 0, 0)).toHaveLength(text.length);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/experience/decrypt.test.ts`
Expected: FAIL (module not found).

**Step 3: Implement `decrypt.ts`**

```ts
// Pure decryption timing — no React, no rAF, no Math.random (so it is testable
// and deterministic). The hook layer supplies the clock; this decides what each
// character renders at a given time.

export const SCRAMBLE_CHARS =
  '!<>-_\\/[]{}=+*^?#$%&ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Deterministic glyph from an integer seed (xorshift spread so sequential seeds
// don't return adjacent chars).
export function scrambleGlyph(seed: number): string {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return SCRAMBLE_CHARS[x % SCRAMBLE_CHARS.length];
}

// Ripple: ms before a monospace cell (col,row) resolves, given the wave origin
// cell, the cell dimensions (px), and the wave speed (px/ms). Euclidean → circular.
export function rippleDelayMs(
  col: number,
  row: number,
  originCol: number,
  originRow: number,
  cellW: number,
  lineH: number,
  speedPxPerMs: number,
): number {
  const dx = (col - originCol) * cellW;
  const dy = (row - originRow) * lineH;
  return Math.hypot(dx, dy) / Math.max(speedPxPerMs, 1e-6);
}

// Scan: ms before a char resolves — left-to-right with a per-line stagger.
export function scanDelayMs(
  charIndex: number,
  lineIndex: number,
  perCharMs: number,
  perLineStaggerMs: number,
): number {
  return lineIndex * perLineStaggerMs + charIndex * perCharMs;
}

// What one character renders at time t. Spaces stay spaces (so word shape reads
// through the scramble); resolved chars show their final glyph; otherwise a
// scramble glyph that cycles every `cycleMs`.
export function displayChar(
  finalChar: string,
  t: number,
  delay: number,
  positionSeed: number,
  cycleMs = 45,
): string {
  if (finalChar === ' ') return ' ';
  if (t >= delay) return finalChar;
  const bucket = Math.floor(t / cycleMs);
  return scrambleGlyph(positionSeed * 131 + bucket);
}

// Render a whole line at time t against its per-character delays.
export function renderLine(
  text: string,
  delays: number[],
  t: number,
  lineSeed: number,
  cycleMs?: number,
): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    out += displayChar(text[i], t, delays[i] ?? 0, lineSeed * 977 + i, cycleMs);
  }
  return out;
}
```

**Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/experience/decrypt.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/experience/decrypt.ts src/components/experience/decrypt.test.ts
git commit -m "feat: add pure decryption timing module"
```

---

## Task 4: `useDecrypt` hook (thin rAF wrapper)

Drives `renderLine` over time and returns the current display strings. Kept thin so the tested math stays in `decrypt.ts`.

**Files:**
- Create: `src/components/experience/useDecrypt.ts`

**Step 1: Implement the hook**

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { renderLine } from './decrypt';

export type DecryptLine = { text: string; delays: number[]; seed: number };

// Plays all lines from scramble -> resolved over `durationMs`. Re-runs whenever
// `runKey` changes (e.g. on lens switch). When `reduced` is true, snaps to final.
export function useDecrypt(
  lines: DecryptLine[],
  runKey: unknown,
  durationMs: number,
  reduced: boolean,
): string[] {
  const [display, setDisplay] = useState<string[]>(() => lines.map((l) => l.text));
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(lines.map((l) => l.text));
      return;
    }
    let start = 0;
    const tick = (ts: number) => {
      if (start === 0) start = ts;
      const t = ts - start;
      setDisplay(lines.map((l) => renderLine(l.text, l.delays, t, l.seed)));
      if (t < durationMs) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(lines.map((l) => l.text)); // exact final text
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, reduced]);

  return display;
}
```

**Step 2: Verify it type-checks**

Run: `pnpm lint`
Expected: no errors. (No unit test — the timing logic it calls is already tested in Task 3; behavior is verified visually in Tasks 6–7.)

**Step 3: Commit**

```bash
git add src/components/experience/useDecrypt.ts
git commit -m "feat: add useDecrypt rAF hook"
```

---

## Task 5: Static experience section wired into the player

Make `experience` reachable and render a **static, fully-resolved** résumé on the software lens (no toggle, no entrance yet). This proves layout, font, player hand-off, and the fade-out exit before any animation.

**Files:**
- Create: `src/components/experience/ExperienceSection.tsx`
- Modify: `src/components/story/storyData.ts` (add the `NAV` entry now)
- Modify: `src/components/StoryPlayer.tsx`

**Step 1: Add the NAV entry**

In `storyData.ts`, append to `NAV`:

```ts
  { label: 'experience', stopId: 'experience' },
```

**Step 2: Build the static section**

Create `src/components/experience/ExperienceSection.tsx`. Render the headline (static "software" lens for now) and the three experience blocks from `EXPERIENCE`, fully resolved, in Inconsolata. Year is a fixed-width left column (the future ripple origin). Match the palette and lowercase voice.

```tsx
'use client';

import { EXPERIENCE, type Lens } from '@/components/story/storyData';

const INK = '#1f1812';
const MONO = "var(--font-inconsolata), ui-monospace, monospace";

export default function ExperienceSection({ lens = 'software' as Lens }: { lens?: Lens }) {
  return (
    <section
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '2.4rem',
        padding: 'clamp(4rem, 10vh, 8rem) clamp(1.5rem, 8vw, 9rem)',
        fontFamily: MONO,
        color: INK,
        zIndex: 4,
      }}
    >
      {/* headline (toggle comes in Task 6) */}
      <h2
        style={{
          margin: 0,
          fontSize: 'clamp(1.1rem, 2.4vw, 2rem)',
          fontWeight: 500,
          letterSpacing: '0.02em',
        }}
      >
        here&apos;s me as a <strong style={{ fontWeight: 900 }}>{lens}</strong> engineer
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8rem' }}>
        {EXPERIENCE.map((entry) => (
          <article key={entry.key} style={{ display: 'flex', gap: 'clamp(1rem, 3vw, 3rem)' }}>
            <div
              style={{
                flex: '0 0 auto',
                width: '7ch',
                fontWeight: 900,
                fontSize: 'clamp(0.95rem, 1.5vw, 1.3rem)',
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              {entry.year}
            </div>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 'clamp(0.95rem, 1.5vw, 1.3rem)',
                  lineHeight: 1.4,
                }}
              >
                {entry.company} <span style={{ fontWeight: 400 }}>/ {entry.title}</span>
              </div>
              <ul style={{ margin: '0.5rem 0 0', padding: 0, listStyle: 'none' }}>
                {entry.bullets[lens].map((b, i) => (
                  <li
                    key={i}
                    style={{
                      fontWeight: 300,
                      fontSize: 'clamp(0.8rem, 1.05vw, 1rem)',
                      lineHeight: 1.6,
                      display: 'flex',
                      gap: '0.6ch',
                    }}
                  >
                    <span aria-hidden>&rsaquo;</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

**Step 3: Wire it into `StoryPlayer`**

In `StoryPlayer.tsx`:

- Import: `import ExperienceSection from '@/components/experience/ExperienceSection';` and add `isExperienceStop` to the `storyData` import.
- Derive flags near `onAbout`/`onProject`:

```tsx
const experienceIndex = stopIndexById('experience');
const onExperience = introDone && !player.isTransitioning && isExperienceStop(player.currentStop);
const goingToExperience = player.target === experienceIndex || player.currentStop === experienceIndex;
```

- Hide the main frame `<img>` when experience is involved (no art there). On the
  main frame `<img>` style add:

```tsx
opacity: goingToExperience ? 0 : 1,
transition: 'opacity 360ms ease',
```

- Render the section (mounted whenever experience is current/target so it can
  fade; controlled by opacity). Place it after the projects `<aside>` block,
  before `<StoryNav>`:

```tsx
{goingToExperience ? (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      opacity: onExperience ? 1 : 0,
      transition: 'opacity 400ms ease',
      pointerEvents: onExperience ? 'auto' : 'none',
      zIndex: 4,
    }}
  >
    <ExperienceSection lens="software" />
  </div>
) : null}
```

This gives the "fade out on leave" for free: when you navigate away, `onExperience` flips false → the wrapper fades to 0 while the player runs the reverse frames.

**Step 4: Verify in the browser**

Run: `pnpm dev`. Click **experience** in the nav. Expect: frame art fades out, the cream stage shows the monospace résumé, three blocks with year anchors. Navigate back to **mango** / **about** → résumé fades out, frames play. Resize narrow → text still fits (note any overflow for Task 8). Stop the server.

**Step 5: Commit**

```bash
git add src/components/story/storyData.ts src/components/experience/ExperienceSection.tsx src/components/StoryPlayer.tsx
git commit -m "feat: render static experience section as the final stop"
```

---

## Task 6: Lens toggle — slot-stack slide + bullet scramble

Turn the headline into the control and re-decrypt bullets on switch.

**Files:**
- Modify: `src/components/experience/ExperienceSection.tsx`
- Modify: `app/globals.css` (slot transition is inline; no keyframe strictly needed)

**Step 1: Lens state + the inline slot-stack**

- Add `const [lens, setLens] = useState<Lens>('software');` and a
  `prefers-reduced-motion` read (`useReducedMotion` small helper or inline
  `matchMedia`).
- Replace the `<strong>{lens}</strong>` word with a fixed-width vertical slot:
  an 8ch-wide, single-line-tall clipped box containing both words stacked. The
  stack `translateY` switches between `0` (software on baseline) and `-1em`
  (product on baseline). Selected word ink + weight 900; other pale + clickable.

```tsx
const SLOT_LINE = '1.15em';
// ...
<span
  style={{
    display: 'inline-block',
    width: '8ch',
    height: SLOT_LINE,
    overflow: 'hidden',
    verticalAlign: 'bottom',
    position: 'relative',
  }}
>
  <span
    style={{
      display: 'block',
      transform: lens === 'software' ? 'translateY(0)' : `translateY(-${SLOT_LINE})`,
      transition: reduced ? 'none' : 'transform 420ms cubic-bezier(0.65,0,0.35,1)',
    }}
  >
    {LENSES.map((l) => (
      <button
        key={l}
        type="button"
        onClick={() => setLens(l)}
        style={{
          display: 'block',
          height: SLOT_LINE,
          lineHeight: SLOT_LINE,
          border: 'none',
          background: 'transparent',
          padding: 0,
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          fontWeight: 900,
          color: lens === l ? INK : 'rgba(31,24,18,0.28)',
          transition: reduced ? 'none' : 'color 300ms ease',
        }}
      >
        {l}
      </button>
    ))}
  </span>
</span>
```

(The slot width fixes "engineer" in place; only the stack slides.)

**Step 2: Re-decrypt bullets on lens change**

- Flatten the current lens's bullets into `DecryptLine[]`, computing **scan**
  delays via `scanDelayMs(charIndex, lineIndexAcrossAllBullets, perCharMs=7, perLineStaggerMs=110)`.
- Drive them with `useDecrypt(lines, lens, /*durationMs*/ 850, reduced)` and
  render the returned strings instead of the raw bullet text.
- Title/company/year render as plain resolved text (they don't decrypt).
- Keep a stable seed per bullet line (its global index) so the scramble looks
  consistent.

Build the lines with `useMemo` keyed on `lens`:

```tsx
const lensLines = useMemo(() => {
  const lines: DecryptLine[] = [];
  let lineIndex = 0;
  for (const entry of EXPERIENCE) {
    for (const b of entry.bullets[lens]) {
      const delays = b.split('').map((_, ci) => scanDelayMs(ci, lineIndex, 7, 110));
      lines.push({ text: b, delays, seed: lineIndex + 1 });
      lineIndex += 1;
    }
  }
  return lines;
}, [lens]);

const shown = useDecrypt(lensLines, lens, 850, reduced);
```

Then map `shown` back onto the right bullet by walking the same nested order.
(Track a running index while rendering, or precompute a flat list with `{entryKey, text}` and group.)

**Step 3: Verify in the browser**

Run: `pnpm dev`. Toggle software/product: the word stack slides; bullets scramble and resolve left-to-right, top-to-bottom; layout height adjusts when the product lens has fewer bullets (sailbot). Spam-toggle → stays responsive. Toggle with OS "reduce motion" on → instant swap, no scramble. Stop the server.

**Step 4: Commit**

```bash
git add src/components/experience/ExperienceSection.tsx app/globals.css
git commit -m "feat: lens toggle with sliding slot + bullet decryption"
```

---

## Task 7: Entrance animation (the signature)

Add the one-time arrival timeline: isolate → travel → stack → ripple-decrypt. Build it in sub-steps and verify each visually. Fires when `onExperience` becomes true and the section was just navigated to (not on a lens toggle).

**Files:**
- Modify: `src/components/experience/ExperienceSection.tsx`
- Modify: `app/globals.css` (keyframes for fades/slides)

**Design timings (from the design doc):** isolate ~0.4s, travel ~0.7s, stack ~0.8s, ripple ~1.5s; three ripples fire together; total ~3.4s. Reduced motion skips to the final state.

**Step 1: Phase state machine**

Add an `entrancePhase` state: `'isolate' | 'travel' | 'stack' | 'ripple' | 'done'`, advanced by `setTimeout`s on mount-as-current. A `runId` increments each time the section is entered so re-entries replay. If `reduced`, jump straight to `'done'`.

**Step 2: Year stack overlay (isolate → travel → stack)**

- Render an absolutely-positioned overlay of the three year strings.
- `isolate`: a single `2026?`→ actually the seed is `2025`; show one `2025` at
  the mango-anchor position (top-right-ish where mango's copy sat) at full ink,
  everything else (the résumé blocks) hidden.
- `travel`: animate that `2025` to vertical center, then to ~⅓ from left
  (two eased transforms or one cubic path).
- `stack`: slide in the other two years from behind it (translateY + opacity,
  staggered) to form the tight centered stack `2026 / 2025 / 2025`; then morph
  sailbot's `2025` into `2025-2026` (append `-2026` via a short decrypt or a
  width transition).

Use CSS transitions on transform/opacity driven by `entrancePhase`; add
keyframes to `globals.css` only where a transition can't express it.

**Step 3: Ripple-decrypt (stack → done)**

- At `ripple`, transition the layout from the absolute stacked years into the
  normal résumé flow: each year animates (FLIP-style, or an eased top/left) from
  its stacked position to its block's anchor position while the bullets reveal.
- Drive the bullet text with `useDecrypt` in **ripple** mode: for each block,
  compute per-char delays with `rippleDelayMs(col, row, originCol=0, originRow=0, cellW≈/* measured ch */, lineH, speedPxPerMs)`, where `col`=char index, `row`=bullet line index within the block (year at row 0). All three blocks start at the same `t`, so the waves fire together.
- `cellW`/`lineH`: derive from the rendered font (measure one `ch` via a ref, or
  hardcode from the clamp at the current breakpoint and refine). Approximate is
  fine — the effect reads as a corner-out wave.
- On completion set `entrancePhase='done'`; from then on the lens toggle (Task 6)
  owns the text.

**Step 4: Reduced motion + re-entry**

- `prefers-reduced-motion`: skip to `done`, bullets shown resolved, no morph.
- Navigating away and back replays the entrance (new `runId`). Confirm the
  exit fade (Task 5) still plays before frames run.

**Step 5: Verify in the browser**

Run: `pnpm dev`. From **mango**, click **experience**: 2025 isolates, travels, stacks, then three waves resolve the résumé, years settle into place, software lens shown. From **about**, click **experience**: project frames play to mango, then the same entrance. Toggle lens afterward → uses the scan decrypt, not the ripple. Reduce-motion → clean fade to final. Stop the server.

**Step 6: Commit**

```bash
git add src/components/experience/ExperienceSection.tsx app/globals.css
git commit -m "feat: experience entrance — year morph, stack, ripple decrypt"
```

---

## Task 8: Polish, responsive, and optional FLIP seed

**Files:**
- Modify: `src/components/experience/ExperienceSection.tsx`
- Modify: `src/components/StoryPlayer.tsx` (only if doing the FLIP seed)

**Step 1: Responsive + overflow**

- Verify on a narrow viewport and the portrait-rotate breakpoint (`globals.css`
  media query). Ensure the résumé fits the fixed 100vh stage; if a lens overflows
  on small screens, allow internal vertical scroll on the section
  (`overflowY: 'auto'`) rather than clipping.
- Confirm keyboard focus is visible on the lens buttons and the nav node; confirm
  `prefers-reduced-motion` paths.

**Step 2 (optional polish): FLIP the real `2025` from mango**

- Wrap the `2025` in mango's body copy in a ref'd `<span>` (split that bullet in
  `PROJECT_CONTENT` rendering so "2025" is its own span).
- When entering experience directly from mango, measure that span's rect and
  start the isolate/travel from there (FLIP). If the span isn't present (skip
  case), fall back to the fixed anchor from Task 7. Degrades cleanly.

**Step 3: Final review**

Run: `pnpm vitest run` (all green) and `pnpm lint` (clean).
Use superpowers:requesting-code-review before merging.

**Step 4: Commit**

```bash
git add -A
git commit -m "polish: responsive, a11y, and FLIP year seed for experience"
```

---

## Notes for the implementer

- **Ryan supplies final bullet copy** — placeholders in Task 2 keep structure;
  swapping them is a content-only edit, no code change.
- **Keep the tested math in `decrypt.ts`.** Components stay declarative; if you
  reach for new timing logic, add it to `decrypt.ts` with a test.
- **Don't reuse the ripple for the toggle** — scan mode keeps the entrance special.
- **Main stays shippable** at every commit: experience isn't reachable until the
  NAV entry lands in Task 5.
```
