'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EXPERIENCE, LENSES, type Lens } from '@/components/story/storyData';
import { scanDelayMs } from './decrypt';
import { useDecrypt, type DecryptLine } from './useDecrypt';

const INK = '#1f1812';
const PALE = 'rgba(31,24,18,0.28)';
const MONO = "var(--font-inconsolata), ui-monospace, monospace";
const SLOT_LINE = '1.15em';

// --- entrance choreography (tunable; verify/adjust visually) ---
const T_ISOLATE = 400; // mango's 2025 sits alone
const T_TRAVEL = 700; // it glides toward the stack
const T_STACK = 800; // the other years slide up into a tight stack
const LINE_INSERT_MS = 170; // each bullet line is "typed" in as a new line
const SETTLE_MS = 350; // pause after the last line before finishing
const SCAN_MS = 850; // lens-toggle decrypt duration
const EASE = 'cubic-bezier(0.65,0,0.35,1)';

type Phase = 'isolate' | 'travel' | 'stack' | 'expand' | 'done';
type DecryptMode = 'scan' | 'expand';

// The seed year (mango's "2025") is the bottom of the tight stack.
const SEED = EXPERIENCE.length - 1;
// The experience whose year is a range (e.g. 2025-2026) shows the range's start
// while it flies in, then reads as the full range once it joins the stack.
const RANGE_INDEX = EXPERIENCE.findIndex((e) => e.year.includes('-'));
const rangeStart = (year: string): string => year.split('-')[0];

// The résumé is one column centered horizontally; the year stack lands on its
// measured year cells, so the content reads balanced around the spine.
const CONTENT_MAX = '52rem';

// prefers-reduced-motion (client-only)
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

// Build the per-line decrypt schedule. `scan` staggers left-to-right across all
// bullets (lens toggle). `expand` keys each line's scramble to the moment it is
// inserted (one new line every LINE_INSERT_MS), so a line "types in" as it lands.
function buildLines(lens: Lens, mode: DecryptMode): DecryptLine[] {
  const out: DecryptLine[] = [];
  let globalIndex = 0;
  EXPERIENCE.forEach((entry) => {
    entry.bullets[lens].forEach((text, bulletIndex) => {
      const delays = text.split('').map((_, charIndex) =>
        mode === 'expand'
          ? scanDelayMs(charIndex, bulletIndex, 7, LINE_INSERT_MS)
          : scanDelayMs(charIndex, globalIndex, 7, 110),
      );
      out.push({ text, delays, seed: globalIndex + 1 });
      globalIndex += 1;
    });
  });
  return out;
}

type ExperienceSectionProps = {
  /** True once parked on the experience stop — drives the one-time entrance. */
  active: boolean;
  /** Viewport position of mango's rendered "2025" — the morph's true origin. */
  seedOrigin?: { x: number; y: number } | null;
};

