'use client';

import { useEffect, useState } from 'react';
import {
  MOBILE_TLDR_SECTIONS,
  TLDR_BULLETS,
  TLDR_FOOTER_LINKS,
  TLDR_NAME,
} from '@/components/story/storyData';

const INK = '#1f1812';
const PAGE_BG = '#f7f7f5';
// Breathing room above the name once it's pinned to the top of the screen.
const STICKY_TOP_PAD = '1.5rem';

/**
 * The TLDR reader's content: name, copy, and footer links. Shared by the
 * desktop takeover (TldrOverlay) and the mobile page (MobileTldr), which each
 * supply their own container. Desktop gets the quick bullet list; mobile gets
 * labeled prose sections and swaps the footer links for a pinned header row.
 */
export default function TldrContent({ mobile = false }: { mobile?: boolean }) {
  const [mobileScrolled, setMobileScrolled] = useState(false);

  useEffect(() => {
    if (!mobile) return;

    const updateScrolled = () => setMobileScrolled(window.scrollY > 0);
    updateScrolled();
    window.addEventListener('scroll', updateScrolled, { passive: true });
    return () => window.removeEventListener('scroll', updateScrolled);
  }, [mobile]);

  const name = (
    <h1
      style={{
        margin: mobile ? 0 : '0 0 1.6rem',
        fontSize: 'clamp(2rem, 4vw, 3rem)',
        fontWeight: 700,
        letterSpacing: '0.01em',
        textTransform: 'lowercase',
        lineHeight: 1.05,
      }}
    >
      {TLDR_NAME}
    </h1>
  );

  const links = (
    <div
      style={{
        marginTop: mobile ? 0 : '2.6rem',
        // In the header row, pull right so the last icon (not its tap box)
        // lines up with the column edge.
        marginRight: mobile ? '-0.375rem' : 0,
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
      }}
    >
      {TLDR_FOOTER_LINKS.map((link) => (
        <a
          key={link.key}
          href={link.href}
          target={link.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noopener noreferrer"
          aria-label={link.label}
          data-cursor-pad="-4"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: mobile ? '2.75rem' : '2rem',
            height: mobile ? '2.75rem' : '2rem',
            color: INK,
            opacity: 0.8,
          }}
        >
          {link.icon ? (
            <img
              src={link.icon}
              alt=""
              width={20}
              height={20}
              style={{ display: 'block', width: '1.25rem', height: '1.25rem', objectFit: 'contain' }}
            />
          ) : (
            // Email has no asset — a filled envelope. Pure black (#000) to
            // match the github/linkedin PNGs (not the site's warmer ink),
            // and the viewBox is cropped tight to the envelope so it fills
            // the box and centers with the full-bleed logos beside it.
            <svg
              viewBox="2 4 20 16"
              aria-hidden="true"
              style={{ display: 'block', width: '1.3rem', height: 'auto' }}
            >
              <path
                fill="#000"
                d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
              />
            </svg>
          )}
        </a>
      ))}
    </div>
  );

  return (
    <>
      {mobile ? (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            // Pad above so the pinned name isn't jammed against the screen edge;
            // the negative margin keeps its resting position unchanged.
            marginTop: `-${STICKY_TOP_PAD}`,
            paddingTop: STICKY_TOP_PAD,
            paddingBottom: '0.6rem',
            marginBottom: '1rem',
            background: PAGE_BG,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          {name}
          {links}
          {/* Solid for a short stretch, then eases out, so content is hidden
              right under the name and fade back in below it. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              height: '2.5rem',
              background: `linear-gradient(${PAGE_BG} 0%, ${PAGE_BG} 15%, rgba(247, 247, 245, 0.85) 35%, rgba(247, 247, 245, 0.45) 65%, rgba(247, 247, 245, 0) 100%)`,
              opacity: mobileScrolled ? 1 : 0,
              pointerEvents: 'none',
            }}
          />
        </div>
      ) : (
        name
      )}

      {mobile ? (
        <div>
          {MOBILE_TLDR_SECTIONS.map((section, index) => (
            <section
              key={section.label}
              aria-labelledby={`mobile-tldr-${section.label.replace(' ', '-')}`}
              style={{
                padding: index === 0 ? '0 0 1.2rem' : '1.2rem 0',
              }}
            >
              <h2
                id={`mobile-tldr-${section.label.replace(' ', '-')}`}
                style={{
                  margin: '0 0 0.55rem',
                  color: 'rgba(31, 24, 18, 0.52)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {section.label}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 400,
                  lineHeight: 1.6,
                }}
              >
                {section.body.map((segment, segmentIndex) =>
                  segment.href ? (
                    <a
                      key={segmentIndex}
                      href={segment.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'inherit',
                        textDecoration: 'underline',
                        textDecorationThickness: '1.5px',
                        textUnderlineOffset: '0.18em',
                      }}
                    >
                      {segment.text}
                    </a>
                  ) : (
                    <span key={segmentIndex}>{segment.text}</span>
                  ),
                )}
              </p>
            </section>
          ))}
        </div>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1em',
            fontSize: 'clamp(0.95rem, 1.15vw, 1.15rem)',
            lineHeight: 1.7,
            fontWeight: 400,
          }}
        >
          {TLDR_BULLETS.map((segments, index) => (
            <li
              key={index}
              style={{
                position: 'relative',
                paddingLeft: '1.2em',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  opacity: 0.45,
                }}
              >
                —
              </span>
              {segments.map((segment, segmentIndex) =>
                segment.href ? (
                  <a
                    key={segmentIndex}
                    href={segment.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'inherit',
                      textDecoration: 'underline',
                      textDecorationThickness: '1.5px',
                      textUnderlineOffset: '0.18em',
                    }}
                  >
                    {segment.text}
                  </a>
                ) : (
                  <span key={segmentIndex}>{segment.text}</span>
                ),
              )}
            </li>
          ))}
        </ul>
      )}

      {mobile ? null : links}
    </>
  );
}
