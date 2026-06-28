'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { EXPERIENCE, LENSES, type Lens } from '@/components/story/storyData';
import { useDecrypt, type DecryptLine } from './useDecrypt';

const INK = '#1f1812';
const PALE = 'rgba(31,24,18,0.28)';
const FONT = "var(--font-geist-sans), sans-serif";
// One headline line — the slot's slide step and each lens word's box height.
// Matches the headline line-height so the selected word sits on the baseline.
const SLOT_LINE = '1.4em';

// --- reveal choreography (tunable; verify/adjust visually) ---
const LINE_STEP_MS = 150; // the wave advances one line every step
const HOLD_MS = 220; // how long a line scrambles before it starts resolving
const PER_CHAR_MS = 7; // char-to-char resolve stagger within a line
const SETTLE_MS = 350; // pause after the last line before finishing
const EASE = 'cubic-bezier(0.65,0,0.35,1)';
// A lens toggle re-decodes only the bullets; play that decode this much faster
// than the full entrance wave so switching feels snappy.
const TOGGLE_SPEEDUP = 1.75;
// On arrival the headline + lens stack fade in — after a beat, then over this
// long — so the page settles before the prompt appears.
const INTRO_FADE_MS = 800;
const INTRO_FADE_DELAY_MS = 1000;
// Years lead the decrypt list at fixed indices [0..EXPERIENCE.length-1]; the
// wave lines (headline/titles/bullets) follow, offset by this. Fixed year slots
// keep a year from briefly reading a neighbour's slot mid-toggle.
const LINE_OFFSET = EXPERIENCE.length;

// pre: not arrived. intro: headline/stack faded in, awaiting a choice. expand:
// first reveal wave. recode: a lens toggle re-running as a wave (old text ahead
// of the front, new text decoding behind it). done: settled + interactive.
type Phase = 'pre' | 'intro' | 'expand' | 'recode' | 'done';
type DecryptMode = 'wave' | 'toggle';

// The résumé is one column centered horizontally.
const CONTENT_MAX = '52rem';
// The column is anchored from the top (not vertically centered) so the headline
// holds a fixed position while bullets insert and grow the page downward.
const TOP_OFFSET = 'clamp(4rem, 16vh, 11rem)';
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

// A decoding line that doesn't reflow: an invisible copy of the FINAL text sits
// in normal flow and reserves the exact wrapped box, while the scrambling text
// is painted over it (absolutely positioned). Because the layout is always sized
// to the resolved text, the scramble's per-frame width changes can't move
// anything — essential for a proportional font like Geist where glyph widths
// differ. overflow:hidden keeps any transient overflow off the neighbours.
function DecodingText({
  final,
  shown,
  boldLen = 0,
  style,
}: {
  final: string;
  shown: string;
  /** Render the first N characters at weight 500 (e.g. a title's company). */
  boldLen?: number;
  style?: CSSProperties;
}) {
  // Split off the bold prefix in both layers so the reserved width (sizer) and
  // the painted text (overlay) track the same weights and stay aligned.
  const render = (text: string) =>
    boldLen > 0 ? (
      <>
        <span style={{ fontWeight: 500 }}>{text.slice(0, boldLen)}</span>
        {text.slice(boldLen)}
      </>
    ) : (
      text
    );
  return (
    <span style={{ position: 'relative', display: 'block', overflow: 'hidden', ...style }}>
      <span aria-hidden style={{ visibility: 'hidden' }}>
        {render(final)}
      </span>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, right: 0 }}>
        {render(shown)}
      </span>
    </span>
  );
}

type ExperienceSectionProps = {
  /** True once parked on the experience stop — drives the one-time reveal. */
  active: boolean;
};

