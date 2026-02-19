'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import RevealFluid from './RevealFluid';

type Phase =
  | 'loading'
  | 'introLanding'
  | 'introTrainSequence'
  | 'trainLoop'
  | 'transition'
  | 'about'
  | 'transitionTwo'
  | 'projects';

const landingFrames = [
  '/Animation/landingloop1.webp',
  '/Animation/landingloop2.webp',
  '/Animation/landingloop3.webp',
  '/Animation/landingloop4.webp',
];

const trainSequenceFrames = Array.from({ length: 20 }, (_, index) => `/Animation/train${index + 1}.webp`);

const trainLoopFrames = [
  '/Animation/trainloop1.webp',
  '/Animation/trainloop2.webp',
  '/Animation/trainloop3.webp',
  '/Animation/trainloop4.webp',
];

const transitionFrames = Array.from(
  { length: 25 },
  (_, index) => `/Animation/1trans${index + 1}.webp`,
);

const aboutFrames = [
  '/Animation/aboutloop1.webp',
  '/Animation/aboutloop2.webp',
  '/Animation/aboutloop3.webp',
  '/Animation/aboutloop4.webp',
];

const transitionTwoFrames = Array.from(
  { length: 22 },
  (_, index) => `/Animation/2trans${index + 1}.webp`,
);

const turnstileFrames = Array.from(
  { length: 6 },
  (_, index) => `/Animation/turnstile${index + 1}.webp`,
);
const turnstileBackgroundFrame = '/turnstile_background.webp';
const turnstileBackgroundFrameTwo = '/turnstile_background_2.png';

const projectStills = {
  thisWebsite: '/Animation/thiswebsite.webp',
  rebase: '/Animation/rebase.webp',
  mango: '/Animation/mango.webp',
} as const;

type ProjectContent = {
  key: 'thisWebsite' | 'rebase' | 'mango';
  title: string;
  techStack: readonly string[];
  body: readonly string[];
  linkHref?: string;
  imageSrc?: string;
  imageAlt?: string;
  imageCaption?: string;
  carouselImages?: readonly {
    src: string;
    alt: string;
  }[];
  videoSrc?: string;
  videoTitle?: string;
};

const PROJECT_CONTENT: readonly ProjectContent[] = [
  {
    key: 'thisWebsite',
    title: 'this website',
    techStack: ['Next.js', 'React', 'TypeScript', 'WaveSurfer.js', 'WebGL2'],
    body: [
      'my old portfolio was hand-drawn too, but it felt static. i rebuilt it as a scroll-driven story so the site feels like a film you move through.',
      'i challenged myself to learn animation and built a custom frame-by-frame scene system in next.js + react to make the experience linear, cinematic, and interactive.',
      'this project is where my love for illustration, design, and frontend engineering all meet.',
    ],
    imageSrc: '/oldwebsite.webp',
    imageAlt: 'Old portfolio website screenshot',
    imageCaption: 'my old website',
  },
  {
    key: 'rebase',
    title: 'rebase',
    techStack: ['React.js', 'Next.js', 'Supabase', 'Typst', 'Inngest', 'Redis'],
    linkHref: 'http://tryrebase.io/',
    body: [
      'an ai-native resume builder that stores your experience as reusable building blocks instead of rewriting one static document every time.',
      'you paste a job description, and it pulls the most relevant experience, rewrites bullets for role fit, and exports an ats-friendly pdf with typst.',
      'it also helps you capture wins as they happen and asks targeted follow-up questions to turn vague points into specific, credible impact.',
    ],
    carouselImages: [
      {
        src: '/rebase1.webp',
        alt: 'Rebase screenshot 1',
      },
      {
        src: '/rebase2.webp',
        alt: 'Rebase screenshot 2',
      },
      {
        src: '/rebase3.webp',
        alt: 'Rebase screenshot 3',
      },
      {
        src: '/rebase4.webp',
        alt: 'Rebase screenshot 4',
      },
    ],
  },
  {
    key: 'mango',
    title: 'mango',
    techStack: ['Python', 'PyAutoGUI', 'OpenCV', 'MediaPipe'],
    linkHref: 'https://devpost.com/software/mango-full-body-gesture-control-for-any-game',
    body: [
      'mango turns any webcam into a full-body game controller, so you can play minecraft with gestures and movement, no vr headset or external sensors required.',
      'it tracks body motion in real time and maps your movements directly to in-game inputs for a hands-free, immersive control experience.',
      'built in 12 hours with opencv, mediapipe holistic, python, and pyinput, this project won 1st place at hellohacks 2025.',
    ],
    videoSrc: '/mango.mp4',
    videoTitle: 'Mango full-body gesture control demo',
  },
];

