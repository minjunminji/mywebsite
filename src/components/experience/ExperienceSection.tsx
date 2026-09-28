'use client';

import { EXPERIENCE } from '@/components/story/storyData';
import { useScrollFade } from '@/components/useScrollFade';

const INK = '#1f1812';
const FONT = "var(--font-alte-haas-grotesk), Arial, sans-serif";

// The résumé is one column centered horizontally.
const CONTENT_MAX = '52rem';
// The column is anchored from the top rather than vertically centered.
const TOP_OFFSET = 'clamp(4rem, 16vh, 11rem)';
// Years and titles share one scale.
const ROW_SIZE = 'clamp(0.95rem, 1.5vw, 1.3rem)';

export default function ExperienceSection() {
  // The résumé list scrolls on its own once it outgrows the viewport.
  const { scrollRef, contentRef, onScroll, maskImage } = useScrollFade();

  return (
    <section
      className="exp-section"
      aria-label="experience"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        padding: `${TOP_OFFSET} clamp(1.5rem, 8vw, 9rem) clamp(2rem, 6vh, 5rem)`,
        fontFamily: FONT,
        color: INK,
        zIndex: 4,
      }}
    >
      <div
        ref={scrollRef}
        className="custom-scroll"
        onScroll={onScroll}
        style={{
          width: `min(${CONTENT_MAX}, 100%)`,
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: '1.25rem',
          WebkitMaskImage: maskImage,
          maskImage,
        }}
      >
        <div
          ref={contentRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.4rem',
            paddingBottom: '2.5rem',
          }}
        >
          {EXPERIENCE.map((entry) => (
            <article key={entry.key} style={{ display: 'flex', gap: 'clamp(1rem, 3vw, 3rem)' }}>
              <div
                style={{
                  flex: '0 0 auto',
                  width: '9ch',
                  fontSize: ROW_SIZE,
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.year}
              </div>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontSize: ROW_SIZE, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700 }}>{entry.company}</span> / {entry.title}
                </div>
                <ul style={{ margin: '0.5rem 0 0', padding: 0, listStyle: 'none' }}>
                  {entry.bullets.software.map((b, i) => (
                    <li
                      key={`${entry.key}-${i}`}
                      style={{
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
      </div>
    </section>
  );
}
