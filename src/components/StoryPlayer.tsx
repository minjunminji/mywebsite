'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ABOUT_CHAR_FADE_DURATION_MS,
  ABOUT_CHAR_STAGGER_MS,
  ABOUT_INITIAL_DELAY_MS,
  ABOUT_LINE_GAP_MS,
  ABOUT_LINES,
  ABOUT_REFERENCE_HINT_EXTRA_DELAY_MS,
  ABOUT_REFERENCE_IMAGE,
  ALL_PRELOAD_FRAMES,
  CORNER_LINKS,
  PROJECT_CONTENT,
  firstProjectIndex,
  isExperienceStop,
  isProjectStop,
  landingFrames,
  stopIndexById,
  trainSequenceFrames,
  turnstileBackgroundFrame,
  turnstileBackgroundFrameTwo,
  type CornerLink,
  type ProjectContent,
} from '@/components/story/storyData';
import { useFramePlayer } from '@/components/story/useFramePlayer';
import StoryNav from '@/components/story/StoryNav';
import RevealFluid from '@/components/RevealFluid';
import ExperienceSection from '@/components/experience/ExperienceSection';

const LANDING_LOOP_INTERVAL_MS = 180;
const TRAIN_SEQUENCE_INTERVAL_MS = 1000 / 12;
const LANDING_LOOP_REPEATS = 4;
const PAGE_BG = '#f7f7f5';
const PAGE_BG_CLEAR = 'rgba(247, 247, 245, 0)';
// Soft vignette that feathers the page background inward on every edge, so the
// train drawing dissolves into the page instead of ending on a hard cutoff.
const EDGE_FADE =
  `linear-gradient(to right, ${PAGE_BG} 0%, ${PAGE_BG_CLEAR} 11%, ${PAGE_BG_CLEAR} 89%, ${PAGE_BG} 100%), ` +
  `linear-gradient(to bottom, ${PAGE_BG} 0%, ${PAGE_BG_CLEAR} 8%, ${PAGE_BG_CLEAR} 92%, ${PAGE_BG} 100%)`;
// Intrinsic size of every scene frame; used to find the contain-fit rect.
const FRAME_W = 3840;
const FRAME_H = 2160;

type IntroPhase = 'landing' | 'trainSequence' | 'done';