const ABOUT_REFERENCE_IMAGE = '/about_ref.webp';
const PROJECT_MEDIA_SOURCES = ['/oldwebsite.webp', '/rebase1.webp', '/rebase2.webp', '/rebase3.webp', '/rebase4.webp'] as const;
const requestedImageSources = new Set<string>();
const loadedImageSources = new Set<string>();
const imagePreloadPromises = new Map<string, Promise<void>>();

function queueImagePreload(src: string): Promise<void> {
  if (loadedImageSources.has(src)) {
    return Promise.resolve();
  }

  const existing = imagePreloadPromises.get(src);
  if (existing) {
    return existing;
  }

  const preloadPromise = new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = 'async';

    const finish = () => {
      loadedImageSources.add(src);
      imagePreloadPromises.delete(src);
      resolve();
    };

    image.onload = () => {
      if (typeof image.decode === 'function') {
        image.decode().catch(() => undefined).finally(finish);
        return;
      }

      finish();
    };
    image.onerror = finish;
    image.src = src;
  });

  imagePreloadPromises.set(src, preloadPromise);
  return preloadPromise;
}

function preloadImageSources(sources: readonly string[]) {
  sources.forEach((src) => {
    if (!src || requestedImageSources.has(src)) {
      return;
    }

    requestedImageSources.add(src);
    void queueImagePreload(src);
  });
}

function preloadImageSourceBlocking(src: string): Promise<void> {
  if (!src) {
    return Promise.resolve();
  }

  requestedImageSources.add(src);
  return queueImagePreload(src);
}

function frameWindowSources(frames: readonly string[], centerIndex: number, radius: number): string[] {
  if (frames.length === 0) {
    return [];
  }

  const start = clamp(centerIndex - radius, 0, frames.length - 1);
  const end = clamp(centerIndex + radius, 0, frames.length - 1);

  return frames.slice(start, end + 1);
}

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
const ABOUT_INITIAL_DELAY_MS = 208;
const ABOUT_CHAR_STAGGER_MS = 19;
const ABOUT_LINE_GAP_MS = 166;
const ABOUT_CHAR_FADE_DURATION_MS = 416;
const ABOUT_REFERENCE_HINT_EXTRA_DELAY_MS = 320;
const ABOUT_LINES = [
  "hi, i'm ryan!",
  "i'm a sophomore computer engineering student at the university of british columbia, and i love building things that make me or other people happy.",
  'in my spare time, i like to produce music, cook, and play soccer.',
];
type CornerLink = {
  key: 'github' | 'linkedin' | 'resume';
  label: string;
  href: string;
  icon: 'external' | 'download';
  openInNewTab?: boolean;
  download?: boolean;
};

