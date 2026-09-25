'use client';

import { useEffect, useRef } from 'react';
import {
  TLDR_BULLETS,
  TLDR_FOOTER_LINKS,
  TLDR_NAME,
} from '@/components/story/storyData';
import { DOCKED_CENTER_Y } from '@/components/story/StoryNav';
import { useScrollFade } from '@/components/useScrollFade';
import { useInertOutside } from '@/components/useInertOutside';

const INK = '#1f1812';
const PAGE_BG = '#f7f7f5';

type TldrOverlayProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen, fully opaque "reader" takeover for the TLDR button. It stays
 * mounted (toggled by `open`) so its fade-out plays and focus can be restored;
 * `inert` + `aria-hidden` take it out of the tab order and a11y tree when closed.
 * The story state underneath is untouched, so closing lands you exactly where
 * you were. See docs/plans/2026-07-21-tldr-takeover-design.md.
 */
export default function TldrOverlay({ open, onClose }: TldrOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const { scrollRef, contentRef, onScroll, maskImage } = useScrollFade();
  // Keep Tab inside the takeover while it's open.
  useInertOutside(rootRef, open);

  // Take the closed overlay out of the tab order without killing the fade-out
  // (visibility:hidden would). `inert` is set imperatively to dodge attribute
  // typing differences across React versions.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (open) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Move focus to the close button on open; restore it to the opener on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const id = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    restoreFocusRef.current?.focus?.();
    return undefined;
  }, [open]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="tldr — about ryan kim"
      aria-hidden={!open}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: PAGE_BG,
        color: INK,
        opacity: open ? 1 : 0,
        transition: 'opacity 300ms ease',
        pointerEvents: open ? 'auto' : 'none',
        fontFamily: 'var(--font-alte-haas-grotesk), Arial, sans-serif',
      }}
    >
      {/* Close (X) — also bound to Esc above. */}
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="close"
        data-cursor-pad="-4"
        style={{
          position: 'absolute',
          // Same spot as the top-right cluster's icons (StoryPlayer.tsx).
          top: DOCKED_CENTER_Y,
          right: '1.5rem',
          transform: 'translateY(-50%)',
          zIndex: 1,
          width: '2rem',
          height: '2rem',
          display: 'grid',
          placeItems: 'center',
          border: 'none',
          background: 'transparent',
          color: INK,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Scroll container — centers the column when it fits, scrolls when it
          doesn't (margin:auto in a flex column stays scroll-safe). */}
      <div
        ref={scrollRef}
        className="custom-scroll"
        onScroll={onScroll}
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          WebkitMaskImage: maskImage,
          maskImage,
        }}
      >
        <div
          ref={contentRef}
          style={{
            margin: 'auto',
            width: '100%',
            maxWidth: '42rem',
            padding: 'clamp(4rem, 12vh, 8rem) clamp(1.5rem, 6vw, 4rem)',
          }}
        >
          <h1
            style={{
              margin: '0 0 1.6rem',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 600,
              letterSpacing: '0.01em',
              textTransform: 'lowercase',
              lineHeight: 1.05,
            }}
          >
            {TLDR_NAME}
          </h1>

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
              fontWeight: 300,
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

          <div
            style={{
              marginTop: '2.6rem',
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
                  width: '2rem',
                  height: '2rem',
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
        </div>
      </div>
    </div>
  );
}
