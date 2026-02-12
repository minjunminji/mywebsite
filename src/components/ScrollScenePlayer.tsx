'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Phase =
  | 'introLanding'
  | 'introTrainSequence'
  | 'trainLoop'
  | 'transition'
  | 'about'
  | 'transitionTwo'
  | 'projects';

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

const transitionTwoFrames = Array.from(
  { length: 22 },
  (_, index) => `/Animation/2trans${index + 1}.png`,
);

const turnstileFrames = Array.from(
  { length: 6 },
  (_, index) => `/Animation/turnstile${index + 1}.png`,
);
const turnstileBackgroundFrame = '/turnstile_background.png';

const projectStills = {
  thisWebsite: '/Animation/thiswebsite.png',
  rebase: '/Animation/rebase.png',
  mango: '/Animation/mango.png',
} as const;

type ProjectContent = {
  key: 'thisWebsite' | 'rebase' | 'mango';
  title: string;
  body: readonly string[];
  linkHref?: string;
  imageSrc?: string;
  imageAlt?: string;
  imageCaption?: string;
  carouselImages?: readonly {
    src: string;
    alt: string;
  }[];
  videoEmbedSrc?: string;
  videoTitle?: string;
};

const PROJECT_CONTENT: readonly ProjectContent[] = [
  {
    key: 'thisWebsite',
    title: 'this website',
    body: [
      'my old portfolio was hand-drawn too, but it felt static. i rebuilt it as a scroll-driven story so the site feels like a film you move through.',
      'i challenged myself to learn animation and built a custom frame-by-frame scene system in next.js + react to make the experience linear, cinematic, and interactive.',
      'this project is where my love for illustration, design, and frontend engineering all meet.',
    ],
    imageSrc: '/oldwebsite.png',
    imageAlt: 'Old portfolio website screenshot',
    imageCaption: 'my old website',
  },
  {
    key: 'rebase',
    title: 'rebase',
    linkHref: 'http://tryrebase.io/',
    body: [
      'an ai-native resume builder that stores your experience as reusable building blocks instead of rewriting one static document every time.',
      'you paste a job description, and it pulls the most relevant experience, rewrites bullets for role fit, and exports an ats-friendly pdf with typst.',
      'it also helps you capture wins as they happen and asks targeted follow-up questions to turn vague points into specific, credible impact.',
    ],
    carouselImages: [
      {
        src: '/rebase1.png',
        alt: 'Rebase screenshot 1',
      },
      {
        src: '/rebase2.png',
        alt: 'Rebase screenshot 2',
      },
      {
        src: '/rebase3.png',
        alt: 'Rebase screenshot 3',
      },
      {
        src: '/rebase4.png',
        alt: 'Rebase screenshot 4',
      },
    ],
  },
  {
    key: 'mango',
    title: 'mango',
    linkHref: 'https://devpost.com/software/mango-full-body-gesture-control-for-any-game',
    body: [
      'mango turns any webcam into a full-body game controller, so you can play minecraft with gestures and movement, no vr headset or external sensors required.',
      'it tracks body motion in real time and maps your movements directly to in-game inputs for a hands-free, immersive control experience.',
      'built in 12 hours with opencv, mediapipe holistic, python, and pyinput, this project won 1st place at hellohacks 2025.',
    ],
    videoEmbedSrc: 'https://www.youtube.com/embed/pdja2_o8bpY',
    videoTitle: 'Mango full-body gesture control demo',
  },
];

