'use client';

import { useEffect, useMemo, useState } from 'react';

type Phase = 'landing' | 'transition' | 'about';

const landingFrames = [
  '/Animation/landingloop1.png',
  '/Animation/landingloop2.png',
  '/Animation/landingloop3.png',
  '/Animation/landingloop4.png',
];

const transitionFrames = Array.from(
  { length: 25 },
  (_, index) => `/Animation/1trans${index + 1}.png`,
);

const aboutFrames = [
  '/Animation/aboutloop1.png',
  '/Animation/aboutloop2.png',
  '/Animation/aboutloop3.png',
  '/Animation/aboutloop4.png',
];

const LOOP_INTERVAL_MS = 180;
const SCROLL_HEIGHT_VH = 340;
const TRANSITION_START_VH = 95;
const TRANSITION_LENGTH_VH = 145;
const CORNER_TITLE_FADE_IN_VH = 24;
const ABOUT_INITIAL_DELAY_MS = 260;
const ABOUT_CHAR_STAGGER_MS = 24;
const ABOUT_LINE_GAP_MS = 208;
const ABOUT_LINES = [
  "hi, i'm ryan!",
  "i'm a sophomore computer engineering student at the university of british columbia, and i love building things that make me or other people happy.",
  'in my spare time, i like to produce music, cook, and play soccer.',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export default function ScrollScenePlayer() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [landingFrame, setLandingFrame] = useState(0);
  const [aboutFrame, setAboutFrame] = useState(0);
  const [transitionFrame, setTransitionFrame] = useState(0);
  const [landingTitleOpacity, setLandingTitleOpacity] = useState(1);
  const [cornerTitleOpacity, setCornerTitleOpacity] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [aboutAnimationSeed, setAboutAnimationSeed] = useState(0);

  useEffect(() => {
    const allFrames = [...landingFrames, ...transitionFrames, ...aboutFrames];
    allFrames.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  useEffect(() => {
    const loopFrames = phase === 'landing' ? landingFrames : phase === 'about' ? aboutFrames : null;

    if (!loopFrames) {
      return;
    }

    const tick = window.setInterval(() => {
      if (phase === 'landing') {
        setLandingFrame((previous) => (previous + 1) % landingFrames.length);
      } else {
        setAboutFrame((previous) => (previous + 1) % aboutFrames.length);
      }
    }, LOOP_INTERVAL_MS);

    return () => {
      window.clearInterval(tick);
    };
  }, [phase]);

  useEffect(() => {
    const handleScroll = () => {
      const viewportHeight = window.innerHeight;
      const transitionStart = (TRANSITION_START_VH / 100) * viewportHeight;
      const transitionLength = (TRANSITION_LENGTH_VH / 100) * viewportHeight;
      const cornerTitleFadeLength = (CORNER_TITLE_FADE_IN_VH / 100) * viewportHeight;
      const scrollY = window.scrollY;
      const maxScroll = Math.max(document.documentElement.scrollHeight - viewportHeight, 1);
      const pageProgress = clamp(scrollY / maxScroll, 0, 1);
      const titleOpacity = clamp(1 - scrollY / transitionStart, 0, 1);
      const cornerOpacity = clamp((scrollY - transitionStart) / cornerTitleFadeLength, 0, 1);

      setScrollProgress(pageProgress);
      setLandingTitleOpacity(titleOpacity);
      setCornerTitleOpacity(cornerOpacity);

      if (scrollY < transitionStart) {
        setPhase('landing');
        setTransitionFrame(0);
        return;
      }

      if (scrollY >= transitionStart + transitionLength) {
        setPhase('about');
        setTransitionFrame(transitionFrames.length - 1);
        return;
      }

      const transitionProgress = (scrollY - transitionStart) / transitionLength;
      const frameIndex = clamp(
        Math.round(transitionProgress * (transitionFrames.length - 1)),
        0,
        transitionFrames.length - 1,
      );

      setPhase('transition');
      setTransitionFrame(frameIndex);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (phase === 'about') {
      setAboutAnimationSeed((previous) => previous + 1);
    }
  }, [phase]);

  const frameToRender = useMemo(() => {
    if (phase === 'landing') {
      return landingFrames[landingFrame];
    }

    if (phase === 'about') {
      return aboutFrames[aboutFrame];
    }

    return transitionFrames[transitionFrame];
  }, [phase, landingFrame, transitionFrame, aboutFrame]);

  return (
    <div
      style={{
        height: `${SCROLL_HEIGHT_VH}vh`,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          width: '100%',
          overflow: 'hidden',
          background: '#f6f2ea',
        }}
      >
        <img
          src={frameToRender}
          alt="Hand-drawn animated scene"
          draggable={false}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            userSelect: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '79%',
            transform: 'translate(-50%, -50%)',
            fontFamily: "'Cascadia Mono', monospace",
            fontWeight: 600,
            fontSize: 'clamp(1.6rem, 3.6vw, 3rem)',
            lineHeight: 1,
            letterSpacing: '0.04em',
            color: '#1f1812',
            opacity: landingTitleOpacity,
            transition: 'opacity 120ms linear',
            pointerEvents: 'none',
            userSelect: 'none',
            textTransform: 'lowercase',
          }}
        >
          ryan kim
        </div>
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            left: '1.5rem',
            fontFamily: "'Cascadia Mono', monospace",
            fontWeight: 600,
            fontSize: 'clamp(0.95rem, 1.2vw, 1.25rem)',
            lineHeight: 1,
            letterSpacing: '0.03em',
            color: '#1f1812',
            opacity: cornerTitleOpacity,
            transition: 'opacity 140ms linear',
            pointerEvents: 'none',
            userSelect: 'none',
            textTransform: 'lowercase',
            zIndex: 20,
          }}
        >
          ryan kim
        </div>
        <section
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '33.334%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8vh 4vw',
            opacity: phase === 'about' ? 1 : 0,
            pointerEvents: 'none',
            transition: 'opacity 220ms ease',
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '28rem',
              color: '#1f1812',
              fontFamily: "'Cascadia Mono', monospace",
              fontWeight: 600,
              fontSize: 'clamp(0.95rem, 1.25vw, 1.2rem)',
              lineHeight: 1.7,
            }}
          >
            {ABOUT_LINES.map((line, index) => {
              const lineStartDelay =
                ABOUT_INITIAL_DELAY_MS +
                ABOUT_LINES.slice(0, index).join('').length * ABOUT_CHAR_STAGGER_MS +
                index * ABOUT_LINE_GAP_MS;

              return (
                <p
                  key={`${line}-${aboutAnimationSeed}`}
                  style={{
                    margin: 0,
                    marginBottom: index < ABOUT_LINES.length - 1 ? '1.15em' : 0,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'break-word',
                    fontWeight: index === 0 ? 600 : 300,
                  }}
                >
                  {line.split('').map((char, charIndex) => {
                    const delay = lineStartDelay + charIndex * ABOUT_CHAR_STAGGER_MS;

                    return (
                      <span
                        key={`${char}-${charIndex}-${aboutAnimationSeed}`}
                        style={{
                          opacity: 0,
                          animationName: 'aboutCharFadeIn',
                          animationDuration: '520ms',
                          animationTimingFunction: 'ease',
                          animationFillMode: 'forwards',
                          animationDelay: `${delay}ms`,
                        }}
                      >
                        {char}
                      </span>
                    );
                  })}
                </p>
              );
            })}
          </div>
        </section>
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '7px',
            height: '100vh',
            overflow: 'hidden',
            zIndex: 30,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              height: `${scrollProgress * 100}%`,
              background: '#000000',
              transition: 'height 90ms linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}
