# Name-as-Home Nav Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `home` nav node with the corner name "ryan kim", which
joins the nav as its home button when the bar docks top-left; the landing shows
only `about  projects  experience` with no connector lines.

**Architecture:** All motion is CSS transitions on `<StoryNav>`, keyed off
`docked`, with direction-dependent delays (dock: glide → draw lines; undock:
retract lines → glide). The only JS timing change is in `useFramePlayer`: the
ink sweep holds for the assembly duration when leaving / returning to the
landing, via a pure, tested `fillWindowT` helper. Design:
`docs/plans/2026-09-22-name-as-home-nav-design.md`.

**Tech Stack:** Next.js 15, React 19, TypeScript, inline styles, Vitest.

**Commands:**
- Tests: `pnpm test` (baseline: 4 files, 23 tests passing)
- Types: `pnpm exec tsc --noEmit`
- Dev server: `pnpm dev` (desktop width ≥ 1024px — below that the site is gated)

---

### Task 1: Nav timing constants + `fillWindowT`

**Files:**
- Create: `src/components/story/navTiming.ts`
- Test: `src/components/story/navTiming.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { NAV_ASSEMBLY_MS, NAV_DRAW_MS, NAV_GLIDE_MS, fillWindowT } from './navTiming';

describe('nav timing', () => {
  it('assembly is the glide followed by the line draw', () => {
    expect(NAV_ASSEMBLY_MS).toBe(NAV_GLIDE_MS + NAV_DRAW_MS);
  });
});

describe('fillWindowT', () => {
  it('is linear over the whole window with no holds', () => {
    expect(fillWindowT(0, 1000, 0, 0)).toBe(0);
    expect(fillWindowT(500, 1000, 0, 0)).toBe(0.5);
    expect(fillWindowT(1000, 1000, 0, 0)).toBe(1);
  });

  it('holds at 0 through the start hold, then sweeps the remainder', () => {
    expect(fillWindowT(0, 2000, 900, 0)).toBe(0);
    expect(fillWindowT(900, 2000, 900, 0)).toBe(0);
    expect(fillWindowT(1450, 2000, 900, 0)).toBe(0.5);
    expect(fillWindowT(2000, 2000, 900, 0)).toBe(1);
  });

  it('reaches 1 early by the end hold', () => {
    expect(fillWindowT(550, 2000, 0, 900)).toBe(0.5);
    expect(fillWindowT(1100, 2000, 0, 900)).toBe(1);
    expect(fillWindowT(1900, 2000, 0, 900)).toBe(1);
  });

  it('clamps outside the window', () => {
    expect(fillWindowT(-50, 1000, 0, 0)).toBe(0);
    expect(fillWindowT(5000, 1000, 0, 0)).toBe(1);
  });

  it('never divides by zero when the holds swallow the window', () => {
    expect(fillWindowT(0, 500, 900, 0)).toBe(0);
    expect(fillWindowT(500, 500, 900, 0)).toBe(0);
    expect(fillWindowT(901, 500, 900, 0)).toBe(1);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm test src/components/story/navTiming.test.ts`
Expected: FAIL — cannot resolve `./navTiming`.

**Step 3: Implement**

```ts
// Timing shared by StoryNav's dock choreography and the player's ink sweep.
// Docking: the bar glides to the corner, then its connector lines draw in.
// Undocking runs the same two beats in reverse.
export const NAV_GLIDE_MS = 600;
export const NAV_DRAW_MS = 300;
export const NAV_ASSEMBLY_MS = NAV_GLIDE_MS + NAV_DRAW_MS;

// Map elapsed time in a transition to 0..1 sweep progress, holding at 0 for
// the first `holdStartMs` and arriving at 1 `holdEndMs` before the end.
export function fillWindowT(
  elapsedMs: number,
  totalMs: number,
  holdStartMs: number,
  holdEndMs: number,
): number {
  const span = Math.max(totalMs - holdStartMs - holdEndMs, 1);
  return Math.max(0, Math.min(1, (elapsedMs - holdStartMs) / span));
}
```

**Step 4: Run to verify it passes**

Run: `pnpm test src/components/story/navTiming.test.ts`
Expected: PASS (6 tests).

**Step 5: Commit**

```bash
git add src/components/story/navTiming.ts src/components/story/navTiming.test.ts
git commit -m "Add nav assembly timing and a held fill window"
```

---

### Task 2: Hold the ink while the bar assembles