const LOOP_INTERVAL_MS = 180;
const TRAIN_SEQUENCE_INTERVAL_MS = 1000 / 12;
const TRANSITION_PLAYBACK_FPS = 12;
const TURNSTILE_FRAME_INTERVAL_MS = Math.round(1000 / 15);
const TRANSITION_START_VH = 95;
const TRANSITION_LENGTH_VH = 145;
const ABOUT_SECTION_VH = 100;
const TRANSITION_TWO_LENGTH_VH = 145;
const PROJECT_THIS_WEBSITE_HOLD_VH = 39.2;
const PROJECT_FIRST_TURNSTILE_ENTRY_VH = 23.8;
const PROJECT_SECOND_TURNSTILE_ENTRY_VH = 34;
const PROJECT_REBASE_HOLD_VH = 80;
const PROJECT_FINAL_HOLD_VH = 120;
const SCROLL_HEIGHT_VH =
  TRANSITION_START_VH +
  TRANSITION_LENGTH_VH +
  ABOUT_SECTION_VH +
  TRANSITION_TWO_LENGTH_VH +
  PROJECT_THIS_WEBSITE_HOLD_VH +
  PROJECT_FIRST_TURNSTILE_ENTRY_VH +
  PROJECT_REBASE_HOLD_VH +
  PROJECT_SECOND_TURNSTILE_ENTRY_VH +
  PROJECT_FINAL_HOLD_VH;
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
const GLOBAL_WHEEL_DELTA_MAX_PX = 65;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export default function ScrollScenePlayer() {
  const projectBlocksRef = useRef<HTMLDivElement | null>(null);
  const targetTransitionFrameRef = useRef(0);
  const targetTransitionTwoFrameRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('introLanding');
  const [landingFrame, setLandingFrame] = useState(0);
  const [, setLandingLoopsCompleted] = useState(0);
  const [trainSequenceFrame, setTrainSequenceFrame] = useState(0);
  const [trainLoopFrame, setTrainLoopFrame] = useState(0);
  const [aboutFrame, setAboutFrame] = useState(0);
  const [transitionFrame, setTransitionFrame] = useState(0);
  const [transitionTwoFrame, setTransitionTwoFrame] = useState(0);
  const [projectFrame, setProjectFrame] = useState<string>(projectStills.thisWebsite);
  const [cornerTitleOpacity, setCornerTitleOpacity] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [aboutAnimationSeed, setAboutAnimationSeed] = useState(0);
  const [firstRotationTriggered, setFirstRotationTriggered] = useState(false);
  const [firstRotationCompleted, setFirstRotationCompleted] = useState(false);
  const [secondRotationTriggered, setSecondRotationTriggered] = useState(false);
  const [secondRotationCompleted, setSecondRotationCompleted] = useState(false);
  const [projectBlockIndex, setProjectBlockIndex] = useState(0);
  const [hoveredProjectLink, setHoveredProjectLink] = useState<ProjectContent['key'] | null>(null);
  const [projectCarouselIndex, setProjectCarouselIndex] = useState<
    Record<ProjectContent['key'], number>
  >({
    thisWebsite: 0,
    rebase: 0,
    mango: 0,
  });

  const stepProjectCarousel = (key: ProjectContent['key'], direction: -1 | 1, total: number) => {
    setProjectCarouselIndex((previous) => {
      const current = previous[key] ?? 0;
      const next = (current + direction + total) % total;

      return {
        ...previous,
        [key]: next,
      };
    });
  };

  const jumpProjectCarousel = (key: ProjectContent['key'], index: number) => {
    setProjectCarouselIndex((previous) => ({
      ...previous,
      [key]: index,
    }));
  };

  useEffect(() => {
    const allFrames = [
      ...landingFrames,
      ...trainSequenceFrames,
      ...trainLoopFrames,
      ...transitionFrames,
      ...aboutFrames,
      ...transitionTwoFrames,
      ...turnstileFrames,
      turnstileBackgroundFrame,
      projectStills.thisWebsite,
      projectStills.rebase,
      projectStills.mango,
    ];
    allFrames.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        return;
      }

      const deltaScale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? window.innerHeight
            : 1;
      const rawDelta = event.deltaY * deltaScale;
      const clampedDelta = clamp(rawDelta, -GLOBAL_WHEEL_DELTA_MAX_PX, GLOBAL_WHEEL_DELTA_MAX_PX);

      if (clampedDelta === rawDelta) {
        return;
      }

      event.preventDefault();
      window.scrollTo({
        top: window.scrollY + clampedDelta,
        behavior: 'auto',
      });
    };

    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
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
    if (!firstRotationTriggered || firstRotationCompleted) {
      return;
    }

    let frameIndex = 1;
    setProjectFrame(turnstileFrames[frameIndex]);

    const tick = window.setInterval(() => {
      frameIndex += 1;

      if (frameIndex >= turnstileFrames.length) {
        window.clearInterval(tick);
        setProjectFrame(projectStills.rebase);
        setFirstRotationCompleted(true);
        return;
      }

      setProjectFrame(turnstileFrames[frameIndex]);
    }, TURNSTILE_FRAME_INTERVAL_MS);

    return () => {
      window.clearInterval(tick);
    };
  }, [firstRotationTriggered, firstRotationCompleted]);

  useEffect(() => {
    if (!secondRotationTriggered || secondRotationCompleted) {
      return;
    }

    let frameIndex = 1;
    setProjectFrame(turnstileFrames[frameIndex]);

    const tick = window.setInterval(() => {
      frameIndex += 1;

      if (frameIndex >= turnstileFrames.length) {
        window.clearInterval(tick);
        setProjectFrame(projectStills.mango);
        setSecondRotationCompleted(true);
        return;
      }

      setProjectFrame(turnstileFrames[frameIndex]);
    }, TURNSTILE_FRAME_INTERVAL_MS);

    return () => {
      window.clearInterval(tick);
    };
  }, [secondRotationTriggered, secondRotationCompleted]);

  useEffect(() => {
    const handleScroll = () => {
      const viewportHeight = window.innerHeight;
      const transitionStart = (TRANSITION_START_VH / 100) * viewportHeight;
      const transitionLength = (TRANSITION_LENGTH_VH / 100) * viewportHeight;
      const transitionOneEnd = transitionStart + transitionLength;
      const aboutLength = (ABOUT_SECTION_VH / 100) * viewportHeight;
      const aboutEnd = transitionOneEnd + aboutLength;
      const transitionTwoLength = (TRANSITION_TWO_LENGTH_VH / 100) * viewportHeight;
      const transitionTwoEnd = aboutEnd + transitionTwoLength;
      const thisWebsiteHoldEnd =
        transitionTwoEnd + (PROJECT_THIS_WEBSITE_HOLD_VH / 100) * viewportHeight;
      const firstRotationTrigger =
        thisWebsiteHoldEnd + (PROJECT_FIRST_TURNSTILE_ENTRY_VH / 100) * viewportHeight;
      const rebaseHoldEnd = firstRotationTrigger + (PROJECT_REBASE_HOLD_VH / 100) * viewportHeight;
      const secondRotationTrigger =
        rebaseHoldEnd + (PROJECT_SECOND_TURNSTILE_ENTRY_VH / 100) * viewportHeight;
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
        setTransitionTwoFrame(0);
        targetTransitionFrameRef.current = 0;
        targetTransitionTwoFrameRef.current = 0;
        return;
      }

      if (scrollY < transitionOneEnd) {
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
        return;
      }

      if (scrollY < aboutEnd) {
        setPhase('about');
        setTransitionFrame(transitionFrames.length - 1);
        targetTransitionFrameRef.current = transitionFrames.length - 1;
        setTransitionTwoFrame(0);
        targetTransitionTwoFrameRef.current = 0;
        return;
      }

      if (scrollY < transitionTwoEnd) {
        const transitionProgress = clamp((scrollY - aboutEnd) / transitionTwoLength, 0, 1);
        if (transitionProgress >= TRANSITION_COMPLETE_EPSILON) {
          setPhase('projects');
          setTransitionTwoFrame(transitionTwoFrames.length - 1);
          targetTransitionTwoFrameRef.current = transitionTwoFrames.length - 1;
          return;
        }

        const frameIndex = clamp(
          Math.round(transitionProgress * (transitionTwoFrames.length - 1)),
          0,
          transitionTwoFrames.length - 1,
        );

        targetTransitionTwoFrameRef.current = frameIndex;
        setPhase('transitionTwo');
        return;
      }

      setPhase('projects');
      setTransitionFrame(transitionFrames.length - 1);
      targetTransitionFrameRef.current = transitionFrames.length - 1;
      setTransitionTwoFrame(transitionTwoFrames.length - 1);
      targetTransitionTwoFrameRef.current = transitionTwoFrames.length - 1;

      const beforeFirstTrigger = scrollY < firstRotationTrigger;
      const beforeSecondTrigger = scrollY < secondRotationTrigger;

      if (beforeFirstTrigger && (firstRotationTriggered || firstRotationCompleted)) {
        setFirstRotationTriggered(false);
        setFirstRotationCompleted(false);
      }

      if (beforeSecondTrigger && (secondRotationTriggered || secondRotationCompleted)) {
        setSecondRotationTriggered(false);
        setSecondRotationCompleted(false);
      }

      const firstTriggeredEffective = beforeFirstTrigger ? false : firstRotationTriggered;
      const firstCompletedEffective = beforeFirstTrigger ? false : firstRotationCompleted;
      const secondTriggeredEffective = beforeSecondTrigger ? false : secondRotationTriggered;
      const secondCompletedEffective = beforeSecondTrigger ? false : secondRotationCompleted;

      let nextProjectBlockIndex = 0;
      if (secondTriggeredEffective || secondCompletedEffective) {
        nextProjectBlockIndex = 2;
      } else if (firstTriggeredEffective || firstCompletedEffective) {
        nextProjectBlockIndex = 1;
      }
      setProjectBlockIndex(nextProjectBlockIndex);

      if (secondCompletedEffective) {
        setProjectFrame(projectStills.mango);
        return;
      }

      if (!firstCompletedEffective) {
        if (scrollY < thisWebsiteHoldEnd) {
          setProjectFrame(projectStills.thisWebsite);
          return;
        }

        if (!firstTriggeredEffective && scrollY < firstRotationTrigger) {
          const entryProgress = clamp(
            (scrollY - thisWebsiteHoldEnd) / (firstRotationTrigger - thisWebsiteHoldEnd),
            0,
            1,
          );

          setProjectFrame(entryProgress < 0.5 ? projectStills.thisWebsite : turnstileFrames[0]);
          return;
        }

        if (!firstTriggeredEffective && scrollY >= firstRotationTrigger) {
          setFirstRotationTriggered(true);
          setProjectFrame(turnstileFrames[0]);
        }

        return;
      }

      if (!secondCompletedEffective) {
        if (scrollY < rebaseHoldEnd) {
          setProjectFrame(projectStills.rebase);
          return;
        }

        if (!secondTriggeredEffective && scrollY < secondRotationTrigger) {
          const entryProgress = clamp(
            (scrollY - rebaseHoldEnd) / (secondRotationTrigger - rebaseHoldEnd),
            0,
            1,
          );

          setProjectFrame(entryProgress < 0.5 ? projectStills.rebase : turnstileFrames[0]);
          return;
        }

        if (!secondTriggeredEffective && scrollY >= secondRotationTrigger) {
          setSecondRotationTriggered(true);
          setProjectFrame(turnstileFrames[0]);
        }
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [
    phase,
    firstRotationTriggered,
    firstRotationCompleted,
    secondRotationTriggered,
    secondRotationCompleted,
  ]);

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
    if (phase !== 'transitionTwo') {
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
        setTransitionTwoFrame((previous) => {
          const target = targetTransitionTwoFrameRef.current;
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

  useEffect(() => {
    const container = projectBlocksRef.current;
    if (!container) {
      return;
    }

    const blockHeight = container.clientHeight;
    const targetTop = projectBlockIndex * blockHeight;
    container.scrollTo({
      top: targetTop,
      behavior: phase === 'projects' ? 'smooth' : 'auto',
    });
  }, [projectBlockIndex, phase]);

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

    if (phase === 'transitionTwo') {
      return transitionTwoFrames[transitionTwoFrame];
    }

    if (phase === 'projects') {
      return projectFrame;
    }

    return transitionFrames[transitionFrame];
  }, [
    phase,
    landingFrame,
    trainSequenceFrame,
    trainLoopFrame,
    transitionFrame,
    aboutFrame,
    transitionTwoFrame,
    projectFrame,
  ]);

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
          src={turnstileBackgroundFrame}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            userSelect: 'none',
            pointerEvents: 'none',
            opacity: phase === 'projects' ? 0.25 : 0,
            transition: 'opacity 320ms ease',
            zIndex: 0,
          }}
        />
        <img
          src={frameToRender}
          alt="Hand-drawn animated scene"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            userSelect: 'none',
            mixBlendMode: useTrainBlendMode ? 'multiply' : 'normal',
            zIndex: 1,
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
        <aside
          style={{
            position: 'absolute',
            top: 0,
            right: 'clamp(1.5rem, 3vw, 3.25rem)',
            width: '45%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '7vh 3vw 7vh 2vw',
            transform: 'translateY(5vh)',
            opacity: phase === 'projects' ? 1 : 0,
            transition: 'opacity 220ms ease',
            pointerEvents: 'none',
            zIndex: 6,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '35rem',
              height: 'min(82vh, 780px)',
              overflow: 'hidden',
            }}
          >
            <div
              ref={projectBlocksRef}
              style={{
                height: '100%',
                overflowY: 'hidden',
                scrollSnapType: 'y mandatory',
                scrollSnapStop: 'always',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {PROJECT_CONTENT.map((project, index) => {
                const distance = Math.abs(index - projectBlockIndex);
                const opacity = clamp(1 - distance * 0.95, 0, 1);
                const scale = clamp(1 - distance * 0.05, 0.9, 1);
                const isLinked = Boolean(project.linkHref);
                const showUnderline = hoveredProjectLink === project.key;
                const carouselImages = project.carouselImages ?? [];
                const carouselLength = carouselImages.length;
                const activeCarouselIndex = projectCarouselIndex[project.key] ?? 0;

                return (
                  <article
                    key={project.key}
                    style={{
                      height: '100%',
                      scrollSnapAlign: 'start',
                      scrollSnapStop: 'always',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.1rem',
                      color: '#1f1812',
                      fontFamily: "'Cascadia Mono', monospace",
                      opacity,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top center',
                      willChange: 'transform, opacity',
                      paddingBottom: '2rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        pointerEvents: isLinked ? 'auto' : 'none',
                      }}
                    >
                      {isLinked ? (
                        <a
                          href={project.linkHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onMouseEnter={() => setHoveredProjectLink(project.key)}
                          onMouseLeave={() => setHoveredProjectLink(null)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            color: '#1f1812',
                            textDecoration: showUnderline ? 'underline' : 'none',
                            textDecorationThickness: '2px',
                            textUnderlineOffset: '0.2em',
                            cursor: 'pointer',
                          }}
                        >
                          <h2
                            style={{
                              margin: 0,
                              fontSize: 'clamp(1.5rem, 2.8vw, 2.4rem)',
                              fontWeight: 600,
                              lineHeight: 1,
                              textTransform: 'lowercase',
                            }}
                          >
                            {project.title}
                          </h2>
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            aria-hidden="true"
                            style={{ flexShrink: 0 }}
                          >
                            <path
                              d="M8 8h8v8M16 8L8 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </a>
                      ) : (
                        <h2
                          style={{
                            margin: 0,
                            fontSize: 'clamp(1.5rem, 2.8vw, 2.4rem)',
                            fontWeight: 600,
                            lineHeight: 1,
                            textTransform: 'lowercase',
                          }}
                        >
                          {project.title}
                        </h2>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.8rem',
                        fontSize: 'clamp(0.9rem, 1.05vw, 1rem)',
                        lineHeight: 1.65,
                        fontWeight: 300,
                      }}
                    >
                      {project.body.map((paragraph) => (
                        <p key={`${project.key}-${paragraph}`} style={{ margin: 0 }}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    {project.imageSrc ? (
                      <div style={{ marginTop: '0.4rem' }}>
                        <figure
                          style={{
                            margin: 0,
                            border: '1.5px solid #1f1812',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            background: '#f0eadf',
                          }}
                        >
                          <img
                            src={project.imageSrc}
                            alt={project.imageAlt ?? `${project.title} media`}
                            draggable={false}
                            style={{
                              display: 'block',
                              width: '100%',
                              height: 'auto',
                              userSelect: 'none',
                            }}
                          />
                        </figure>
                        {project.imageCaption ? (
                          <p
                            style={{
                              margin: '0.35rem 0 0',
                              fontSize: '0.78rem',
                              lineHeight: 1.25,
                              color: '#4a3f33',
                            }}
                          >
                            {project.imageCaption}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {carouselLength > 0 ? (
                      <div
                        style={{
                          marginTop: '0.4rem',
                          pointerEvents: 'auto',
                        }}
                      >
                        <figure
                          style={{
                            margin: 0,
                            border: '1.5px solid #1f1812',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            background: '#f0eadf',
                          }}
                        >
                          <img
                            src={carouselImages[activeCarouselIndex].src}
                            alt={carouselImages[activeCarouselIndex].alt}
                            draggable={false}
                            style={{
                              display: 'block',
                              width: '100%',
                              height: 'auto',
                              userSelect: 'none',
                            }}
                          />
                        </figure>
                        <div
                          style={{
                            marginTop: '0.7rem',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '0.9rem',
                          }}
                        >
                          <button
                            type="button"
                            aria-label={`Previous ${project.title} image`}
                            onClick={() => stepProjectCarousel(project.key, -1, carouselLength)}
                            style={{
                              width: '2rem',
                              height: '2rem',
                              borderRadius: 0,
                              border: 'none',
                              background: 'transparent',
                              color: '#1f1812',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              <path
                                d="M14.5 5.5L8 12l6.5 6.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '0.45rem',
                            }}
                          >
                            {carouselImages.map((_, dotIndex) => {
                              const isActive = dotIndex === activeCarouselIndex;

                              return (
                                <button
                                  key={`${project.key}-dot-${dotIndex}`}
                                  type="button"
                                  aria-label={`Show ${project.title} image ${dotIndex + 1}`}
                                  onClick={() => jumpProjectCarousel(project.key, dotIndex)}
                                  style={{
                                    width: isActive ? '0.92rem' : '0.54rem',
                                    height: '0.54rem',
                                    borderRadius: '999px',
                                    border: 'none',
                                    background: isActive ? '#1f1812' : 'rgba(31, 24, 18, 0.32)',
                                    cursor: 'pointer',
                                    transition: 'width 180ms ease, background-color 180ms ease',
                                    padding: 0,
                                  }}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            aria-label={`Next ${project.title} image`}
                            onClick={() => stepProjectCarousel(project.key, 1, carouselLength)}
                            style={{
                              width: '2rem',
                              height: '2rem',
                              borderRadius: 0,
                              border: 'none',
                              background: 'transparent',
                              color: '#1f1812',
                              display: 'grid',
                              placeItems: 'center',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              <path
                                d="M9.5 5.5L16 12l-6.5 6.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {project.videoEmbedSrc ? (
                      <figure
                        style={{
                          margin: 0,
                          marginTop: '0.4rem',
                          border: '1.5px solid #1f1812',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          background: '#f0eadf',
                          pointerEvents: 'auto',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 9',
                          }}
                        >
                          <iframe
                            src={project.videoEmbedSrc}
                            title={project.videoTitle ?? `${project.title} video`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 0,
                              display: 'block',
                            }}
                          />
                        </div>
                      </figure>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </aside>
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '7px',
            overflow: 'hidden',
            zIndex: 30,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: `${scrollProgress * 100}%`,
              height: '100%',
              background: '#000000',
              transition: 'width 90ms linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}
