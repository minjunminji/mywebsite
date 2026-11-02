'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { INK, INK_SOFT, PAPER, paperAlpha } from '@/theme';
import {
  ABOUT_FADE_DURATION_MS,
  ABOUT_INITIAL_DELAY_MS,
  ABOUT_LINES,
  ABOUT_PIANO_LINE,
  ABOUT_PIANO_LINE_INDEX,
  ABOUT_REFERENCE_IMAGE,
  SOCIAL_LINKS,
  PROJECT_CONTENT,
  firstProjectIndex,
  isExperienceStop,
  isProjectStop,
  landingFrames,
  stopIndexById,
  trainSequenceFrames,
  turnstileBackgroundFrame,
  turnstileBackgroundFrameTwo,
  type ProjectContent,
} from '@/components/story/storyData';
import { useFramePlayer } from '@/components/story/useFramePlayer';
import StoryNav, { DOCKED_CENTER_Y } from '@/components/story/StoryNav';
import { NAV_DRAW_MS, NAV_GLIDE_MS } from '@/components/story/navTiming';
import TldrOverlay from '@/components/story/TldrOverlay';
import RevealFluid from '@/components/RevealFluid';
import ExperienceSection from '@/components/experience/ExperienceSection';
import { usePiano } from '@/components/piano/PianoContext';
import { MOBILE_QUERY } from '@/components/mobile/breakpoint';
import { frameLoader } from '@/components/story/frameLoader';
import LivingMedia from '@/components/story/LivingMedia';
import ProjectReader from '@/components/story/ProjectReader';
import { mediaForChunk } from '@/components/story/projectReading';

// Heavy (figures, WebGL) and rarely opened: load on first open only.
const loadShaderExplainer = () => import('@/components/explainer/ShaderExplainer');
const ShaderExplainer = dynamic(loadShaderExplainer, { ssr: false });

