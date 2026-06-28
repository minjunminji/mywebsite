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