const CORNER_LINKS: readonly CornerLink[] = [
  {
    key: 'github',
    label: 'github',
    href: 'https://github.com/minjunminji/',
    icon: 'external',
    openInNewTab: true,
  },
  {
    key: 'linkedin',
    label: 'linkedin',
    href: 'https://www.linkedin.com/in/ryankim373/',
    icon: 'external',
    openInNewTab: true,
  },
  {
    key: 'resume',
    label: 'resume',
    href: '/ryan_kim_resume.pdf',
    icon: 'download',
    download: true,
  },
] as const;
const LANDING_LOOP_REPEATS = 4;
const TRAIN_LOOP_SCROLL_HINT_DELAY_MS = 3000;
const MOBILE_PORTRAIT_MEDIA_QUERY = '(orientation: portrait)';
const MOBILE_VIEW_MEDIA_QUERY = '(max-width: 900px)';
const STARTUP_PRELOAD_TIMEOUT_MS = 2600;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function isLikelyHandheldDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const navigatorWithUaData = navigator as Navigator & {
    userAgentData?: {
      mobile?: boolean;
    };
  };
  const uaDataMobile = navigatorWithUaData.userAgentData?.mobile === true;
  const uaMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
  const touchNarrowViewport =
    typeof window !== 'undefined' &&
    navigator.maxTouchPoints > 1 &&
    Math.min(window.innerWidth, window.innerHeight) <= 1024;

  return uaDataMobile || uaMobile || touchNarrowViewport;
}

function addMediaQueryChangeListener(
  mediaQueryList: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
) {
  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', listener);
    return;
  }

  mediaQueryList.addListener(listener);
}

function removeMediaQueryChangeListener(
  mediaQueryList: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
) {
  if (typeof mediaQueryList.removeEventListener === 'function') {
    mediaQueryList.removeEventListener('change', listener);
    return;
  }

  mediaQueryList.removeListener(listener);
}

