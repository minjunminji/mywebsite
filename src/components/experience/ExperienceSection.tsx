'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EXPERIENCE, LENSES, type Lens } from '@/components/story/storyData';
import { useDecrypt, type DecryptLine } from './useDecrypt';

const INK = '#1f1812';
const PALE = 'rgba(31,24,18,0.28)';
const MONO = "var(--font-inconsolata), ui-monospace, monospace";
const SLOT_LINE = '1.15em';

// --- entrance choreography (tunable; verify/adjust visually) ---
const T_ISOLATE = 400; // mango's 2025 sits alone
const T_TRAVEL = 700; // it glides toward the stack
const T_STACK = 800; // the other years slide up into a tight stack
const LINE_STEP_MS = 150; // the wave advances one line every step
const HOLD_MS = 220; // how long a line scrambles before it starts resolving
const PER_CHAR_MS = 7; // char-to-char resolve stagger within a line
const SETTLE_MS = 350; // pause after the last line before finishing
const EASE = 'cubic-bezier(0.65,0,0.35,1)';

type Phase = 'isolate' | 'travel' | 'stack' | 'expand' | 'done';
type DecryptMode = 'wave' | 'toggle';

// The seed year (mango's "2025") is the bottom of the tight stack.
const SEED = EXPERIENCE.length - 1;
// The experience whose year is a range (e.g. 2025-2026) shows the range's start
// while it flies in, then reads as the full range once it joins the stack.
const RANGE_INDEX = EXPERIENCE.findIndex((e) => e.year.includes('-'));
const rangeStart = (year: string): string => year.split('-')[0];

// The résumé is one column centered horizontally; the year stack lands on its
// measured year cells, so the content reads balanced around the spine.
const CONTENT_MAX = '52rem';
// Nudge the column up from dead-center so it sits a touch high.
const SHIFT_UP = '-5vh';
// The headline reads at the same scale as the years and titles.
const HEAD_SIZE = 'clamp(0.95rem, 1.5vw, 1.3rem)';

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

type WaveLine =
  | { kind: 'headline'; text: string }
  | { kind: 'title'; entryIndex: number; text: string }
  | { kind: 'bullet'; entryIndex: number; bulletIndex: number; text: string };

