'use client';

import { useEffect, useState } from 'react';
import TldrContent from '@/components/story/TldrContent';
import { landingFrames } from '@/components/story/storyData';

// Same pace as the desktop landing loop.
const LOOP_INTERVAL_MS = 180;
// The station strip inside the 16:9 landing frames, as fractions of the frame.
// The loop is cropped to exactly this and fit to the full screen width.
const LANDING_CROP = { x: 0, y: 490 / 1080, w: 1, h: 520 / 1080 };
const FRAME_ASPECT = 16 / 9;

/**
 * The mobile site: just the TLDR reader as a normal scrolling page, with the
 * landing loop at the bottom. The scene engine is mouse-and-landscape shaped,
 * so phones get the rundown instead.
 */
export default function MobileTldr() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        color: '#1f1812',
      }}
    >
      {/* Same column as the desktop takeover; margin:auto centres it when it
          fits and lets it scroll when it doesn't. */}
      <div
        style={{
          margin: 'auto',
          width: '100%',
          maxWidth: '42rem',
          padding: 'clamp(3rem, 10vh, 6rem) clamp(1.5rem, 6vw, 4rem)',
        }}
      >
        <TldrContent mobile />
      </div>
      <p
        style={{
          margin: '0 0 1rem',
          padding: '0 1.5rem',
          textAlign: 'center',
          fontSize: '0.8rem',
          opacity: 0.55,
        }}
      >
        the full interactive version is available on desktop
      </p>
      {/* Outside the padded column so it runs edge to edge. */}
      <LandingLoop />
    </div>
  );
}

// All frames stay mounted and only the current one is visible, so swapping
// never waits on a decode.
function LandingLoop() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(
      () => setFrame((f) => (f + 1) % landingFrames.length),
      LOOP_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        // Crop box aspect: the crop's share of a 16:9 frame.
        aspectRatio: `${LANDING_CROP.w * FRAME_ASPECT} / ${LANDING_CROP.h}`,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {landingFrames.map((src, idx) => (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            // Scale/offset the full frame so LANDING_CROP fills this box.
            left: `${(-LANDING_CROP.x / LANDING_CROP.w) * 100}%`,
            top: `${(-LANDING_CROP.y / LANDING_CROP.h) * 100}%`,
            width: `${100 / LANDING_CROP.w}%`,
            height: `${100 / LANDING_CROP.h}%`,
            maxWidth: 'none',
            visibility: idx === frame ? 'visible' : 'hidden',
          }}
        />
      ))}
    </div>
  );
}
