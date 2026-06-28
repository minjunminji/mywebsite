'use client';

import { useEffect, useMemo, useState } from 'react';
import { EXPERIENCE, LENSES, type Lens } from '@/components/story/storyData';
import { scanDelayMs } from './decrypt';
import { useDecrypt, type DecryptLine } from './useDecrypt';

const INK = '#1f1812';
const MONO = "var(--font-inconsolata), ui-monospace, monospace";
const SLOT_LINE = '1.15em';

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

export default function ExperienceSection() {
  const [lens, setLens] = useState<Lens>('software');
  const reduced = useReducedMotion();

  // Flatten the active lens's bullets into decrypt lines in the SAME nested
  // order they render (entry by entry, bullet by bullet), giving each a global
  // line index used for the scan stagger and a stable per-line seed.
  const lines: DecryptLine[] = useMemo(() => {
    const out: DecryptLine[] = [];
    let lineIndex = 0;
    for (const entry of EXPERIENCE) {
      for (const text of entry.bullets[lens]) {
        out.push({
          text,
          delays: text.split('').map((_, ci) => scanDelayMs(ci, lineIndex, 7, 110)),
          seed: lineIndex + 1,
        });
        lineIndex += 1;
      }
    }
    return out;
  }, [lens]);

  const shown = useDecrypt(lines, lens, 850, reduced);

  // Map the flat `shown` array back onto the nested bullets, falling back to the
  // raw bullet text so a line is never blank.
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

  return (
    <section
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
              transition: reduced ? 'none' : 'transform 420ms cubic-bezier(0.65,0,0.35,1)',
            }}
          >
            {LENSES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLens(l)}
                aria-pressed={lens === l}
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
        </span>{' '}
        engineer
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8rem' }}>
        {EXPERIENCE.map((entry, entryIndex) => (
          <article key={entry.key} style={{ display: 'flex', gap: 'clamp(1rem, 3vw, 3rem)' }}>
            <div
              style={{
                flex: '0 0 auto',
                width: '9ch',
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
    </section>
  );
}