// One flat, top-to-bottom list of every decoding line — the headline, then each
// block's title and bullets — so a single wave sweeps straight down from the top.
function buildWave(lens: Lens): {
  lines: WaveLine[];
  headlineIndex: number;
  titleIndex: number[];
  bulletIndex: number[][];
} {
  const lines: WaveLine[] = [];
  lines.push({ kind: 'headline', text: `here's me as a ${lens} engineer` });
  const headlineIndex = 0;
  const titleIndex: number[] = [];
  const bulletIndex: number[][] = [];
  EXPERIENCE.forEach((entry, entryIndex) => {
    titleIndex[entryIndex] = lines.length;
    lines.push({ kind: 'title', entryIndex, text: `${entry.company} / ${entry.title}` });
    bulletIndex[entryIndex] = [];
    entry.bullets[lens].forEach((text, bulletIndex_) => {
      bulletIndex[entryIndex][bulletIndex_] = lines.length;
      lines.push({ kind: 'bullet', entryIndex, bulletIndex: bulletIndex_, text });
    });
  });
  return { lines, headlineIndex, titleIndex, bulletIndex };
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
  // How far the wave has advanced, in lines from the top. Each step inserts the
  // next line in normal flow (pushing the lower years apart) and decodes it.
  const [waveAt, setWaveAt] = useState(0);
  const waveAtRef = useRef(0);

  const wave = useMemo(() => buildWave(lens), [lens]);
  const totalLines = wave.lines.length;

  // One decrypt token; bump it (with a mode) only when a decode should fire — the
  // entrance wave, or a lens toggle. The expand -> done transition must NOT bump
  // it, or the resolved text would re-scramble.
  const [decrypt, setDecrypt] = useState<{ token: number; mode: DecryptMode }>({
    token: 0,
    mode: 'toggle',
  });

  // Entrance timeline: fly in -> stack -> hand off to the flow wave (expand).
  useEffect(() => {
    if (!active) {
      return;
    }
    waveAtRef.current = 0; // allow the stack to be re-measured while collapsed
    setWaveAt(0);
    if (reduced) {
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
    // Intentionally NOT keyed on totalLines: a lens toggle changes the line
    // count but must only re-decode, never replay the fly-in/stack entrance.
  }, [active, reduced]);

  // During expand, advance the wave one line every LINE_STEP_MS.
  useEffect(() => {
    if (phase !== 'expand' || reduced) {
      return;
    }
    const id = window.setInterval(() => {
      setWaveAt((c) => Math.min(c + 1, totalLines - 1));
    }, LINE_STEP_MS);
    return () => window.clearInterval(id);
  }, [phase, reduced, totalLines]);

  // Finish once the wave has reached the last line (plus a short settle).
  useEffect(() => {
    if (phase === 'expand' && waveAt >= totalLines - 1) {
      const id = window.setTimeout(() => setPhase('done'), SETTLE_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase, waveAt, totalLines]);

  // Fire the entrance wave the moment we enter expand.
  useEffect(() => {
    if (phase === 'expand') {
      setDecrypt((d) => ({ token: d.token + 1, mode: 'wave' }));
    }
  }, [phase]);

  // Re-decode on lens change — but skip the initial mount.
  const firstLensRun = useRef(true);
  useEffect(() => {
    if (firstLensRun.current) {
      firstLensRun.current = false;
      return;
    }
    setDecrypt((d) => ({ token: d.token + 1, mode: 'toggle' }));
  }, [lens]);

  useEffect(() => {
    waveAtRef.current = waveAt;
  }, [waveAt]);

  // Decode schedule keyed to each line's place in the wave, so the scramble
  // sweeps straight down. On a toggle, titles don't change, so they stay resolved.
  const decryptLines: DecryptLine[] = useMemo(
    () =>
      wave.lines.map((wl, i) => {
        // On a toggle only the bullets change; the headline and titles stay put.
        const staysResolved =
          decrypt.mode === 'toggle' && (wl.kind === 'headline' || wl.kind === 'title');
        const delays = wl.text
          .split('')
          .map((_, ci) => (staysResolved ? 0 : i * LINE_STEP_MS + HOLD_MS + ci * PER_CHAR_MS));
        return { text: wl.text, delays, seed: i + 1 };
      }),
    [wave, decrypt.mode],
  );
  const durationMs = totalLines * LINE_STEP_MS + HOLD_MS + 600;
  const shown = useDecrypt(decryptLines, decrypt.token, durationMs, reduced);

  // Measure the tight stack: each in-flow year's position while collapsed (no
  // content). The overlay years fly into exactly these; the wave then inserts
  // lines in normal flow and pushes the years apart from there.
  const sectionRef = useRef<HTMLElement | null>(null);
  const yearRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [stackPos, setStackPos] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    const measure = () => {
      const section = sectionRef.current;
      if (!section || waveAtRef.current > 0) {
        return; // only capture the stack while it's still collapsed
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
        return { ...sp, opacity: 0, dur: 200 }; // in-flow years take over
    }
  };

  const revealed = phase === 'expand' || phase === 'done';
  const overlayVisible =
    (phase === 'isolate' || phase === 'travel' || phase === 'stack') &&
    box.w > 0 &&
    stackPos.length > 0;

  // Has the wave reached line `i` yet? (Everything is shown once done.)
  const reached = (i: number): boolean => phase === 'done' || (phase === 'expand' && waveAt >= i);
  const lineText = (i: number): string =>
    reached(i) ? (shown[i] ?? wave.lines[i].text) : '';
  const bulletsShownFor = (entryIndex: number): number => {
    if (phase === 'done') return EXPERIENCE[entryIndex].bullets[lens].length;
    if (phase !== 'expand') return 0;
    return wave.bulletIndex[entryIndex].filter((i) => waveAt >= i).length;
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
          transform: `translateY(${SHIFT_UP})`,
        }}
      >
        {/* headline — line 0 of the wave. While the wave runs it decodes as plain
            text; once it lands it becomes the interactive lens control (both
            lenses visible, selected on the baseline in ink, the other in pale). */}
        {phase === 'done' ? (
          <h2
            style={{
              margin: 0,
              fontSize: HEAD_SIZE,
              fontWeight: 400,
              letterSpacing: '0.02em',
              lineHeight: 1.4,
              minHeight: '1.4em',
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
                overflow: 'visible',
              }}
            >
              {/* Fixed order: software on top, product below. The whole stack
                  slides up by one line to bring product onto the baseline; the
                  off-baseline lens shows pale above or below the sentence. */}
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  display: 'block',
                  transform: lens === LENSES[0] ? 'translateY(0)' : `translateY(-${SLOT_LINE})`,
                  transition: reduced ? 'none' : `transform 420ms ${EASE}`,
                }}
              >
                {LENSES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="exp-lens"
                    onClick={() => setLens(l)}
                    aria-pressed={lens === l}
                    style={{
                      display: 'block',
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
                      cursor: 'pointer',
                      fontWeight: 400,
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
        ) : (
          <h2
            aria-label="here's me as a software engineer"
            style={{
              margin: 0,
              fontSize: HEAD_SIZE,
              fontWeight: 400,
              letterSpacing: '0.02em',
              lineHeight: 1.4,
              minHeight: '1.4em',
            }}
          >
            <span aria-hidden>{lineText(wave.headlineIndex)}</span>
          </h2>
        )}

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
                    fontWeight: 400,
                    fontSize: 'clamp(0.95rem, 1.5vw, 1.3rem)',
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                    // The overlay year owns the fly-in; the in-flow year appears
                    // for the wave, exactly where the overlay landed.
                    opacity: revealed ? 1 : 0,
                  }}
                >
                  {entry.year}
                </div>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 400,
                      fontSize: 'clamp(0.95rem, 1.5vw, 1.3rem)',
                      lineHeight: 1.4,
                      minHeight: revealed ? '1.4em' : 0,
                    }}
                  >
                    {lineText(wave.titleIndex[entryIndex])}
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
                        <span aria-hidden>{shown[wave.bulletIndex[entryIndex][i]] ?? b}</span>
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
          they've landed and the in-flow years take over for the wave. */}
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
                  fontWeight: 400,
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