const LANDING_LOOP_INTERVAL_MS = 180;
const TRAIN_SEQUENCE_INTERVAL_MS = 1000 / 12;
const LANDING_LOOP_REPEATS = 2; // idle loops before the train (~1.4s; was 4 / ~2.9s)
const PAGE_BG = PAPER;
const PAGE_BG_CLEAR = paperAlpha(0);
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
  // Collapsing (going home), hold the social icons until the nav lines have
  // retracted so they move with the nav's glide instead of ahead of it.
  const clusterDelay = cornerVisible ? 0 : NAV_DRAW_MS;

  const { summoned: pianoSummoned, visible: pianoVisible, summonFrom, restore: restorePiano } =
    usePiano();
  // The ♪ is the way back to a closed player from stops where the trigger word
  // isn't on screen, so it only earns its spot once the player exists and is hidden.
  const showPianoNote = pianoSummoned && !pianoVisible;

  const [tldrOpen, setTldrOpen] = useState(false);
  const [explainerOpen, setExplainerOpen] = useState(false);
  // Mounted on first open, then kept so its fade-out plays and reopening is instant.
  const [explainerMounted, setExplainerMounted] = useState(false);
  // The two takeovers are mutually exclusive: each makes everything outside
  // itself inert, so two open at once would lock each other out.
  const openExplainer = () => {
    setTldrOpen(false);
    setExplainerMounted(true);
    setExplainerOpen(true);
  };
  const activeProject: ProjectContent | null = isProjectStop(player.currentStop)
    ? PROJECT_CONTENT[player.currentStop - firstProjectIndex]
    : null;
  const nextProject = activeProject
    ? PROJECT_CONTENT[player.currentStop - firstProjectIndex + 1]
    : undefined;
  // Start fetching a project's video when the train heads for it rather than on
  // arrival, so the frames of the transition cover the download.
  const incomingProject: ProjectContent | null =
    player.isTransitioning && isProjectStop(player.target)
      ? PROJECT_CONTENT[player.target - firstProjectIndex]
      : null;
  const incomingVideo = incomingProject?.chunks.map((chunk) => chunk.media).find((media) => media?.kind === 'video');
  const incomingVideoSrc = incomingVideo?.kind === 'video' ? incomingVideo.src : null;
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

  const [hoveredProjectLink, setHoveredProjectLink] = useState<ProjectContent['key'] | null>(null);
  // The lit chunk of the project on screen; its reader reports it (and resets
  // to the first chunk whenever a project mounts).
  const [activeChunk, setActiveChunk] = useState(0);
  const projectMedia =
    onProject && activeProject ? mediaForChunk(activeProject.chunks, activeChunk) : null;

  // Decode a short window ahead. Keep the previous drawing visible while a
  // slow connection catches up; no unrelated scenes compete with the intro.
  useEffect(() => {
    if (introPhase === 'done' || window.matchMedia(MOBILE_QUERY).matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIntroPhase('done');
      return;
    }
    const frames = introPhase === 'landing'
      ? Array.from({ length: LANDING_LOOP_REPEATS }, () => [...landingFrames]).flat()
      : trainSequenceFrames;
    const interval = introPhase === 'landing' ? LANDING_LOOP_INTERVAL_MS : TRAIN_SEQUENCE_INTERVAL_MS;
    let cancelled = false;
    let timer = 0;
    let index = 0;
    const advance = async () => {
      frameLoader.prefetch(frames, index);
      const ready = await frameLoader.load(frames[index]);
      if (cancelled) return;
      if (ready) setIntroFrame(frames[index]);
      index += 1;
      timer = window.setTimeout(() => {
        if (index < frames.length) void advance();
        else setIntroPhase(introPhase === 'landing' ? 'trainSequence' : 'done');
      }, interval);
    };
    void advance();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [introPhase]);

  // Train art composites with screen only during the train build and the
  // parked landing loop (matches the original scene). Those frames are opaque
  // white; once inverted (.ink-art) screen drops their black ground onto the
  // blue page.
  const useTrainBlend =
    introPhase === 'trainSequence' ||
    (introDone && !player.isTransitioning && player.currentStop === 0);
  const frame = introDone ? player.displayFrame || introFrame : introFrame;
  // Only show the project backdrop while both ends of the move are projects —
  // so it fades in on arrival (forward) and fades out at the start (backward),
  // and stays put when moving between projects.
  const showProjectBg = isProjectStop(player.currentStop) && isProjectStop(player.target);
  // Feather the train scene's edges into the page (intro, home idle, and either
  // direction of the home transition).
  const showTrainEdgeFade = !introDone || player.currentStop === 0 || player.target === 0;

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', background: PAGE_BG }}>
      {/* Background layer 1. Lazy so the hidden server-rendered copy on phones
          doesn't fetch it (see ResponsiveStory); on desktop it's in view anyway. */}
      <img
        src={showProjectBg ? turnstileBackgroundFrame : undefined}
        className="ink-art-recessed"
        alt=""
        aria-hidden
        loading="lazy"
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', pointerEvents: 'none', userSelect: 'none', opacity: showProjectBg ? 0.25 : 0, transition: 'opacity 800ms ease', zIndex: 0 }}
      />
      {/* Background layer 2 */}
      <img
        src={showProjectBg ? turnstileBackgroundFrameTwo : undefined}
        className="ink-art-recessed"
        alt=""
        aria-hidden
        loading="lazy"
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', pointerEvents: 'none', userSelect: 'none', opacity: showProjectBg ? 0.2 : 0, transition: 'opacity 800ms ease', zIndex: 0 }}
      />
      {/* Main frame */}
      <img
        src={frame}
        className="ink-art"
        loading="lazy"
        fetchPriority="high"
        alt="Hand-drawn animated scene"
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', userSelect: 'none', mixBlendMode: useTrainBlend ? 'screen' : 'normal', opacity: goingToExperience ? 0 : 1, transition: goingToExperience ? 'opacity 600ms ease' : 'opacity 360ms ease', zIndex: 1 }}
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
      {onAbout ? <RevealFluid referenceImage={ABOUT_REFERENCE_IMAGE} active={!tldrOpen && !explainerOpen} /> : null}

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
              color: INK,
              fontFamily: "var(--font-alte-haas-grotesk), Arial, sans-serif",
              fontWeight: 400,
              fontSize: 'clamp(0.95rem, 1.25vw, 1.2rem)',
              lineHeight: 1.7,
            }}
          >
            {ABOUT_LINES.map((line, index) => {
              // All lines fade in together.
              const delay = ABOUT_INITIAL_DELAY_MS;

              return (
                <p
                  key={`${line}-${aboutSeed}`}
                  style={{
                    margin: 0,
                    marginBottom: index < ABOUT_LINES.length - 1 ? '1.15em' : 0,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'break-word',
                    fontSize: index === 0 ? '1.5em' : 'inherit',
                    fontWeight: index === 0 ? 700 : 400,
                    opacity: 0,
                    animationName: 'aboutFadeIn',
                    animationDuration: `${ABOUT_FADE_DURATION_MS}ms`,
                    animationTimingFunction: 'ease',
                    animationFillMode: 'both',
                    animationDelay: `${delay}ms`,
                  }}
                >
                  {index === ABOUT_PIANO_LINE_INDEX ? (
                    <>
                      {ABOUT_PIANO_LINE.before}
                      <button
                        type="button"
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          summonFrom({
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                          });
                        }}
                        style={{
                          font: 'inherit',
                          color: 'inherit',
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          margin: 0,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textDecorationThickness: '1.5px',
                          textUnderlineOffset: '0.2em',
                          // The about <section> turns pointer events off wholesale;
                          // this is the one thing inside it that must stay clickable.
                          pointerEvents: 'auto',
                        }}
                      >
                        {ABOUT_PIANO_LINE.trigger}
                      </button>
                      {ABOUT_PIANO_LINE.after}
                    </>
                  ) : (
                    line
                  )}
                </p>
              );
            })}
            <p
              style={{
                margin: 0,
                marginTop: '4em',
                fontSize: '0.85em',
                fontWeight: 400,
                opacity: 0,
                animationName: 'aboutFadeIn',
                animationDuration: `${ABOUT_FADE_DURATION_MS}ms`,
                animationTimingFunction: 'ease',
                animationFillMode: 'both',
                animationDelay: `${ABOUT_INITIAL_DELAY_MS}ms`,
              }}
            >
              move your cursor over the drawing to reveal the reference
            </p>
          </div>
        </section>
      ) : null}

      {/* ===== Top-right corner cluster: [ tldr ] [ social icons ] =====
          One right-anchored flex row. tldr is immediately available
          and sits alone in the corner; off-home the social wrapper expands and
          the row grows leftward, sliding tldr aside. */}
      <div
        style={{
          position: 'fixed',
          // Centered on the docked nav bar's midline so the two corners line up.
          top: DOCKED_CENTER_Y,
          right: '1.5rem',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          // The readable portfolio is available even while intro frames load.
          opacity: 1,
          pointerEvents: 'auto',
          zIndex: 20,
        }}
      >
        {/* ♪ — the way back to a closed player from stops where the trigger word
            isn't on screen. Collapses to zero width with the same grid trick the
            socials use below, so the row doesn't jump when it appears. */}
        <div
          aria-hidden={!showPianoNote}
          style={{
            display: 'inline-grid',
            gridTemplateColumns: showPianoNote ? '1fr' : '0fr',
            marginRight: showPianoNote ? 0 : '-0.4rem',
            transition:
              'grid-template-columns 500ms cubic-bezier(0.65, 0, 0.35, 1), ' +
              'margin-right 500ms cubic-bezier(0.65, 0, 0.35, 1)',
          }}
        >
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={restorePiano}
              data-cursor-pad="-4"
              aria-label="Show piano player"
              tabIndex={showPianoNote ? 0 : -1}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '0.1rem 0.15rem',
                margin: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-alte-haas-grotesk), Arial, sans-serif',
                fontSize: 'clamp(1rem, 1.3vw, 1.35rem)',
                lineHeight: 1,
                color: INK,
                opacity: showPianoNote ? 0.9 : 0,
                transition: `opacity 360ms ease ${showPianoNote ? '120ms' : '0ms'}`,
                whiteSpace: 'nowrap',
              }}
            >
              ♪
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setExplainerOpen(false);
            setTldrOpen(true);
          }}
          aria-haspopup="dialog"
          data-cursor-pad="-4"
          style={{
            border: 'none',
            background: 'transparent',
            padding: '0.1rem 0.15rem',
            margin: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-alte-haas-grotesk), Arial, sans-serif',
            fontWeight: 400,
            fontSize: 'clamp(0.95rem, 1.2vw, 1.25rem)',
            letterSpacing: '0.03em',
            textTransform: 'lowercase',
            lineHeight: 1,
            color: INK,
            opacity: 0.9,
            whiteSpace: 'nowrap',
            // Lowercase "tldr" has no descenders, so it sits optically high next
            // to the icon glyphs — nudge it down a hair to line them up.
            transform: 'translateY(1px)',
          }}
        >
          tldr
        </button>

        {/* Collapsible social wrapper — 0fr on the landing, 1fr elsewhere. The
            negative margin swallows the flex gap when collapsed so tldr sits
            flush; the same grid trick the nav uses for its projects sub-nodes
            (StoryNav.tsx). One curve drives the whole reflow, on the nav's
            glide timing: going home it waits for the nav lines to retract. */}
        <div
          aria-hidden={!cornerVisible}
          style={{
            display: 'inline-grid',
            gridTemplateColumns: cornerVisible ? '1fr' : '0fr',
            marginLeft: cornerVisible ? '0' : '-0.4rem',
            transition:
              `grid-template-columns ${NAV_GLIDE_MS}ms cubic-bezier(0.65, 0, 0.35, 1) ${clusterDelay}ms, ` +
              `margin-left ${NAV_GLIDE_MS}ms cubic-bezier(0.65, 0, 0.35, 1) ${clusterDelay}ms`,
          }}
        >
          <div
            style={{
              minWidth: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: cornerVisible ? 0.9 : 0,
              transition: `opacity 400ms ease ${cornerVisible ? 120 : clusterDelay}ms`,
              pointerEvents: cornerVisible ? 'auto' : 'none',
            }}
          >
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                data-cursor-pad="-4"
                tabIndex={cornerVisible ? 0 : -1}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '2rem',
                  height: '2rem',
                  color: INK,
                }}
              >
                <img
                  src={link.icon}
                  className="ink-art"
                  alt=""
                  width={18}
                  height={18}
                  style={{ display: 'block', width: '1.15rem', height: '1.15rem', objectFit: 'contain' }}
                />
              </a>
            ))}
          </div>
        </div>
      </div>

      {incomingVideoSrc ? (
        <video key={incomingVideoSrc} src={incomingVideoSrc} preload="auto" muted aria-hidden hidden />
      ) : null}

      {/* ===== project media: the lit chunk's media, over the drawing ===== */}
      <LivingMedia media={projectMedia} playing={!tldrOpen && !explainerOpen} />

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
            padding: 'clamp(4.5rem, 9vh, 6.5rem) 3vw 0 2vw',
            transform: `translateX(${onProject ? '0px' : exitX})`,
            opacity: onProject ? 1 : 0,
            // Slide+fade out while leaving; snap back instantly on arrival so the
            // article's own slide-in animation owns the entrance. Leaving for the
            // experience section fades out slower (0.6s) so it's not abrupt.
            transition: onProject
              ? 'opacity 300ms ease'
              : goingToExperience
                ? 'opacity 600ms ease, transform 600ms cubic-bezier(0.4, 0, 1, 1)'
                : 'opacity 220ms ease, transform 300ms cubic-bezier(0.4, 0, 1, 1)',
            pointerEvents: onProject ? 'auto' : 'none',
            zIndex: 6,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '35rem',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {(() => {
              const project = activeProject;
              const isLinked = Boolean(project.linkHref);
              const showUnderline = hoveredProjectLink === project.key;

              return (
                <article
                  key={project.key}
                  style={{
                    // Fills the pane: header pinned top, and the reader takes the
                    // rest. Media lives on the left (LivingMedia), not in here.
                    display: 'flex',
                    flexDirection: 'column',
                    flex: '1 1 auto',
                    minHeight: 0,
                    gap: '1.1rem',
                    color: INK,
                    fontFamily: "var(--font-alte-haas-grotesk), Arial, sans-serif",
                    paddingBottom: '0.5rem',
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
                      flexShrink: 0,
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
                            color: INK,
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
                              fontWeight: 700,
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
                            fontWeight: 700,
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
                        fontWeight: 700,
                        letterSpacing: '0.03em',
                        color: INK_SOFT,
                        pointerEvents: 'none',
                      }}
                    >
                      {project.techStack.join(', ')}
                    </p>
                  </div>
                  <ProjectReader
                    chunks={project.chunks}
                    active={onProject && !tldrOpen && !explainerOpen}
                    onActiveChunk={setActiveChunk}
                    onAction={openExplainer}
                    // Warm the chunk while the pointer is on its way.
                    onActionIntent={() => void loadShaderExplainer()}
                    nextProject={nextProject ? {
                      title: nextProject.title,
                      onNavigate: () => player.navigateTo(stopIndexById(nextProject.key)),
                    } : undefined}
                  />
                </article>
              );
            })()}
          </div>
        </aside>
      ) : null}

      {/* ===== experience section ===== */}
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

      <TldrOverlay open={tldrOpen} onClose={() => setTldrOpen(false)} />
      {explainerMounted ? (
        <ShaderExplainer open={explainerOpen} onClose={() => setExplainerOpen(false)} />
      ) : null}
    </div>
  );
}