export default function ExperienceSection({ active, seedOrigin = null }: ExperienceSectionProps) {
  const reduced = useReducedMotion();
  const [lens, setLens] = useState<Lens>('software');
  const [phase, setPhase] = useState<Phase>('isolate');
  // How many bullet lines are currently inserted (per block, in parallel). Each
  // increment adds a new line in normal flow, pushing the lower years apart.
  const [revealCount, setRevealCount] = useState(0);
  const revealCountRef = useRef(0);

  const maxBullets = useMemo(
    () => Math.max(...EXPERIENCE.map((e) => e.bullets[lens].length)),
    [lens],
  );

  // One decrypt token; bump it (with a mode) only when a decrypt should fire —
  // the entrance, or a lens toggle. The expand -> done transition must NOT bump
  // it, or the resolved bullets would re-scramble.
  const [decrypt, setDecrypt] = useState<{ token: number; mode: DecryptMode }>({
    token: 0,
    mode: 'scan',
  });

  // Entrance timeline: fly in -> stack -> hand off to flow (expand). Replays
  // whenever the section becomes active.
  useEffect(() => {
    if (!active) {
      return;
    }
    revealCountRef.current = 0; // allow the stack to be re-measured while collapsed
    setRevealCount(0);
    if (reduced) {
      setRevealCount(maxBullets);
      setPhase('done');
      return;
    }
    setPhase('isolate');
    const timers = [
      window.setTimeout(() => setPhase('travel'), T_ISOLATE),
      window.setTimeout(() => setPhase('stack'), T_ISOLATE + T_TRAVEL),
      window.setTimeout(() => setPhase('expand'), T_ISOLATE + T_TRAVEL + T_STACK),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [active, reduced, maxBullets]);

  // During expand, insert one bullet line across all blocks every LINE_INSERT_MS.
  useEffect(() => {
    if (phase !== 'expand' || reduced) {
      return;
    }
    const id = window.setInterval(() => {
      setRevealCount((c) => Math.min(c + 1, maxBullets));
    }, LINE_INSERT_MS);
    return () => window.clearInterval(id);
  }, [phase, reduced, maxBullets]);

  // Finish once every line has been inserted (plus a short settle).
  useEffect(() => {
    if (phase === 'expand' && revealCount >= maxBullets) {
      const id = window.setTimeout(() => setPhase('done'), SETTLE_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase, revealCount, maxBullets]);

  // Fire the entrance decrypt the moment we enter the expand phase.
  useEffect(() => {
    if (phase === 'expand') {
      setDecrypt((d) => ({ token: d.token + 1, mode: 'expand' }));
    }
  }, [phase]);

  // Fire a scan decrypt on lens change — but skip the initial mount.
  const firstLensRun = useRef(true);
  useEffect(() => {
    if (firstLensRun.current) {
      firstLensRun.current = false;
      return;
    }
    setDecrypt((d) => ({ token: d.token + 1, mode: 'scan' }));
  }, [lens]);

  const lines = useMemo(() => buildLines(lens, decrypt.mode), [lens, decrypt.mode]);
  const durationMs = decrypt.mode === 'scan' ? SCAN_MS : maxBullets * LINE_INSERT_MS + 600;
  const shown = useDecrypt(lines, decrypt.token, durationMs, reduced);

  // Map the flat `shown` array back onto the nested bullets, with a raw fallback.
  const shownByEntry = useMemo(() => {
    const out: string[][] = EXPERIENCE.map(() => []);
    let k = 0;
    EXPERIENCE.forEach((entry, ei) => {
      for (let i = 0; i < entry.bullets[lens].length; i += 1) {
        out[ei].push(shown[k] ?? entry.bullets[lens][i]);
        k += 1;
      }
    });
    return out;
  }, [shown, lens]);

  // Measure the tight stack: each in-flow year's position while collapsed (no
  // bullets). The overlay years fly into exactly these; the bullets then insert
  // in normal flow and push the years apart from there.
  const sectionRef = useRef<HTMLElement | null>(null);
  const yearRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [stackPos, setStackPos] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    revealCountRef.current = revealCount;
  }, [revealCount]);
  useEffect(() => {
    const measure = () => {
      const section = sectionRef.current;
      // Only capture the stack while it's still collapsed; once lines insert the
      // years have moved and these positions no longer describe the tight stack.
      if (!section || revealCountRef.current > 0) {
        return;
      }
      const sb = section.getBoundingClientRect();
      setBox({ w: sb.width, h: sb.height });
      setStackPos(
        yearRefs.current.map((el) => {
          if (!el) {
            return { x: 0, y: 0 };
          }
          const r = el.getBoundingClientRect();
          return { x: r.left - sb.left, y: r.top - sb.top };
        }),
      );
    };
    let raf = 0;
    const onResize = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(measure);
    };
    measure();
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [lens, active]);

  // The seed starts exactly on mango's "2025" when we arrived from there.
  const isolatePos = seedOrigin ?? { x: box.w * 0.6, y: box.h * 0.46 };

  // Where overlay year `i` sits (and whether it shows) for the current phase.
  const yearTarget = (i: number): { x: number; y: number; opacity: number; dur: number } => {
    const sp = stackPos[i] ?? { x: 0, y: 0 };
    const seedSlot = stackPos[SEED] ?? isolatePos;
    switch (phase) {
      case 'isolate':
        return i === SEED
          ? { ...isolatePos, opacity: 1, dur: 0 }
          : { ...seedSlot, opacity: 0, dur: 0 };
      case 'travel':
        return i === SEED
          ? { ...sp, opacity: 1, dur: T_TRAVEL }
          : { ...seedSlot, opacity: 0, dur: T_TRAVEL };
      case 'stack':
        return { ...sp, opacity: 1, dur: T_STACK };
      default:
        // expand/done: the in-flow years take over; fade the overlay out.
        return { ...sp, opacity: 0, dur: 200 };
    }
  };

  const revealed = phase === 'expand' || phase === 'done';
  const overlayVisible =
    (phase === 'isolate' || phase === 'travel' || phase === 'stack') &&
    box.w > 0 &&
    stackPos.length > 0;
  const togglable = phase === 'done';

  const bulletsShownFor = (entryIndex: number): number => {
    const total = EXPERIENCE[entryIndex].bullets[lens].length;
    if (phase === 'done') return total;
    if (phase === 'expand') return Math.min(revealCount, total);
    return 0;
  };

  return (
    <section
      ref={sectionRef}
      aria-label="experience"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        // Center the content column both axes; `safe` falls back to start (and
        // scrolls) instead of clipping when a lens overflows a short viewport.
        justifyContent: 'safe center',
        alignItems: 'safe center',
        overflowY: 'auto',
        padding: 'clamp(4rem, 10vh, 8rem) clamp(1.5rem, 8vw, 9rem)',
        fontFamily: MONO,
        color: INK,
        zIndex: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2.4rem',
          width: `min(${CONTENT_MAX}, 100%)`,
        }}
      >
        {/* headline — the lens word is the control: both lenses stay visible, the
            selected on the baseline in ink, the other just below in pale. */}
        <h2
          style={{
            margin: 0,
            fontSize: 'clamp(1.1rem, 2.4vw, 2rem)',
            fontWeight: 500,
            letterSpacing: '0.02em',
            opacity: revealed ? 1 : 0,
            transition: reduced ? 'none' : 'opacity 360ms ease',
          }}
        >
          here&apos;s me as a{' '}
          <span
            className="exp-lens-slot"
            style={{
              display: 'inline-block',
              width: '8ch',
              height: SLOT_LINE,
              verticalAlign: 'bottom',
              position: 'relative',
            }}
          >
            {LENSES.map((l) => {
              const selected = lens === l;
              return (
                <button
                  key={l}
                  type="button"
                  className="exp-lens"
                  onClick={() => setLens(l)}
                  aria-pressed={selected}
                  disabled={!togglable}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: SLOT_LINE,
                    lineHeight: SLOT_LINE,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    font: 'inherit',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    cursor: togglable ? 'pointer' : 'default',
                    fontWeight: 900,
                    color: selected ? INK : PALE,
                    transform: selected ? 'translateY(0)' : `translateY(${SLOT_LINE})`,
                    transition: reduced ? 'none' : `transform 420ms ${EASE}, color 300ms ease`,
                  }}
                >
                  {l}
                </button>
              );
            })}
          </span>{' '}
          engineer
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {EXPERIENCE.map((entry, entryIndex) => {
            const count = bulletsShownFor(entryIndex);
            return (
              <article key={entry.key} style={{ display: 'flex', gap: 'clamp(1rem, 3vw, 3rem)' }}>
                <div
                  ref={(el) => {
                    yearRefs.current[entryIndex] = el;
                  }}
                  style={{
                    flex: '0 0 auto',
                    width: '9ch',
                    fontWeight: 900,
                    fontSize: 'clamp(0.95rem, 1.5vw, 1.3rem)',
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                    // The overlay year owns the fly-in; the in-flow year appears
                    // for the flow expand, exactly where the overlay landed.
                    opacity: revealed ? 1 : 0,
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
                      opacity: revealed ? 1 : 0,
                      transition: reduced ? 'none' : 'opacity 320ms ease',
                    }}
                  >
                    {entry.company} <span style={{ fontWeight: 400 }}>/ {entry.title}</span>
                  </div>
                  <ul style={{ margin: count > 0 ? '0.5rem 0 0' : 0, padding: 0, listStyle: 'none' }}>
                    {entry.bullets[lens].slice(0, count).map((b, i) => (
                      <li
                        key={`${entry.key}-${i}`}
                        aria-label={b}
                        style={{
                          fontWeight: 300,
                          fontSize: 'clamp(0.8rem, 1.05vw, 1rem)',
                          lineHeight: 1.6,
                          display: 'flex',
                          gap: '0.6ch',
                        }}
                      >
                        <span aria-hidden>&rsaquo;</span>
                        <span aria-hidden>{shownByEntry[entryIndex][i] ?? b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Year overlay — the flying/stacking years during the fly-in. Hidden once
          they've landed and the in-flow years take over for the flow expand. */}
      {overlayVisible ? (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
          {EXPERIENCE.map((entry, i) => {
            const t = yearTarget(i);
            const text =
              i === RANGE_INDEX && (phase === 'isolate' || phase === 'travel')
                ? rangeStart(entry.year)
                : entry.year;
            return (
              <div
                key={entry.key}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transform: `translate(${t.x}px, ${t.y}px)`,
                  opacity: t.opacity,
                  transition: `transform ${t.dur}ms ${EASE}, opacity ${t.dur}ms ease`,
                  fontWeight: 900,
                  fontSize: 'clamp(0.95rem, 1.5vw, 1.3rem)',
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                }}
              >
                {text}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