export default function StoryPlayer() {
  const [introPhase, setIntroPhase] = useState<IntroPhase>('landing');
  const [introFrame, setIntroFrame] = useState<string>(landingFrames[0]);
  const introDone = introPhase === 'done';
  const player = useFramePlayer(introDone);

  // Track the viewport so we can place the edge fade over the drawing's actual
  // contain-fit rectangle (the frame is 16:9 and letterboxed on most screens).
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const fitScale =
    viewport.w && viewport.h ? Math.min(viewport.w / FRAME_W, viewport.h / FRAME_H) : 0;
  const drawW = FRAME_W * fitScale;
  const drawH = FRAME_H * fitScale;
  const drawLeft = (viewport.w - drawW) / 2;
  const drawTop = (viewport.h - drawH) / 2;

  const aboutIndex = stopIndexById('about');
  const onAbout = introDone && !player.isTransitioning && player.currentStop === aboutIndex;
  const onProject = introDone && !player.isTransitioning && isProjectStop(player.currentStop);
  const experienceIndex = stopIndexById('experience');
  const onExperience = introDone && !player.isTransitioning && isExperienceStop(player.currentStop);
  const goingToExperience = player.target === experienceIndex || player.currentStop === experienceIndex;
  const cornerVisible = introDone && player.position !== 0;
  const activeProject: ProjectContent | null = isProjectStop(player.currentStop)
    ? PROJECT_CONTENT[player.currentStop - firstProjectIndex]
    : null;
  // Directional project transition: content enters from the side it's heading
  // (forward → in from the right, out to the left) and reverses going back.
  const enterX = player.navDir >= 0 ? '48px' : '-48px';
  const exitX = player.navDir >= 0 ? '-48px' : '48px';

  const [aboutSeed, setAboutSeed] = useState(0);
  useEffect(() => {
    if (onAbout) {
      setAboutSeed((s) => s + 1);
    }
  }, [onAbout]);

  // --- corner menu state (ported) ---
  const [isCornerMenuOpen, setIsCornerMenuOpen] = useState(false);
  const [hoveredCornerLink, setHoveredCornerLink] = useState<CornerLink['key'] | null>(null);
  const cornerMenuCloseTimeoutRef = useRef<number | null>(null);
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
    return () => {
      if (cornerMenuCloseTimeoutRef.current !== null) {
        window.clearTimeout(cornerMenuCloseTimeoutRef.current);
      }
    };
  }, []);

  // --- project carousel state (ported) ---
  const [hoveredProjectLink, setHoveredProjectLink] = useState<ProjectContent['key'] | null>(null);
  const [projectCarouselIndex, setProjectCarouselIndex] = useState<Record<ProjectContent['key'], number>>({
    thisWebsite: 0,
    rebase: 0,
    mango: 0,
  });
  const stepProjectCarousel = (key: ProjectContent['key'], direction: -1 | 1, total: number) => {
    setProjectCarouselIndex((previous) => {
      const current = previous[key] ?? 0;
      const next = (current + direction + total) % total;
      return { ...previous, [key]: next };
    });
  };
  const jumpProjectCarousel = (key: ProjectContent['key'], index: number) => {
    setProjectCarouselIndex((previous) => ({ ...previous, [key]: index }));
  };

  // Preload frame images once.
  useEffect(() => {
    ALL_PRELOAD_FRAMES.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, []);

  // Intro: landing loop x4 -> 20-frame train build -> hand off to player.
  useEffect(() => {
    if (introPhase === 'landing') {
      let frame = 0;
      let loops = 0;
      setIntroFrame(landingFrames[0]);
      const id = window.setInterval(() => {
        frame = (frame + 1) % landingFrames.length;
        setIntroFrame(landingFrames[frame]);
        if (frame === 0) {
          loops += 1;
          if (loops >= LANDING_LOOP_REPEATS) {
            window.clearInterval(id);
            setIntroPhase('trainSequence');
          }
        }
      }, LANDING_LOOP_INTERVAL_MS);
      return () => window.clearInterval(id);
    }
    if (introPhase === 'trainSequence') {
      let frame = 0;
      setIntroFrame(trainSequenceFrames[0]);
      const id = window.setInterval(() => {
        frame += 1;
        if (frame >= trainSequenceFrames.length) {
          window.clearInterval(id);
          setIntroPhase('done');
          return;
        }
        setIntroFrame(trainSequenceFrames[frame]);
      }, TRAIN_SEQUENCE_INTERVAL_MS);
      return () => window.clearInterval(id);
    }
    return undefined;
  }, [introPhase]);

  // Train art composites with multiply only during the train build and the
  // parked landing loop (matches the original scene).
  const useTrainBlend =
    introPhase === 'trainSequence' ||
    (introDone && !player.isTransitioning && player.currentStop === 0);
  const frame = introDone ? player.displayFrame : introFrame;
  // Only show the project backdrop while both ends of the move are projects —
  // so it fades in on arrival (forward) and fades out at the start (backward),
  // and stays put when moving between projects.
  const showProjectBg = isProjectStop(player.currentStop) && isProjectStop(player.target);
  // Feather the train scene's edges into the page (intro, home idle, and either
  // direction of the home transition).
  const showTrainEdgeFade = !introDone || player.currentStop === 0 || player.target === 0;

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: PAGE_BG }}>
      {/* Background layer 1 */}
      <img
        src={turnstileBackgroundFrame}
        alt=""
        aria-hidden
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', pointerEvents: 'none', userSelect: 'none', opacity: showProjectBg ? 0.25 : 0, transition: 'opacity 320ms ease', zIndex: 0 }}
      />
      {/* Background layer 2 */}
      <img
        src={turnstileBackgroundFrameTwo}
        alt=""
        aria-hidden
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', pointerEvents: 'none', userSelect: 'none', opacity: showProjectBg ? 0.2 : 0, transition: 'opacity 320ms ease', zIndex: 0 }}
      />
      {/* Main frame */}
      <img
        src={frame}
        alt="Hand-drawn animated scene"
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', userSelect: 'none', mixBlendMode: useTrainBlend ? 'multiply' : 'normal', opacity: goingToExperience ? 0 : 1, transition: 'opacity 360ms ease', zIndex: 1 }}
      />

      {/* Soft edge fade so the train drawing blends into the page. Sized to the
          drawing's contain-fit rect so the feather lands on its real edges. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: drawLeft,
          top: drawTop,
          width: drawW,
          height: drawH,
          pointerEvents: 'none',
          background: EDGE_FADE,
          opacity: showTrainEdgeFade && fitScale > 0 ? 1 : 0,
          transition: 'opacity 320ms ease',
          zIndex: 2,
        }}
      />

      {/* Reveal effect — only when parked on about */}
      {onAbout ? <RevealFluid referenceImage={ABOUT_REFERENCE_IMAGE} /> : null}

      {/* ===== PORT BLOCK A: about section ===== */}
      {onAbout ? (
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
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '28rem',
              color: '#1f1812',
              fontFamily: "var(--font-geist-sans), sans-serif",
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
                  key={`${line}-${aboutSeed}`}
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
                        key={`${char}-${charIndex}-${aboutSeed}`}
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
          </div>
        </section>
      ) : null}

      {/* ===== PORT BLOCK B: corner menu ===== */}
      <div
        onMouseEnter={openCornerMenu}
        onMouseLeave={closeCornerMenuWithDelay}
        style={{
          position: 'fixed',
          top: '1.5rem',
          left: '1.5rem',
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          fontFamily: "var(--font-geist-sans), sans-serif",
          fontWeight: 600,
          fontSize: 'clamp(0.95rem, 1.2vw, 1.25rem)',
          lineHeight: 1,
          letterSpacing: '0.03em',
          color: '#1f1812',
          opacity: cornerVisible ? 0.9 : 0,
          transition: 'opacity 360ms ease',
          pointerEvents: cornerVisible ? 'auto' : 'none',
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

      {/* ===== PORT BLOCK C: projects aside — single active project ===== */}
      {activeProject ? (
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
            transform: `translateY(5vh) translateX(${onProject ? '0px' : exitX})`,
            opacity: onProject ? 1 : 0,
            // Slide+fade out while leaving; snap back instantly on arrival so the
            // article's own slide-in animation owns the entrance.
            transition: onProject ? 'opacity 300ms ease' : 'opacity 220ms ease, transform 300ms cubic-bezier(0.4, 0, 1, 1)',
            pointerEvents: onProject ? 'auto' : 'none',
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
            {(() => {
              const project = activeProject;
              const isLinked = Boolean(project.linkHref);
              const showUnderline = hoveredProjectLink === project.key;
              const carouselImages = project.carouselImages ?? [];
              const carouselLength = carouselImages.length;
              const activeCarouselIndex = projectCarouselIndex[project.key] ?? 0;
              const activeCarouselItem = carouselImages[activeCarouselIndex];

              return (
                <article
                  key={project.key}
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.1rem',
                    color: '#1f1812',
                    fontFamily: "var(--font-geist-sans), sans-serif",
                    paddingBottom: '2rem',
                    animation: 'projectSlideIn 460ms cubic-bezier(0.16, 1, 0.3, 1) both',
                    ...({ '--enter-x': enterX } as CSSProperties),
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
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '16 / 9',
                          }}
                        >
                          {carouselImages.map((item, mediaIndex) => {
                            const isActiveMedia = mediaIndex === activeCarouselIndex;

                            if (item.kind === 'video') {
                              return (
                                <video
                                  key={`${project.key}-media-video-${item.src}`}
                                  src={item.src}
                                  title={item.title ?? `${project.title} media`}
                                  poster={item.posterSrc}
                                  preload="auto"
                                  muted
                                  loop
                                  autoPlay
                                  playsInline
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'block',
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    objectPosition: 'center',
                                    userSelect: 'none',
                                    opacity: isActiveMedia ? 1 : 0,
                                    zIndex: isActiveMedia ? 2 : 1,
                                    pointerEvents: 'none',
                                  }}
                                />
                              );
                            }

                            return (
                              <img
                                key={`${project.key}-media-image-${item.src}`}
                                src={item.src}
                                alt={item.alt}
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
                                  opacity: isActiveMedia ? 1 : 0,
                                  zIndex: isActiveMedia ? 2 : 1,
                                  pointerEvents: 'none',
                                }}
                              />
                            );
                          })}
                        </div>
                      </figure>
                      {activeCarouselItem?.caption ? (
                        <p
                          style={{
                            margin: '0.35rem 0 0',
                            fontSize: '0.78rem',
                            lineHeight: 1.25,
                            color: '#4a3f33',
                          }}
                        >
                          {activeCarouselItem.caption}
                        </p>
                      ) : null}
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
                          aria-label={`Previous ${project.title} media`}
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
                                aria-label={`Show ${project.title} media ${dotIndex + 1}`}
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
                          aria-label={`Next ${project.title} media`}
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
                  {project.videoSrc ? (
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
            })()}
          </div>
        </aside>
      ) : null}

      {/* ===== experience section (static, Task 5) ===== */}
      {goingToExperience ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: onExperience ? 1 : 0,
            transition: 'opacity 400ms ease',
            pointerEvents: onExperience ? 'auto' : 'none',
            zIndex: 4,
          }}
        >
          <ExperienceSection />
        </div>
      ) : null}

      <StoryNav
        position={player.position}
        expandPosition={player.expandPosition}
        fillProgress={player.fillProgress}
        visible={introDone}
        isTransitioning={player.isTransitioning}
        onNavigate={player.navigateTo}
      />
    </div>
  );
}
