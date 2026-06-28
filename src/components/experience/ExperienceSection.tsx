'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EXPERIENCE, LENSES, type Lens } from '@/components/story/storyData';
import { rippleDelayMs, scanDelayMs } from './decrypt';
import { useDecrypt, type DecryptLine } from './useDecrypt';

const INK = '#1f1812';
const PALE = 'rgba(31,24,18,0.28)';
const MONO = "var(--font-inconsolata), ui-monospace, monospace";
const SLOT_LINE = '1.15em';

// --- entrance choreography (tunable; verify/adjust visually) ---
const T_ISOLATE = 400; // mango's 2025 sits alone
const T_TRAVEL = 700; // it glides toward the stack
const T_STACK = 800; // the other years slide up into a tight stack
const T_RIPPLE = 1500; // waves resolve the bullets; years space apart
const SCAN_MS = 850; // lens-toggle decrypt duration

type Phase = 'isolate' | 'travel' | 'stack' | 'ripple' | 'done';

// The seed year (mango's "2025") is the bottom of the final stack.
const SEED = EXPERIENCE.length - 1;
// The experience whose year is a range (e.g. 2025-2026) completes mid-entrance:
// it shows the range's start until the ripple, then the full range morphs in.
const RANGE_INDEX = EXPERIENCE.findIndex((e) => e.year.includes('-'));
const rangeStart = (year: string): string => year.split('-')[0];

// Ripple tuning. CELL_W/LINE_H approximate a monospace cell so the wave reads as
// roughly circular from each year; refine against the rendered font if needed.
const RIPPLE_SPEED_PX_PER_MS = 0.55;
const CELL_W = 9;
const LINE_H = 26;