The fill is eased for single steps and linear-at-2× for skips, so a hold in
stop-space wouldn't be a fixed 0.9s. Hold in *time* instead: leaving the
landing, the sweep starts `NAV_ASSEMBLY_MS` late; returning, it ends that much
early (the bar rests pale, then the lines retract on arrival).

**Files:**
- Modify: `src/components/story/useFramePlayer.ts` (imports; the transitioning
  `tick` effect, ~lines 87–130)

**Step 1: Import**

```ts
import { NAV_ASSEMBLY_MS, fillWindowT } from '@/components/story/navTiming';
```

**Step 2: Apply the hold in `tick`**

After `const frameDuration = ...` add:

```ts
    // Stop 0 is the landing, where the nav is undocked. Leaving it, hold the
    // ink until the bar has glided into the corner and drawn its lines;
    // returning, finish draining before arrival so the lines can retract.
    const holdStartMs = from === 0 ? NAV_ASSEMBLY_MS : 0;
    const holdEndMs = to === 0 ? NAV_ASSEMBLY_MS : 0;
```

Replace

```ts
      const t = Math.min((timestamp - startTime) / totalDuration, 1);
```

with

```ts
      const t = fillWindowT(timestamp - startTime, totalDuration, holdStartMs, holdEndMs);
```

Update the comment above it to:
`// Fill across the transition window (linear for skips, eased otherwise),`
`// minus any assembly hold at the landing end.`

**Step 3: Verify**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all tests pass; no type errors.

**Step 4: Commit**

```bash
git add src/components/story/useFramePlayer.ts
git commit -m "Hold the nav ink while the bar assembles at the landing"
```

---

### Task 3: Relabel the home entry

**Files:**
- Modify: `src/components/story/storyData.ts:81-85`
- Test: `src/components/story/storyData.test.ts`

**Step 1: Write the failing test**

Add `NAV` to the import list, then append:

```ts
describe('nav', () => {
  it('leads with the name as the home entry', () => {
    expect(NAV[0]).toEqual({ label: 'ryan kim', stopId: 'landing' });
    expect(NAV.some((entry) => entry.label === 'home')).toBe(false);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm test src/components/story/storyData.test.ts`
Expected: FAIL — received `label: 'home'`.

**Step 3: Implement**

In `storyData.ts`, change the section comment and first entry:

```ts
// --- Nav: the name (home/landing) + about + projects (expands into its 3 children) ---
```
```ts
  { label: 'ryan kim', stopId: 'landing' },
```

**Step 4: Run to verify it passes**

Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/story/storyData.ts src/components/story/storyData.test.ts
git commit -m "Label the home nav entry with the name"
```

---

### Task 4: Name as the bar's head; dock top-left

**Files:**
- Modify: `src/components/story/StoryNav.tsx`

**Step 1: Timing imports and helpers**

Import the timing:

```ts
import { NAV_ASSEMBLY_MS, NAV_DRAW_MS, NAV_GLIDE_MS } from '@/components/story/navTiming';
```

Delete `const LAYOUT_MS = 600;` (keep `LAYOUT_EASE` and its comment; the
comment now also covers `NAV_GLIDE_MS`). Add after the other constants:

```ts
// Docked, the bar sits in the top-left corner, level with the right cluster.
const DOCK_INSET = '1.5rem';
```

Inside the component, after `const docked = ...`:

```ts
  // Docking glides first and draws the lines after; undocking retracts the
  // lines first and glides after. Every layout property shares this timing.
  const glideDelay = docked ? 0 : NAV_DRAW_MS;
  const glide = (property: string): string =>
    `${property} ${NAV_GLIDE_MS}ms ${LAYOUT_EASE} ${glideDelay}ms`;