export default function ExperienceSection({ active }: ExperienceSectionProps) {
  const reduced = useReducedMotion();
  const [lens, setLens] = useState<Lens>('software');
  const [phase, setPhase] = useState<Phase>('pre');
  // How far the wave has advanced, in lines from the top. Each step inserts the
  // next line in normal flow (pushing the lower years apart) and decodes it.
  const [waveAt, setWaveAt] = useState(0);

  const wave = useMemo(() => buildWave(lens), [lens]);
  const totalLines = wave.lines.length;

  // One decrypt token; bump it (with a mode) only when a decode should fire — the
  // entrance wave, or a lens toggle. The expand -> done transition must NOT bump
  // it, or the resolved text would re-scramble.
  const [decrypt, setDecrypt] = useState<{ token: number; mode: DecryptMode }>({
    token: 0,
    mode: 'toggle',
  });

  // Arrival: fade the headline + lens stack in (no decode). The stack sits
  // halfway between the two pale words; the résumé stays hidden until the
  // visitor picks a lens, which starts the decode wave. Reduced motion skips
  // the gate and shows everything at once with the default lens.
  useEffect(() => {
    if (!active) {
      return;
    }
    setWaveAt(0);
    setPhase(reduced ? 'done' : 'intro');
  }, [active, reduced]);

  // Picking a lens: the first choice starts the downward reveal wave; later
  // clicks (once the résumé is shown) re-run as a recode wave that sweeps the
  // old bullets into the new ones. Clicks during a wave itself are ignored.
  const handleLensClick = (l: Lens): void => {
    if (phase === 'intro') {
      setLens(l);
      setWaveAt(0);
      setPhase('expand');
      setDecrypt((d) => ({ token: d.token + 1, mode: 'wave' }));
      return;
    }
    if (phase !== 'done' || l === lens) {
      return;
    }
    setLens(l);
    setDecrypt((d) => ({ token: d.token + 1, mode: 'toggle' }));
    if (!reduced) {
      // Sweep the change through as a wave instead of re-scrambling everything.
      setWaveAt(0);
      setPhase('recode');
    }
  };

  // Advance the wave front one line per step while a wave is running. The recode
  // (toggle) wave moves faster, matching the compressed toggle decode timing.
  useEffect(() => {
    if ((phase !== 'expand' && phase !== 'recode') || reduced) {
      return;
    }
    const stepMs = phase === 'recode' ? LINE_STEP_MS / TOGGLE_SPEEDUP : LINE_STEP_MS;
    const id = window.setInterval(() => {
      setWaveAt((c) => Math.min(c + 1, totalLines - 1));
    }, stepMs);
    return () => window.clearInterval(id);
  }, [phase, reduced, totalLines]);

  // Finish once the wave has reached the last line (plus a short settle).
  useEffect(() => {
    if ((phase === 'expand' || phase === 'recode') && waveAt >= totalLines - 1) {
      const id = window.setTimeout(() => setPhase('done'), SETTLE_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase, waveAt, totalLines]);

  // Decode schedule keyed to each line's place in the wave, so the scramble
  // sweeps straight down. On a toggle, titles don't change, so they stay resolved.
  const decryptLines: DecryptLine[] = useMemo(() => {
    const toggle = decrypt.mode === 'toggle';
    // A toggle runs the same downward cascade, just compressed in time.
    const rate = toggle ? TOGGLE_SPEEDUP : 1;
    const step = LINE_STEP_MS / rate;
    const hold = HOLD_MS / rate;
    const perChar = PER_CHAR_MS / rate;
    // Years first, at fixed indices [0..EXPERIENCE.length-1]. A year rides its
    // title's wave step (decoded in lockstep), and stays resolved on a toggle
    // since it never changes. Keeping years ahead of the variable-length bullets
    // means a year's slot never shifts between lenses — otherwise it could read a
    // neighbour's slot for one frame mid-toggle (e.g. 2026 flashing 2025-2026).
    const lines: DecryptLine[] = EXPERIENCE.map((entry, entryIndex) => {
      const i = wave.titleIndex[entryIndex];
      const delays = entry.year
        .split('')
        .map((_, ci) => (toggle ? 0 : i * step + hold + ci * perChar));
      return { text: entry.year, delays, seed: 900 + entryIndex };
    });
    // Then the wave lines (headline, titles, bullets), at LINE_OFFSET + waveIndex.
    wave.lines.forEach((wl, i) => {
      // On a toggle only the bullets change; the headline and titles stay put.
      const staysResolved = toggle && (wl.kind === 'headline' || wl.kind === 'title');
      const delays = wl.text
        .split('')
        .map((_, ci) => (staysResolved ? 0 : i * step + hold + ci * perChar));
      lines.push({ text: wl.text, delays, seed: i + 1 });
    });
    return lines;
  }, [wave, decrypt.mode]);
  const durationMs = totalLines * LINE_STEP_MS + HOLD_MS + 600;
  const shown = useDecrypt(decryptLines, decrypt.token, durationMs, reduced);

  const revealed = phase === 'expand' || phase === 'recode' || phase === 'done';
  // A lens has been picked once the résumé starts revealing. Before that (intro)
  // the stack rests halfway between the two pale words, waiting for a choice.
  const chosen = phase !== 'pre' && phase !== 'intro';
  // The lens we're leaving — its bullets stay visible ahead of a recode front.
  const prevLens: Lens = lens === LENSES[0] ? LENSES[1] : LENSES[0];

  // Has the wave reached line `i` yet? Titles/years are always shown during a
  // recode (only the bullets change); during the first reveal they wait for the
  // front; once done everything is shown.
  const reached = (i: number): boolean =>
    phase === 'done' || phase === 'recode' || (phase === 'expand' && waveAt >= i);
  // The currently-painted text for a wave line / a year (falls back to the final
  // text when the decode array is mid-reindex). A year's slot is fixed at its
  // entryIndex; wave lines are offset by LINE_OFFSET (years lead the list).
  const lineShown = (i: number): string => shown[LINE_OFFSET + i] ?? wave.lines[i].text;
  const yearShown = (entryIndex: number): string =>
    shown[entryIndex] ?? EXPERIENCE[entryIndex].year;
  const bulletsShownFor = (entryIndex: number): number => {
    if (phase === 'done' || phase === 'recode') return EXPERIENCE[entryIndex].bullets[lens].length;
    if (phase !== 'expand') return 0;
    return wave.bulletIndex[entryIndex].filter((i) => waveAt >= i).length;
  };
  // What a bullet paints, plus the text its box is sized to. Ahead of a recode
  // front (the line not yet reached) it keeps the previous lens's bullet, so the
  // old text stays readable until the wave sweeps over it; behind the front it
  // decodes into the new bullet. The box tracks whichever it's showing, so it
  // grows/shrinks at the front rather than clipping.
  const bulletView = (entryIndex: number, i: number): { final: string; shown: string } => {
    const bi = wave.bulletIndex[entryIndex][i];
    if (phase === 'recode' && waveAt < bi) {
      const prev = EXPERIENCE[entryIndex].bullets[prevLens][i] ?? '';
      return { final: prev, shown: prev };
    }
    const next = EXPERIENCE[entryIndex].bullets[lens][i];
    return { final: next, shown: shown[LINE_OFFSET + bi] ?? next };
  };

  return (
    <section
      className="exp-section"
      aria-label="experience"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'safe center',
        overflowY: 'auto',
        padding: `${TOP_OFFSET} clamp(1.5rem, 8vw, 9rem) clamp(4rem, 10vh, 8rem)`,
        fontFamily: FONT,
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
        {/* headline — fades in (no decode) on arrival. The lens stack rests
            halfway between the two pale words until the visitor picks one, which
            slides the choice onto the baseline and starts the decode wave. */}
        <h2
          style={{
            margin: 0,
            fontSize: HEAD_SIZE,
            fontWeight: 400,
            letterSpacing: '0.02em',
            lineHeight: 1.4,
            minHeight: '1.4em',
            opacity: phase === 'pre' ? 0 : 1,
            transition: reduced
              ? 'none'
              : `opacity ${INTRO_FADE_MS}ms ease ${INTRO_FADE_DELAY_MS}ms`,
          }}
        >
          here&apos;s me as a{' '}
          <span
            className="exp-lens-slot"
            style={{
              display: 'inline-block',
              position: 'relative',
              verticalAlign: 'baseline',
              overflow: 'visible',
              whiteSpace: 'nowrap',
            }}
          >
            {/* Invisible in-flow anchor: gives the slot a real text baseline (so
                the selected word lines up with the sentence) and its width. Must
                match the buttons' weight so the reserved width stays correct. */}
            <span aria-hidden style={{ visibility: 'hidden', fontWeight: 500 }}>{LENSES[0]}</span>
            {/* Fixed order: software on top, product below. Before a choice the
                stack rests half a line up so the baseline falls between the two;
                a choice slides the picked word onto the baseline. */}
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                display: 'block',
                transform: chosen
                  ? lens === LENSES[0]
                    ? 'translateY(0)'
                    : `translateY(-${SLOT_LINE})`
                  : `translateY(calc(-${SLOT_LINE} / 2))`,
                transition: reduced ? 'none' : `transform 420ms ${EASE}`,
              }}
            >
              {LENSES.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="exp-lens"
                  onClick={() => handleLensClick(l)}
                  aria-pressed={chosen && lens === l}
                  style={{
                    display: 'block',
                    height: SLOT_LINE,
                    lineHeight: SLOT_LINE,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    font: 'inherit',
                    // `font` shorthand doesn't carry letter-spacing, and UA
                    // styles reset it on form controls — set it so the button
                    // word tracks exactly like the wave text and the anchor.
                    letterSpacing: '0.02em',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    fontWeight: 500,
                    // Both pale until a choice is made, then the picked lens inks.
                    color: chosen && lens === l ? INK : PALE,
                    transition: reduced ? 'none' : 'color 300ms ease',
                  }}
                >
                  {l}
                </button>
              ))}
            </span>
          </span>{' '}
          <span style={{ fontWeight: 500 }}>engineer:</span>
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          {EXPERIENCE.map((entry, entryIndex) => {
            const count = bulletsShownFor(entryIndex);
            const titleI = wave.titleIndex[entryIndex];
            return (
              <article key={entry.key} style={{ display: 'flex', gap: 'clamp(1rem, 3vw, 3rem)' }}>
                <div
                  aria-label={entry.year}
                  style={{
                    flex: '0 0 auto',
                    width: '9ch',
                    fontWeight: 400,
                    fontSize: 'clamp(0.95rem, 1.5vw, 1.3rem)',
                    lineHeight: 1.4,
                  }}
                >
                  {reached(titleI) ? (
                    <DecodingText
                      final={entry.year}
                      shown={yearShown(entryIndex)}
                      style={{ whiteSpace: 'nowrap', overflow: 'visible' }}
                    />
                  ) : null}
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
                    {reached(titleI) ? (
                      <DecodingText
                        final={wave.lines[titleI].text}
                        shown={lineShown(titleI)}
                        boldLen={entry.company.length}
                      />
                    ) : null}
                  </div>
                  <ul style={{ margin: count > 0 ? '0.5rem 0 0' : 0, padding: 0, listStyle: 'none' }}>
                    {entry.bullets[lens].slice(0, count).map((b, i) => {
                      const view = bulletView(entryIndex, i);
                      return (
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
                          {/* Marker hidden for an empty slot (a new bullet not yet
                              reached by the recode front) so no lone › shows. */}
                          {view.final !== '' ? <span aria-hidden>&rsaquo;</span> : null}
                          <DecodingText
                            final={view.final}
                            shown={view.shown}
                            style={{ flex: '1 1 auto', minWidth: 0 }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