export default function ScrollScenePlayer() {
  const projectBlocksRef = useRef<HTMLDivElement | null>(null);
  const cornerMenuCloseTimeoutRef = useRef<number | null>(null);
  const loadingOverlayTimeoutRef = useRef<number | null>(null);
  const targetTransitionFrameRef = useRef(0);
  const targetTransitionTwoFrameRef = useRef(0);
  const hasTriggeredAboutAnimationRef = useRef(false);
  const cornerTitleRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const cornerTitleOpacityRef = useRef(-1);
  const scrollProgressRef = useRef(-1);
  const startupPreloadRanRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const [landingFrame, setLandingFrame] = useState(0);
  const [, setLandingLoopsCompleted] = useState(0);
  const [trainSequenceFrame, setTrainSequenceFrame] = useState(0);
  const [trainLoopFrame, setTrainLoopFrame] = useState(0);
  const [aboutFrame, setAboutFrame] = useState(0);
  const [transitionFrame, setTransitionFrame] = useState(0);
  const [transitionTwoFrame, setTransitionTwoFrame] = useState(0);
  const [projectFrame, setProjectFrame] = useState<string>(projectStills.thisWebsite);
  const [hasUserScrolledAfterTrain, setHasUserScrolledAfterTrain] = useState(false);
  const [showTrainLoopScrollHint, setShowTrainLoopScrollHint] = useState(false);
  const [showRotateDeviceOverlay, setShowRotateDeviceOverlay] = useState(() =>
    typeof window === 'undefined'
      ? false
      : isLikelyHandheldDevice() &&
        (window.matchMedia(MOBILE_PORTRAIT_MEDIA_QUERY).matches ||
          window.innerHeight > window.innerWidth),
  );
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window === 'undefined'
      ? false
      : isLikelyHandheldDevice() || window.matchMedia(MOBILE_VIEW_MEDIA_QUERY).matches,
  );
  const [aboutAnimationSeed, setAboutAnimationSeed] = useState(0);
  const [firstRotationTriggered, setFirstRotationTriggered] = useState(false);
  const [firstRotationCompleted, setFirstRotationCompleted] = useState(false);
  const [secondRotationTriggered, setSecondRotationTriggered] = useState(false);
  const [secondRotationCompleted, setSecondRotationCompleted] = useState(false);
  const [hasVisitedProjects, setHasVisitedProjects] = useState(false);
  const [projectBlockIndex, setProjectBlockIndex] = useState(0);
  const [hoveredProjectLink, setHoveredProjectLink] = useState<ProjectContent['key'] | null>(null);
  const [isCornerMenuOpen, setIsCornerMenuOpen] = useState(false);
  const [hoveredCornerLink, setHoveredCornerLink] = useState<CornerLink['key'] | null>(null);
  const [projectCarouselIndex, setProjectCarouselIndex] = useState<
    Record<ProjectContent['key'], number>
  >({
    thisWebsite: 0,
    rebase: 0,
    mango: 0,
  });

  useEffect(() => {
    if (showLoadingOverlay) {
      document.body.dataset.sceneLoading = 'true';
    } else {
      delete document.body.dataset.sceneLoading;
    }

    return () => {
      delete document.body.dataset.sceneLoading;
    };
  }, [showLoadingOverlay]);

  useEffect(() => {
    const portraitTouchQuery = window.matchMedia(MOBILE_PORTRAIT_MEDIA_QUERY);
    const mobileViewQuery = window.matchMedia(MOBILE_VIEW_MEDIA_QUERY);

    const syncRotateOverlay = () => {
      const isPortrait =
        portraitTouchQuery.matches || window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
      const isHandheld = isLikelyHandheldDevice();
      const isNarrowViewport = window.innerWidth <= 900 || mobileViewQuery.matches;

      setShowRotateDeviceOverlay(isHandheld && isPortrait);
      setIsMobileView(isHandheld || isNarrowViewport);
    };

    syncRotateOverlay();
    addMediaQueryChangeListener(portraitTouchQuery, syncRotateOverlay);
    addMediaQueryChangeListener(mobileViewQuery, syncRotateOverlay);
    window.addEventListener('resize', syncRotateOverlay);
    window.addEventListener('orientationchange', syncRotateOverlay);
    window.addEventListener('pageshow', syncRotateOverlay);

    return () => {
      removeMediaQueryChangeListener(portraitTouchQuery, syncRotateOverlay);
      removeMediaQueryChangeListener(mobileViewQuery, syncRotateOverlay);
      window.removeEventListener('resize', syncRotateOverlay);
      window.removeEventListener('orientationchange', syncRotateOverlay);
      window.removeEventListener('pageshow', syncRotateOverlay);
    };
  }, []);

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

  const openCornerMenu = () => {
    if (cornerMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(cornerMenuCloseTimeoutRef.current);
      cornerMenuCloseTimeoutRef.current = null;
    }

    setIsCornerMenuOpen(true);
  };

  const closeCornerMenuWithDelay = () => {
    if (cornerMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(cornerMenuCloseTimeoutRef.current);
    }

    cornerMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setIsCornerMenuOpen(false);
      cornerMenuCloseTimeoutRef.current = null;
    }, 170);
  };

  useEffect(() => {
    if (startupPreloadRanRef.current || phase !== 'loading') {
      return;
    }

    startupPreloadRanRef.current = true;
    let cancelled = false;
    const startupSources = Array.from(
      new Set([
        ...landingFrames,
        ...trainSequenceFrames.slice(0, 8),
        ...trainLoopFrames,
        transitionFrames[0],
        aboutFrames[0],
        transitionTwoFrames[0],
        turnstileFrames[0],
        turnstileBackgroundFrame,
        turnstileBackgroundFrameTwo,
        projectStills.thisWebsite,
        ABOUT_REFERENCE_IMAGE,
        ...(isMobileView ? [] : [projectStills.rebase, projectStills.mango, ...PROJECT_MEDIA_SOURCES]),
      ]),
    );

    const run = async () => {
      const preloadPromise = Promise.all(startupSources.map((src) => preloadImageSourceBlocking(src)));
      await Promise.race([
        preloadPromise,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, STARTUP_PRELOAD_TIMEOUT_MS);
        }),
      ]);

      if (cancelled) {
        return;
      }

      setPhase('introLanding');
      loadingOverlayTimeoutRef.current = window.setTimeout(() => {
        setShowLoadingOverlay(false);
        loadingOverlayTimeoutRef.current = null;
      }, 460);
    };

    void run();

    return () => {
      cancelled = true;
      if (loadingOverlayTimeoutRef.current !== null) {
        window.clearTimeout(loadingOverlayTimeoutRef.current);
        loadingOverlayTimeoutRef.current = null;
      }
    };
  }, [phase, isMobileView]);

  useEffect(() => {
    const sources = new Set<string>();
    const add = (items: readonly string[]) => {
      items.forEach((src) => {
        sources.add(src);
      });
    };

    if (phase === 'introLanding') {
      add(frameWindowSources(landingFrames, landingFrame, 2));
      add(trainSequenceFrames.slice(0, 6));
    } else if (phase === 'introTrainSequence') {
      add(frameWindowSources(trainSequenceFrames, trainSequenceFrame, 4));
      add(trainLoopFrames);
    } else if (phase === 'trainLoop') {
      add(frameWindowSources(trainLoopFrames, trainLoopFrame, 2));
      add(transitionFrames.slice(0, 8));
    } else if (phase === 'transition') {
      add(frameWindowSources(transitionFrames, transitionFrame, 5));
      add(aboutFrames);
    } else if (phase === 'about') {
      add(frameWindowSources(aboutFrames, aboutFrame, 2));
      add([ABOUT_REFERENCE_IMAGE]);
      add(transitionTwoFrames.slice(0, 8));
    } else if (phase === 'transitionTwo') {
      add(frameWindowSources(transitionTwoFrames, transitionTwoFrame, 5));
      add([
        projectStills.thisWebsite,
        turnstileFrames[0],
        turnstileBackgroundFrame,
        turnstileBackgroundFrameTwo,
      ]);
      if (!isMobileView) {
        add(PROJECT_MEDIA_SOURCES);
      }
    } else if (phase === 'projects') {
      add([
        turnstileBackgroundFrame,
        turnstileBackgroundFrameTwo,
        projectStills.thisWebsite,
        projectStills.rebase,
        projectStills.mango,
      ]);
      if (!isMobileView) {
        add(PROJECT_MEDIA_SOURCES);
      }

      if (!firstRotationCompleted || !secondRotationCompleted) {
        add(turnstileFrames);
      }
    }

    preloadImageSources(Array.from(sources));
  }, [
    phase,
    landingFrame,
    trainSequenceFrame,
    trainLoopFrame,
    transitionFrame,
    aboutFrame,
    transitionTwoFrame,
    firstRotationCompleted,
    secondRotationCompleted,
    isMobileView,
  ]);

  useEffect(() => {
    return () => {
      if (cornerMenuCloseTimeoutRef.current !== null) {
        window.clearTimeout(cornerMenuCloseTimeoutRef.current);
      }
      if (loadingOverlayTimeoutRef.current !== null) {
        window.clearTimeout(loadingOverlayTimeoutRef.current);
      }
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
    if (phase !== 'trainLoop' || hasUserScrolledAfterTrain) {
      setShowTrainLoopScrollHint(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      if (!hasUserScrolledAfterTrain && window.scrollY <= 2) {
        setShowTrainLoopScrollHint(true);
      }
    }, TRAIN_LOOP_SCROLL_HINT_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [phase, hasUserScrolledAfterTrain]);

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
    if (phase === 'projects' && !hasVisitedProjects) {
      setHasVisitedProjects(true);
    }
  }, [phase, hasVisitedProjects]);

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

      if (Math.abs(pageProgress - scrollProgressRef.current) > 0.001) {
        scrollProgressRef.current = pageProgress;
        if (progressFillRef.current) {
          progressFillRef.current.style.width = `${pageProgress * 100}%`;
        }
      }

      if (Math.abs(cornerOpacity - cornerTitleOpacityRef.current) > 0.001) {
        cornerTitleOpacityRef.current = cornerOpacity;
        if (cornerTitleRef.current) {
          cornerTitleRef.current.style.opacity = `${cornerOpacity}`;
          cornerTitleRef.current.style.pointerEvents = cornerOpacity > 0.02 ? 'auto' : 'none';
        }
      }

      if (
        showRotateDeviceOverlay ||
        phase === 'loading' ||
        phase === 'introLanding' ||
        phase === 'introTrainSequence'
      ) {
        return;
      }

      if (!hasUserScrolledAfterTrain && scrollY > 2) {
        setHasUserScrolledAfterTrain(true);
        setShowTrainLoopScrollHint(false);
      }

      if (scrollY < transitionStart) {
        setPhase('trainLoop');
        setTransitionFrame(0);
        setTransitionTwoFrame(0);
        targetTransitionFrameRef.current = 0;
        targetTransitionTwoFrameRef.current = 0;
        hasTriggeredAboutAnimationRef.current = false;
        return;
      }

      if (scrollY < transitionOneEnd) {
        const transitionProgress = clamp((scrollY - transitionStart) / transitionLength, 0, 1);
        if (transitionProgress >= TRANSITION_COMPLETE_EPSILON) {
          if (!hasTriggeredAboutAnimationRef.current) {
            setAboutAnimationSeed((previous) => previous + 1);
            hasTriggeredAboutAnimationRef.current = true;
          }
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
        if (!hasTriggeredAboutAnimationRef.current) {
          setAboutAnimationSeed((previous) => previous + 1);
          hasTriggeredAboutAnimationRef.current = true;
        }
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

      if (beforeFirstTrigger && firstRotationCompleted) {
        setFirstRotationTriggered(false);
        setFirstRotationCompleted(false);
      }

      if (beforeSecondTrigger && secondRotationCompleted) {
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

    let animationFrameId = 0;
    const scheduleScrollWork = () => {
      if (animationFrameId !== 0) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = 0;
        handleScroll();
      });
    };

    handleScroll();
    window.addEventListener('scroll', scheduleScrollWork, { passive: true });
    window.addEventListener('resize', scheduleScrollWork);

    return () => {
      window.removeEventListener('scroll', scheduleScrollWork);
      window.removeEventListener('resize', scheduleScrollWork);
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    phase,
    showRotateDeviceOverlay,
    hasUserScrolledAfterTrain,
    firstRotationTriggered,
    firstRotationCompleted,
    secondRotationTriggered,
    secondRotationCompleted,
  ]);



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
    const shouldLockForIntro =
      phase === 'loading' || phase === 'introLanding' || phase === 'introTrainSequence';
    const shouldLockScroll = showRotateDeviceOverlay || shouldLockForIntro;
    if (!shouldLockScroll) {
      return;
    }

    if (shouldLockForIntro) {
      window.scrollTo(0, 0);
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const preventScroll = (event: Event) => {
      event.preventDefault();
    };
    const resetScrollPosition = () => {
      window.scrollTo(0, 0);
    };

    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    if (shouldLockForIntro) {
      window.addEventListener('scroll', resetScrollPosition);
    }

    // Also block keyboard scrolling (arrow keys, space, page up/down, home/end)
    const preventKeyScroll = (event: KeyboardEvent) => {
      const scrollKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End'];
      if (scrollKeys.includes(event.key)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', preventKeyScroll);

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
      if (shouldLockForIntro) {
        window.removeEventListener('scroll', resetScrollPosition);
      }
      window.removeEventListener('keydown', preventKeyScroll);
    };
  }, [phase, showRotateDeviceOverlay]);

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
    if (phase === 'loading' || phase === 'introLanding') {
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
      className="scene-root"
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
            objectFit: 'contain',
            objectPosition: 'center',
            userSelect: 'none',
            pointerEvents: 'none',
            opacity: phase === 'projects' ? 0.25 : 0,
            transition: 'opacity 320ms ease',
            zIndex: 0,
          }}
        />
        <img
          src={turnstileBackgroundFrameTwo}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
            userSelect: 'none',
            pointerEvents: 'none',
            opacity: phase === 'projects' ? 0.2 : 0,
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
            objectFit: 'contain',
            objectPosition: 'center',
            userSelect: 'none',
            mixBlendMode: useTrainBlendMode ? 'multiply' : 'normal',
            zIndex: 1,
          }}
        />
        {phase === 'about' && <RevealFluid referenceImage={ABOUT_REFERENCE_IMAGE} />}
        {showLoadingOverlay ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: '#f6f2ea',
              color: '#1f1812',
              fontFamily: "'Cascadia Mono', monospace",
              fontWeight: 400,
              fontSize: 'clamp(1rem, 1.3vw, 1.2rem)',
              letterSpacing: '0.03em',
              textTransform: 'lowercase',
              opacity: phase === 'loading' ? 1 : 0,
              transition: 'opacity 460ms ease',
              pointerEvents: phase === 'loading' ? 'auto' : 'none',
              userSelect: 'none',
              zIndex: 40,
            }}
          >
            loading...
          </div>
        ) : null}
        <div
          className="mobile-rotate-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            padding: 'clamp(1.5rem, 5vw, 3rem)',
            background: '#f6f2ea',
            color: '#1f1812',
            fontFamily: "'Cascadia Mono', monospace",
            fontWeight: 400,
            fontSize: 'clamp(0.95rem, 3.8vw, 1.2rem)',
            lineHeight: 1.45,
            letterSpacing: '0.02em',
            textTransform: 'lowercase',
            textAlign: 'center',
            userSelect: 'none',
            zIndex: 55,
          }}
        >
          Please rotate your device to landscape to view this website.
        </div>
        <div
          ref={cornerTitleRef}
          onMouseEnter={openCornerMenu}
          onMouseLeave={closeCornerMenuWithDelay}
          style={{
            position: 'fixed',
            top: '1.5rem',
            left: '1.5rem',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            fontFamily: "'Cascadia Mono', monospace",
            fontWeight: 600,
            fontSize: 'clamp(0.95rem, 1.2vw, 1.25rem)',
            lineHeight: 1,
            letterSpacing: '0.03em',
            color: '#1f1812',
            opacity: 0,
            transition: 'opacity 140ms linear',
            pointerEvents: 'none',
            userSelect: 'none',
            textTransform: 'lowercase',
            zIndex: 20,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'default',
            }}
          >
            <span>ryan kim</span>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                d={isCornerMenuOpen ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            style={{
              paddingTop: '0.55rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
              opacity: isCornerMenuOpen ? 1 : 0,
              transform: isCornerMenuOpen ? 'translateY(0)' : 'translateY(-8px)',
              maxHeight: isCornerMenuOpen ? '8rem' : '0',
              overflow: 'hidden',
              transition: 'opacity 180ms ease, transform 240ms ease, max-height 240ms ease',
              pointerEvents: isCornerMenuOpen ? 'auto' : 'none',
            }}
          >
            {CORNER_LINKS.map((link) => {
              const isHovered = hoveredCornerLink === link.key;

              return (
                <a
                  key={link.key}
                  href={link.href}
                  target={link.openInNewTab ? '_blank' : undefined}
                  rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
                  download={link.download ? '' : undefined}
                  onMouseEnter={() => setHoveredCornerLink(link.key)}
                  onMouseLeave={() => setHoveredCornerLink(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    width: 'fit-content',
                    color: '#1f1812',
                    textDecoration: isHovered ? 'underline' : 'none',
                    textDecorationThickness: '1px',
                    textUnderlineOffset: '0.12em',
                    paddingBottom: '0.08rem',
                    fontWeight: 400,
                    fontSize: 'clamp(0.82rem, 0.95vw, 0.92rem)',
                    letterSpacing: '0.02em',
                  }}
                >
                  <span>{link.label}</span>
                  {link.icon === 'download' ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path
                        d="M12 4v10M8.5 10.5L12 14l3.5-3.5M5 18.5h14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path
                        d="M8 8h8v8M16 8L8 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </a>
              );
            })}
          </div>
        </div>
        {phase === 'about' ? (
          <section
          style={{
            position: 'absolute',
            left: isMobileView ? '0.5vw' : '3vw',
            top: 0,
            width: isMobileView ? '42%' : '33.334%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobileView ? '0.2vh 1vw' : '8vh 4vw',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: isMobileView ? '16.5rem' : '28rem',
              color: '#1f1812',
              fontFamily: "'Cascadia Mono', monospace",
              fontWeight: 600,
              fontSize: isMobileView ? 'clamp(0.8rem, 1.65vw, 0.98rem)' : 'clamp(0.95rem, 1.25vw, 1.2rem)',
              lineHeight: isMobileView ? 1.45 : 1.7,
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
                    marginBottom: index < ABOUT_LINES.length - 1 ? (isMobileView ? '0.75em' : '1.15em') : 0,
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
                          animationDuration: `${ABOUT_CHAR_FADE_DURATION_MS}ms`,
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
            {!isMobileView ? (
              <p
                style={{
                  margin: 0,
                  marginTop: '4em',
                  fontSize: '0.85em',
                  fontWeight: 300,
                  opacity: 0,
                  animationName: 'aboutCharFadeIn',
                  animationDuration: `${ABOUT_CHAR_FADE_DURATION_MS}ms`,
                  animationTimingFunction: 'ease',
                  animationFillMode: 'forwards',
                  animationDelay: `${
                    ABOUT_INITIAL_DELAY_MS +
                    ABOUT_LINES.join('').length * ABOUT_CHAR_STAGGER_MS +
                    ABOUT_LINES.length * ABOUT_LINE_GAP_MS +
                    ABOUT_REFERENCE_HINT_EXTRA_DELAY_MS
                  }ms`,
                }}
              >
                move your cursor over the drawing to reveal the reference
              </p>
            ) : null}
          </div>
        </section>
        ) : null}
        <div
          style={{
            position: 'fixed',
            top: '33.333%',
            left: '75%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#1f1812',
            fontFamily: "'Cascadia Mono', monospace",
            fontWeight: 600,
            fontSize: 'clamp(0.85rem, 1.15vw, 1.1rem)',
            letterSpacing: '0.02em',
            textTransform: 'lowercase',
            opacity: showTrainLoopScrollHint ? 1 : 0,
            transition: 'opacity 220ms ease',
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 19,
          }}
        >
          <span>scroll!</span>
          <span
            style={{
              display: 'inline-flex',
              lineHeight: 0,
              animationName: 'scrollHintBob',
              animationDuration: '1150ms',
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M12 5v12M7.5 12.5L12 17l4.5-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
        {hasVisitedProjects ? (
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
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '0.4rem',
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          pointerEvents: isLinked ? 'auto' : 'none',
                          minWidth: 0,
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
                      <p
                        title={project.techStack.join(', ')}
                        style={{
                          margin: 0,
                          fontSize: 'clamp(0.72rem, 0.9vw, 0.86rem)',
                          lineHeight: 1.25,
                          fontWeight: 500,
                          letterSpacing: '0.03em',
                          color: '#4a3f33',
                          pointerEvents: 'none',
                        }}
                      >
                        {project.techStack.join(', ')}
                      </p>
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
                    {!isMobileView && project.imageSrc ? (
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
                    {!isMobileView && carouselLength > 0 ? (
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
                    {!isMobileView && project.videoSrc ? (
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
                          <video
                            src={project.videoSrc}
                            title={project.videoTitle ?? `${project.title} video`}
                            preload="metadata"
                            muted
                            loop
                            autoPlay
                            playsInline
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 0,
                              display: 'block',
                              objectFit: 'cover',
                              objectPosition: 'center',
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
        ) : null}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '4.2px',
            overflow: 'hidden',
            zIndex: 30,
            pointerEvents: 'none',
          }}
        >
          <div
            ref={progressFillRef}
            style={{
              width: '0%',
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