```

(`NAV_ASSEMBLY_MS` is used in Task 7; import it now so the import line is final.)

**Step 2: Let `node` take button attributes**

Add a sixth parameter and spread it onto the `<button>`:

```ts
    extraStyle?: CSSProperties,
    attrs?: { tabIndex?: number; 'aria-label'?: string },
  ): ReactNode => (
    <button
      key={key}
      type="button"
      onClick={() => handleClick(stopIndex)}
      {...attrs}
```

**Step 3: Render the head separately**

Replace the start of the render section (`const items: ReactNode[] = [];`
through the first two statements of `NAV.forEach`) so the head and the line
into the first entry live in one collapsible group, and the loop runs over the
remaining entries:

```tsx
  const [head, ...entries] = NAV;
  const headConnKey = `conn-${entries[0].label}`;
  const items: ReactNode[] = [
    // The name (home) plus the line into the first entry. Collapsed on the
    // landing: the name only exists as the head of the docked bar.
    <div
      key="head"
      aria-hidden={!docked}
      style={{
        display: 'inline-grid',
        gridTemplateColumns: docked ? '1fr' : '0fr',
        marginRight: docked ? '0' : `-${gapValue}`,
        opacity: docked ? 1 : 0,
        transition: [glide('grid-template-columns'), glide('margin-right'), glide('opacity')].join(', '),
      }}
    >
      <div
        style={{
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: gapValue,
          transition: glide('gap'),
        }}
      >
        {node(`node-${head.label}`, head.label, stopIndexById(head.stopId), fracById[`node-${head.label}`] ?? 1, undefined, {
          tabIndex: docked ? 0 : -1,
          'aria-label': `${head.label}, home`,
        })}
        {connector(headConnKey, fracById[headConnKey] ?? 0)}
      </div>
    </div>,
  ];

  entries.forEach((entry, entryIndex) => {
    const entryStopIndex = stopIndexById(entry.stopId);
    if (entryIndex > 0) {
      items.push(connector(`conn-${entry.label}`, fracById[`conn-${entry.label}`] ?? 0));
    }
```

(The rest of the loop body — the node push and the children group — is
unchanged.) The `order` / `fracById` computation above stays as is: it still
walks all of `NAV`, so the head is stop 0 and always inked.

**Step 4: Dock to the corner**

In the `<nav>` style, replace `left`, `top`, `transform`, `transition`:

```ts
        left: docked ? DOCK_INSET : '50%',
        top: docked ? DOCK_INSET : '33.333%',
        transform: docked ? 'translate(0, 0)' : 'translate(-50%, -50%)',
```
```ts
        transition: [
          glide('left'),
          glide('top'),
          glide('transform'),
          glide('font-size'),
          glide('gap'),
          'opacity 800ms ease 750ms',
        ].join(', '),
```

**Step 5: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: clean. (Visual check happens in Task 9.)

**Step 6: Commit**

```bash
git add src/components/story/StoryNav.tsx
git commit -m "Lead the nav with the name and dock it top-left"
```

---

### Task 5: Draw the lines after the glide

**Files:**
- Modify: `src/components/story/StoryNav.tsx` (the line branch of `connector`)

**Step 1: Implement**

In the non-dot branch of `connector`, replace `transition: 'width 520ms ease',`
with:

```ts
          // Hidden on the landing; drawn left to right once the glide lands,
          // and retracted toward the left before the bar glides home.
          transform: docked ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: 'left center',
          transition:
            `${glide('width')}, ` +
            `transform ${NAV_DRAW_MS}ms ${docked ? 'ease-out' : 'ease-in'} ${docked ? NAV_GLIDE_MS : 0}ms`,
```

Leave the dot branch alone — sub-project dots keep their own reveal.

**Step 2: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

**Step 3: Commit**

```bash
git add src/components/story/StoryNav.tsx
git commit -m "Draw the nav lines in after the bar docks"
```

---

### Task 6: Solid words on the landing, pale when docked

Gradients can't transition, but a registered custom property they reference
can. `--nav-pale` equals full ink on the landing (solid menu) and fades to the
pale "ahead" tint during the glide.

**Files:**
- Modify: `app/globals.css` (append)
- Modify: `src/components/story/StoryNav.tsx`

**Step 1: Register the property** (append to `globals.css`)

```css
/* StoryNav's "ahead of the playhead" ink. Registered so it can transition: on
   the landing it equals full ink (a solid menu); docked it fades to pale.
   An unregistered custom property is a string and would snap. */
@property --nav-pale {
  syntax: '<color>';
  inherits: true;
  initial-value: rgba(31, 24, 18, 0.28);
}
```

**Step 2: Use it in `StoryNav.tsx`**

Replace `const PALE = 'rgba(31, 24, 18, 0.28)';` with:

```ts
const PALE_DOCKED = 'rgba(31, 24, 18, 0.28)';
// Every fill reads the pale ink through this variable (see globals.css).
const PALE = 'var(--nav-pale)';
```

In the `<nav>` style add:

```ts
        ...({ '--nav-pale': docked ? PALE_DOCKED : INK } as CSSProperties),
```

and add `glide('--nav-pale'),` to its `transition` array.

**Step 3: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

**Step 4: Commit**

```bash
git add app/globals.css src/components/story/StoryNav.tsx
git commit -m "Show the landing nav in full ink and fade it pale on dock"
```

---

### Task 7: Hold the projects expansion until the bar assembles

Jumping landing → projects expands the sub-nodes immediately today; they should
wait until the glide and line draw finish.

**Files:**
- Modify: `src/components/story/StoryNav.tsx`

**Step 1: Track the assembly window**

After `const docked = ...` (before `glide`), add. The render-time update is
deliberate: the delay must be in the same commit that flips `docked`, or the
children's transition starts with no delay.

```ts
  // True for NAV_ASSEMBLY_MS after the bar docks, so anything that expands on
  // the same click (the projects sub-nodes) waits for the bar to form.
  const [prevDocked, setPrevDocked] = useState(docked);
  const [assembling, setAssembling] = useState(false);
  if (docked !== prevDocked) {
    setPrevDocked(docked);
    setAssembling(docked);
  }
  useEffect(() => {
    if (!assembling) {
      return;
    }
    const id = window.setTimeout(() => setAssembling(false), NAV_ASSEMBLY_MS);
    return () => window.clearTimeout(id);
  }, [assembling]);
  const expandHold = assembling && projectsExpanded ? NAV_ASSEMBLY_MS : 0;
```

(Move `const projectsExpanded = ...` above this block if needed.)

**Step 2: Apply it**

Child reveal delay:

```ts
        const delay = projectsExpanded ? expandHold + childIndex * CHILD_STAGGER_MS : 0;
```

Children group `transition`:

```ts
            transition:
              `grid-template-columns ${EXPAND_MS}ms ${EXPAND_EASE} ${expandHold}ms, ` +
              `margin-left ${EXPAND_MS}ms ${EXPAND_EASE} ${expandHold}ms`,
```

**Step 3: Verify**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: clean.

**Step 4: Commit**

```bash
git add src/components/story/StoryNav.tsx
git commit -m "Hold the projects expansion until the bar has formed"
```

---

### Task 8: Remove the static corner name

**Files:**
- Modify: `src/components/StoryPlayer.tsx:315-336`

**Step 1:** Delete the `PORT BLOCK B: corner name (top-left)` comment and its
`<div>…ryan kim</div>`. Keep `cornerVisible` — the top-right cluster uses it.

**Step 2: Verify**

Run: `grep -n "ryan kim" src/components/StoryPlayer.tsx; pnpm exec tsc --noEmit && pnpm test`
Expected: no grep hits; clean.

**Step 3: Commit**

```bash
git add src/components/StoryPlayer.tsx
git commit -m "Drop the static corner name now that the nav carries it"
```

---

### Task 9: Browser verification and tuning

Run `pnpm dev`, open at ≥ 1024px wide. Check each and tune only what's off:

1. **Landing:** `about  projects  experience`, solid ink, no lines, centered.
   If the reserved line slots make the spacing too wide, reduce the undocked
   `gapValue` (`0.9rem`) — slots must stay so nothing shifts after docking.
2. **landing → about:** glide to the top-left with the name fading in and words
   fading pale → all lines draw left to right together → ink sweeps from the
   name into "about". Name baseline level with the tldr/socials row; adjust
   `DOCK_INSET` top if not.
3. **landing → projects:** sub-nodes expand only after the lines draw.
4. **landing → experience** (skip, 2× speed): assembly finishes before ink moves.
5. **any stop → ryan kim:** ink drains to the name, bar rests, lines retract,
   bar glides back to center and brightens; name hover shows the cursor blob.
6. **Keyboard:** on the landing, Tab never lands on the hidden name.
7. **Width:** stop on a project (widest bar) at exactly 1024px — no overlap
   with the top-right cluster.

Commit any tuning with a message describing the change.

---

### Task 10: Update the design doc

**Files:**
- Modify: `docs/plans/2026-09-22-name-as-home-nav-design.md` ("Ink hold on the
  first leg" and "Testing")

Replace the stop-space remap with the time-based hold actually built:
`fillWindowT(elapsed, total, holdStart, holdEnd)` in `navTiming.ts`, holds of
`NAV_ASSEMBLY_MS` when leaving / returning to stop 0, applied in the player's
fill loop. Reason: the fill is eased for single steps and 2×-linear for skips,
so a fixed stop-space fraction would not equal a fixed 0.9s. Update the unit
test bullet to match, then:

```bash
git add docs/plans/2026-09-22-name-as-home-nav-design.md
git commit -m "Design: record the time-based ink hold"
```
