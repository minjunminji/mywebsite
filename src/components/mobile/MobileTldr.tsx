'use client';

import { useEffect, useRef, useState } from 'react';
import TldrContent from '@/components/story/TldrContent';
import { frameLoader } from '@/components/story/frameLoader';
import { MOBILE_QUERY } from './breakpoint';

const landingFrames = Array.from({ length: 4 }, (_, i) => `/Animation/mobile/landingloop${i + 1}.webp`);

// Same pace as the desktop landing loop.
const LOOP_INTERVAL_MS = 180;
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

// The first frame can load near the viewport. Decode the remaining frames
// only when this artwork is nearby and the visitor wants animation.
function LandingLoop() {
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cancelled = false;
    let nearby = false;
    const update = async () => {
      if (motion.matches || !nearby) { setAnimate(false); setFrame(0); return; }
      const ready = await Promise.all(landingFrames.map((src) => frameLoader.load(src)));
      if (!cancelled && !motion.matches && nearby) setAnimate(ready.every(Boolean));
    };
    const observer = new IntersectionObserver(([entry]) => {
      nearby = entry.isIntersecting;
      void update();
    }, { rootMargin: '200px' });
    if (root.current) observer.observe(root.current);
    motion.addEventListener('change', update);
    return () => {
      cancelled = true;
      observer.disconnect();
      motion.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (!animate) return;
    const id = window.setInterval(
      () => setFrame((f) => (f + 1) % landingFrames.length),
      LOOP_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [animate]);

  return (
    <div
      ref={root}
      aria-hidden
      style={{ position: 'relative', aspectRatio: '1920 / 520', flexShrink: 0, overflow: 'hidden' }}
    >
      {(animate ? landingFrames : landingFrames.slice(0, 1)).map((src, idx) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          width={960}
          height={260}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            visibility: idx === frame ? 'visible' : 'hidden',
          }}
        />
      ))}
    </div>
  );
}
