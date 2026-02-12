'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Phase = 'introLanding' | 'introTrainSequence' | 'trainLoop' | 'transition' | 'about';

const landingFrames = [
  '/Animation/landingloop1.png',
  '/Animation/landingloop2.png',
  '/Animation/landingloop3.png',
  '/Animation/landingloop4.png',
];

const trainSequenceFrames = Array.from({ length: 20 }, (_, index) => `/Animation/train${index + 1}.png`);

const trainLoopFrames = [
  '/Animation/trainloop1.png',
  '/Animation/trainloop2.png',
  '/Animation/trainloop3.png',
  '/Animation/trainloop4.png',
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
const TRAIN_SEQUENCE_INTERVAL_MS = 1000 / 12;
const TRANSITION_PLAYBACK_FPS = 12;
const SCROLL_HEIGHT_VH = 340;
const TRANSITION_START_VH = 95;
const TRANSITION_LENGTH_VH = 145;
const TRANSITION_COMPLETE_EPSILON = 0.995;
const CORNER_TITLE_FADE_IN_VH = 24;
const ABOUT_INITIAL_DELAY_MS = 260;
const ABOUT_CHAR_STAGGER_MS = 24;
const ABOUT_LINE_GAP_MS = 208;
const ABOUT_LINES = [
  "hi, i'm ryan!",
  "i'm a sophomore computer engineering student at the university of british columbia, and i love building things that make me or other people happy.",
  'in my spare time, i like to produce music, cook, and play soccer.',
];
const LANDING_LOOP_REPEATS = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export default function ScrollScenePlayer() {
  const targetTransitionFrameRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('introLanding');
  const [landingFrame, setLandingFrame] = useState(0);
  const [, setLandingLoopsCompleted] = useState(0);
  const [trainSequenceFrame, setTrainSequenceFrame] = useState(0);
  const [trainLoopFrame, setTrainLoopFrame] = useState(0);
  const [aboutFrame, setAboutFrame] = useState(0);
  const [transitionFrame, setTransitionFrame] = useState(0);
  const [cornerTitleOpacity, setCornerTitleOpacity] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [aboutAnimationSeed, setAboutAnimationSeed] = useState(0);

  useEffect(() => {
    const allFrames = [...landingFrames, ...trainSequenceFrames, ...trainLoopFrames, ...transitionFrames, ...aboutFrames];
    allFrames.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  useEffect(() => {
    if (phase === 'introLanding') {
      const tick = window.setInterval(() => {
        setLandingFrame((previous) => {
          const next = (previous + 1) % landingFrames.length;

          if (next === 0) {
            setLandingLoopsCompleted((completed) => {
              const updated = completed + 1;
              if (updated >= LANDING_LOOP_REPEATS) {
                setPhase('introTrainSequence');
              }
              return updated;
            });
          }

          return next;
        });
      }, LOOP_INTERVAL_MS);

      return () => {
        window.clearInterval(tick);
      };
    }

    if (phase === 'introTrainSequence') {
      const tick = window.setInterval(() => {
        setTrainSequenceFrame((previous) => {
          if (previous >= trainSequenceFrames.length - 1) {
            setPhase('trainLoop');
            return previous;
          }

          return previous + 1;
        });
      }, TRAIN_SEQUENCE_INTERVAL_MS);

      return () => {
        window.clearInterval(tick);
      };
    }

    const loopFrames = phase === 'trainLoop' ? trainLoopFrames : phase === 'about' ? aboutFrames : null;

    if (!loopFrames) {
      return;
    }

    const tick = window.setInterval(() => {
      if (phase === 'trainLoop') {
        setTrainLoopFrame((previous) => (previous + 1) % trainLoopFrames.length);
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
      const cornerOpacity = clamp((scrollY - transitionStart) / cornerTitleFadeLength, 0, 1);

      setScrollProgress(pageProgress);
      setCornerTitleOpacity(cornerOpacity);

      if (phase === 'introLanding' || phase === 'introTrainSequence') {
        return;
      }

      if (scrollY < transitionStart) {
        setPhase('trainLoop');
        setTransitionFrame(0);
        targetTransitionFrameRef.current = 0;
        return;
      }

      const transitionProgress = clamp((scrollY - transitionStart) / transitionLength, 0, 1);
      if (transitionProgress >= TRANSITION_COMPLETE_EPSILON) {
        setPhase('about');
        setTransitionFrame(transitionFrames.length - 1);
        targetTransitionFrameRef.current = transitionFrames.length - 1;
        return;
      }

      const frameIndex = clamp(
        Math.round(transitionProgress * (transitionFrames.length - 1)),
        0,
        transitionFrames.length - 1,
      );

      targetTransitionFrameRef.current = frameIndex;
      setPhase('transition');
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === 'about') {
      setAboutAnimationSeed((previous) => previous + 1);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'transition') {
      return;
    }

    let animationFrameId = 0;
    let previousTimestamp = 0;
    const frameDurationMs = 1000 / TRANSITION_PLAYBACK_FPS;

    const tick = (timestamp: number) => {
      if (previousTimestamp === 0) {
        previousTimestamp = timestamp;
      }

      if (timestamp - previousTimestamp >= frameDurationMs) {
        previousTimestamp = timestamp;
        setTransitionFrame((previous) => {
          const target = targetTransitionFrameRef.current;
          if (previous === target) {
            return previous;
          }

          const distance = Math.abs(target - previous);
          const step = distance > 10 ? 3 : distance > 4 ? 2 : 1;
          return previous + Math.sign(target - previous) * step;
        });
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [phase]);

  useEffect(() => {
    const shouldLockScroll = phase === 'introLanding' || phase === 'introTrainSequence';
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (shouldLockScroll) {
      window.scrollTo(0, 0);
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [phase]);

  const frameToRender = useMemo(() => {
    if (phase === 'introLanding') {
      return landingFrames[landingFrame];
    }

    if (phase === 'introTrainSequence') {
      return trainSequenceFrames[trainSequenceFrame];
    }

    if (phase === 'trainLoop') {
      return trainLoopFrames[trainLoopFrame];
    }

    if (phase === 'about') {
      return aboutFrames[aboutFrame];
    }

    return transitionFrames[transitionFrame];
  }, [phase, landingFrame, trainSequenceFrame, trainLoopFrame, transitionFrame, aboutFrame]);

  const useTrainBlendMode = phase === 'introTrainSequence' || phase === 'trainLoop';

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
            mixBlendMode: useTrainBlendMode ? 'multiply' : 'normal',
          }}
        />
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'Cascadia Mono', monospace",
            fontWeight: 300,
            fontSize: 'clamp(0.75rem, 1vw, 0.95rem)',
            lineHeight: 1,
            letterSpacing: '0.02em',
            color: '#1f1812',
            opacity: 0.78,
            pointerEvents: 'none',
            userSelect: 'none',
            textTransform: 'lowercase',
            zIndex: 20,
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          this website is a work in progress
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
            left: '3vw',
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