const EASE = 'cubic-bezier(0.65,0,0.35,1)';

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
// bullets (lens toggle); `ripple` resolves from each block's year corner (entrance).
function buildLines(lens: Lens, mode: 'scan' | 'ripple'): DecryptLine[] {
  const out: DecryptLine[] = [];
  let globalIndex = 0;
  EXPERIENCE.forEach((entry) => {
    entry.bullets[lens].forEach((text, bulletIndex) => {
      const row = bulletIndex + 1; // the year sits at row 0 within the block
      const delays = text.split('').map((_, charIndex) =>
        mode === 'ripple'
          ? rippleDelayMs(charIndex, row, 0, 0, CELL_W, LINE_H, RIPPLE_SPEED_PX_PER_MS)
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
};

export default function ExperienceSection({ active }: ExperienceSectionProps) {
  const reduced = useReducedMotion();
  const [lens, setLens] = useState<Lens>('software');
  const [phase, setPhase] = useState<Phase>('isolate');

  // One decrypt token; bump it (with a mode) only when a decrypt should fire —
  // the entrance ripple, or a lens toggle. The ripple -> done transition must
  // NOT bump it, or the resolved bullets would re-scramble.
  const [decrypt, setDecrypt] = useState<{ token: number; mode: 'scan' | 'ripple' }>({
    token: 0,
    mode: 'scan',
  });

  // Entrance timeline: replays whenever the section becomes active.
  useEffect(() => {
    if (!active) {
      return;
    }
    if (reduced) {
      setPhase('done');
      return;
    }
    setPhase('isolate');
    const timers = [
      window.setTimeout(() => setPhase('travel'), T_ISOLATE),
      window.setTimeout(() => setPhase('stack'), T_ISOLATE + T_TRAVEL),
      window.setTimeout(() => setPhase('ripple'), T_ISOLATE + T_TRAVEL + T_STACK),
      window.setTimeout(() => setPhase('done'), T_ISOLATE + T_TRAVEL + T_STACK + T_RIPPLE),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [active, reduced]);

  // Fire the ripple decrypt the moment we enter the ripple phase.
  useEffect(() => {
    if (phase === 'ripple') {
      setDecrypt((d) => ({ token: d.token + 1, mode: 'ripple' }));
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
  const durationMs = decrypt.mode === 'ripple' ? T_RIPPLE : SCAN_MS;
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

  // Measure the section box + each in-flow year's resting position so the
  // overlay years can travel from the centered stack and land exactly on them.
  const sectionRef = useRef<HTMLElement | null>(null);
  const yearRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [finalPos, setFinalPos] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    const measure = () => {
      const section = sectionRef.current;
      if (!section) {
        return;
      }
      const sb = section.getBoundingClientRect();
      setBox({ w: sb.width, h: sb.height });
      setFinalPos(
        yearRefs.current.map((el) => {
          if (!el) {
            return { x: 0, y: 0 };
          }
          const r = el.getBoundingClientRect();
          return { x: r.left - sb.left, y: r.top - sb.top };
        }),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [lens]);

  // Stacked / isolate anchor geometry (derived from the measured box).
  const stackX = box.w * 0.3;
  const centerY = box.h * 0.46;
  const stackGap = LINE_H * 1.3;
  const stackPos = EXPERIENCE.map((_, i) => ({ x: stackX, y: centerY + (i - 1) * stackGap }));
  const isolatePos = { x: box.w * 0.6, y: box.h * 0.46 };

  // Where overlay year `i` sits (and whether it shows) for the current phase.
  const yearTarget = (i: number): { x: number; y: number; opacity: number; dur: number } => {
    const fin = finalPos[i] ?? stackPos[i];
    switch (phase) {
      case 'isolate':
        return i === SEED
          ? { ...isolatePos, opacity: 1, dur: 0 }
          : { ...stackPos[SEED], opacity: 0, dur: 0 };
      case 'travel':
        return i === SEED
          ? { ...stackPos[i], opacity: 1, dur: T_TRAVEL }
          : { ...stackPos[SEED], opacity: 0, dur: T_TRAVEL };
      case 'stack':
        return { ...stackPos[i], opacity: 1, dur: T_STACK };
      case 'ripple':
        return { ...fin, opacity: 1, dur: T_RIPPLE };
      default:
        return { ...fin, opacity: 0, dur: 200 };
    }
  };

  const revealed = phase === 'ripple' || phase === 'done';
  // Bullets only appear once their ripple decrypt has actually started (or after
  // the entrance), so they never flash resolved before scrambling.
  const bulletsRevealed = phase === 'done' || (phase === 'ripple' && decrypt.mode === 'ripple');
  const overlayVisible = phase !== 'done' && box.w > 0;
  const togglable = phase === 'done';

  return (
    <section
      ref={sectionRef}
      aria-label="experience"
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
      {/* headline — the lens word is the control: a fixed-width vertical slot
          stacking both lenses; only the stack slides, so "engineer" holds. */}
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
              transition: reduced ? 'none' : `transform 420ms ${EASE}`,
            }}
          >
            {LENSES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLens(l)}
                aria-pressed={lens === l}
                disabled={!togglable}
                style={{
                  display: 'block',
                  height: SLOT_LINE,
                  lineHeight: SLOT_LINE,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: togglable ? 'pointer' : 'default',
                  fontWeight: 900,
                  color: lens === l ? INK : PALE,
                  transition: reduced ? 'none' : 'color 300ms ease',
                }}
              >
                {l}
              </button>
            ))}
          </span>
        </span>{' '}
        engineer
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8rem' }}>
        {EXPERIENCE.map((entry, entryIndex) => (
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
                // The overlay year owns the entrance; the in-flow year only
                // appears once it has landed (phase done), seamlessly.
                opacity: phase === 'done' ? 1 : 0,
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
                  transition: reduced ? 'none' : 'opacity 420ms ease',
                }}
              >
                {entry.company} <span style={{ fontWeight: 400 }}>/ {entry.title}</span>
              </div>
              <ul
                style={{
                  margin: '0.5rem 0 0',
                  padding: 0,
                  listStyle: 'none',
                  opacity: bulletsRevealed ? 1 : 0,
                  transition: reduced ? 'none' : 'opacity 200ms ease',
                }}
              >
                {entry.bullets[lens].map((b, i) => (
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
        ))}
      </div>

      {/* Year overlay — the travelling/stacking years during the entrance.
          Hidden once they've landed (phase done) and the in-flow years take over. */}
      {overlayVisible ? (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
          {EXPERIENCE.map((entry, i) => {
            const t = yearTarget(i);
            const text =
              i === RANGE_INDEX && phase !== 'ripple' ? rangeStart(entry.year) : entry.year;
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
