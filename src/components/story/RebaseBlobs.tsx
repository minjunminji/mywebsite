'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { INK, INK_SOFT, inkAlpha } from '@/theme';
import type { ProjectComponentProps } from './projectComponents';
import { SCENE, SCENE_H, SCENE_W, isRebaseState, place, type Placed, type RebaseState, type SceneItem } from './rebaseScene';

/*
 * RebaseBlobs — the rebase project's living diagram. One set of pieces (resume
 * files, blobs, bullet versions, a page…) that morphs from moment to moment as
 * the sentences go by, instead of a new picture per sentence. Where each piece
 * sits is pure data (rebaseScene.ts); this draws them in white ink with a
 * boiling pencil outline and lets CSS ease them between spots.
 */

const EASE = 'cubic-bezier(0.2, 0.75, 0.2, 1)';
const MOVE_S = 0.75;
const FADE_S = 0.45;
const BOIL_MS = 125; // the site's 8fps line boil
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const MONO = 'var(--font-inconsolata), monospace';
const mono = (size = 11, color: string = INK_SOFT): CSSProperties => ({
  fontFamily: MONO,
  fontSize: size,
  color,
  letterSpacing: 0.2,
  lineHeight: 1.4,
});
const bodyText: CSSProperties = { fontSize: 12.5, lineHeight: 1.45, color: INK };
const oneLine: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/* ---- Sample career ------------------------------------------------------ */

const FILES = ['resume_google.pdf', 'resume_startup.pdf', 'resume_final.pdf', 'resume_final_v2.pdf'];
const FILE_BARS = [0.9, 0.62, 0.84, 0.7, 0.88, 0.52, 0.76];

const BLOBS = [
  { title: 'backend intern', org: 'northwind', when: '2025' },
  { title: 'barista', org: 'corner café', when: '2023–24' },
  { title: 'teaching assistant', org: 'intro programming', when: '2024–25' },
  { title: 'photo club lead', org: 'campus photo club', when: '2022–24' },
];

const INTERN_NOTES =
  'rewrote order search, it was SO slow. added a redis cache?? p95 900ms → 120ms. 2 wks on-call. paired w/ design on the admin filters. wrote the migration doc everyone uses now';
/**
 * The TA blob's base content. It starts as the plain runs; refine weaves in
 * the `refine` runs from your answer, and quick add appends the `quick` one.
 * Woven runs grow in place, pushing the old words apart.
 */
const TA_BASE: readonly { text: string; insert?: 'refine' | 'quick' }[] = [
  { text: 'helped ' },
  { text: '~120 ', insert: 'refine' },
  { text: 'students' },
  { text: ' a term', insert: 'refine' },
  { text: '. ran labs' },
  { text: ', rewrote the lab guide, and cut office-hour waits from 40 to 10 min', insert: 'refine' },
  { text: '. answered forum questions.' },
  { text: ' built an autograder for lab 3.', insert: 'quick' },
];
const QUICK_WIN = 'built an autograder for lab 3';
/** The quick-add beat, in seconds from its sentence lighting up. */
const QUICK = {
  /** The experience gets picked. */
  pick: 0.8,
  /** The win starts typing into the field, and takes this long. */
  typeAt: 1.6,
  typeFor: 1.4,
  /** Saved: the win lifts out of the field and flies for `flight`. */
  fliesAt: 3.6,
  flight: 0.9,
  /** The blob weaves it in, just before the flight ends. */
  landsAt: 4.3,
};
/** From the panel's field to where the win lands in the blob (scene px). */
const WIN_FLIGHT = { x: -188, y: -138 };

const VERSIONS = [
  ['v1 · technical', 'cut order-search p95 from 900ms to 120ms with redis'],
  ['v2 · impact', 'made the busiest admin page 7× faster for 3k users'],
  ['v3 · short', 'sped up order search 7×'],
] as const;

const INTERN_BULLETS = [
  'cut order-search p95 87% (900ms → 120ms) with a redis cache',
  'paired with design to ship admin filters used by 4 teams',
  'wrote the migration runbook the team now uses as standard',
];
const TA_BULLETS = [
  'led weekly labs and office hours for intro programming',
  'answered 300+ student questions on the course forum',
];

const TYPST_SOURCE = [
  '#import "rebase.typ": *',
  '#show: resume.with(font: "inter")',
  '#experience(',
  '  title: "backend intern",',
  '  org: "northwind",',
  '  bullets: (v1, v2, v3),',
  ')',
  '#experience(',
  '  title: "teaching assistant",',
  '  org: "intro programming",',
  '  bullets: (v4, v5),',
  ')',
];

const REFINE_ANSWER = ['~120 students a term. rewrote the lab guide,', 'and office-hour waits went from 40 to 10 min.'];

/* ---- Pieces ------------------------------------------------------------- */

const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

type BoxProps = {
  p: Placed;
  motion: boolean;
  filterId: string;
  dashed?: boolean;
  radius?: number;
  pad?: string;
  children?: ReactNode;
};

/** A piece at its spot, outlined by the boiling pencil line. */
function Box({ p, motion, filterId, dashed, radius = 8, pad = '10px 14px', children }: BoxProps) {
  const move = motion
    ? ['left', 'top', 'width', 'height', 'transform']
        .map((prop) => `${prop} ${MOVE_S}s ${EASE}`)
        .concat(`opacity ${FADE_S}s ease`)
        .join(', ')
    : 'none';
  return (
    <div
      style={{
        position: 'absolute',
        left: p.x,
        top: p.y,
        width: p.w,
        height: p.h,
        opacity: p.o,
        transform: `rotate(${p.r}deg)`,
        transition: move,
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
          opacity: p.line,
          transition: motion ? `opacity ${FADE_S}s ease` : 'none',
        }}
      >
        <rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          rx={radius}
          fill="none"
          stroke={INK}
          strokeWidth={1.3}
          strokeDasharray={dashed ? '5 5' : undefined}
          filter={`url(#${filterId})`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, padding: pad, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

function BlobHeader({ index }: { index: number }) {
  const b = BLOBS[index];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, ...oneLine }}>{b.title}</div>
        <div style={{ ...mono(11), ...oneLine }}>{b.org}</div>
      </div>
      <div style={{ ...mono(11), flexShrink: 0 }}>{b.when}</div>
    </div>
  );
}

/* ---- The diagram -------------------------------------------------------- */

export default function RebaseBlobs({ active, state }: ProjectComponentProps) {
  const s: RebaseState = isRebaseState(state) ? state : 'files';
  const rootRef = useRef<HTMLDivElement | null>(null);
  const turbRef = useRef<SVGFETurbulenceElement | null>(null);
  const [fit, setFit] = useState({ k: 0, dx: 0, dy: 0 });
  const motion = !useReducedMotion();
  const filterId = `rebase-sketch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const k = Math.min(w / SCENE_W, h / SCENE_H);
      setFit({ k, dx: (w - SCENE_W * k) / 2, dy: (h - SCENE_H * k) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Boil the line while on screen, like every other drawn line on the site.
  useEffect(() => {
    if (!active || !motion) return undefined;
    let seed = 1;
    const id = window.setInterval(() => {
      seed = (seed % 97) + 1;
      turbRef.current?.setAttribute('seed', String(seed));
    }, BOIL_MS);
    return () => window.clearInterval(id);
  }, [active, motion]);

  const at = (id: SceneItem) => place(SCENE[id], s);
  const box = { motion, filterId };
  const is = (...states: RebaseState[]) => states.includes(s);

  /** Fade a part of a piece in (after `delay` s) or out. */
  const fade = (on: boolean, delay = 0): CSSProperties => ({
    opacity: on ? 1 : 0,
    transition: motion ? `opacity ${FADE_S}s ease ${on ? delay : 0}s` : 'none',
  });
  /** Type a line out left to right (after `delay` s), or wipe it away. */
  const typed = (on: boolean, text: string, delay = 0, duration?: number): CSSProperties => ({
    ...oneLine,
    clipPath: on ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
    transition: motion
      ? on
        ? `clip-path ${duration ?? Math.min(1.1, text.length * 0.02)}s steps(${text.length}) ${delay}s`
        : 'clip-path 0.2s ease'
      : 'none',
  });
  const section: CSSProperties = { position: 'absolute', left: 14, right: 14, top: 50 };
  const label = { ...mono(10), marginBottom: 3 };

  /** A woven-in run: grows from nothing (after `delay` s), lit while it's new. */
  const woven = (on: boolean, fresh: boolean, delay: number): CSSProperties => ({
    fontSize: on ? 12 : 0,
    opacity: on ? 1 : 0,
    background: on && fresh ? inkAlpha(0.24) : 'transparent',
    borderRadius: 2,
    transition: motion
      ? on
        ? `font-size 0.6s ${EASE} ${delay}s, opacity 0.4s ease ${delay + 0.15}s, background-color 0.5s ease ${delay}s`
        : 'font-size 0.3s ease, opacity 0.2s ease, background-color 0.3s ease'
      : 'none',
  });
  let refineRun = 0;
  const hand: CSSProperties = { fontFamily: 'var(--font-hand), cursive', fontWeight: 600, color: INK };
  /** A hand-drawn stroke drawing itself on (after `delay` s). */
  const drawn = (on: boolean, delay: number): CSSProperties => ({
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    transition: motion ? (on ? `stroke-dashoffset 0.5s ease-in-out ${delay}s` : 'stroke-dashoffset 0.2s ease') : 'none',
  });

  return (
    <div ref={rootRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', color: INK }}>
      {/* The quick-add win, from the panel's field to the end of the blob's base content. */}
      <style>{`@keyframes rebase-win-fly {
        from { transform: translate(0, 0); opacity: 1; }
        to { transform: translate(${WIN_FLIGHT.x}px, ${WIN_FLIGHT.y}px) scale(0.95); opacity: 0; }
      }`}</style>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id={filterId} filterUnits="userSpaceOnUse" x="-20" y="-20" width="1000" height="1000">
            <feTurbulence ref={turbRef} type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={1} />
            <feDisplacementMap in="SourceGraphic" scale={2.6} xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <marker
            id={`${filterId}-head`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M1 1 L9 5 L1 9" fill="none" stroke={INK} strokeWidth={1.4} />
          </marker>
        </defs>
      </svg>

      <div
        style={{
          position: 'absolute',
          left: fit.dx,
          top: fit.dy,
          width: SCENE_W,
          height: SCENE_H,
          transform: `scale(${fit.k})`,
          transformOrigin: '0 0',
        }}
      >
        {/* A folder of near-identical resumes. */}
        {FILES.map((name, i) => (
          <Box key={name} p={at(`file${i}` as SceneItem)} {...box} radius={4} pad="10px 12px">
            <div style={{ ...mono(9.5), ...oneLine }}>{name}</div>
            <div style={{ marginTop: 12, width: '55%', height: 6, background: inkAlpha(0.8) }} />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {FILE_BARS.map((width, b) => (
                <div key={b} style={{ width: `${width * 100}%`, height: 3, background: INK, opacity: 0.55 }} />
              ))}
            </div>
          </Box>
        ))}
        {/* Bullet versions, under the intern blob. */}
        {VERSIONS.map(([tag, text], j) => (
          <Box key={tag} p={at(`ver${j}` as SceneItem)} {...box} pad="8px 14px">
            <div style={{ ...mono(10), lineHeight: 1.3 }}>{tag}</div>
            <div style={{ ...bodyText, ...oneLine }}>{text}</div>
          </Box>
        ))}

        {/* The resume page: a view of blobs, then the tailored resume, then the preview. */}
        <Box p={at('page')} {...box} radius={4} pad="12px 16px">
          <div style={{ position: 'absolute', left: 16, right: 16, top: 12, ...fade(is('view')) }}>
            <div style={mono(10)}>resume · software intern</div>
            <div style={{ marginTop: 14, width: '48%', height: 6, background: inkAlpha(0.8) }} />
            <div style={{ marginTop: 8, width: '70%', height: 3, background: inkAlpha(0.45) }} />
          </div>
          <div style={{ position: 'absolute', left: 16, right: 16, top: 12, ...fade(is('bullets', 'typst')) }}>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>jamie doe</div>
            <div style={mono(10)}>jamie@doe.dev · github.com/jdoe</div>
          </div>
          <div style={{ position: 'absolute', right: 14, top: 12, ...mono(9.5), ...fade(is('typst')) }}>
            live preview
          </div>
          <div style={{ position: 'absolute', left: 16, right: 16, top: 64, ...fade(is('typst'), 0.5) }}>
            {[0, 1].map((group) => (
              <div key={group} style={{ marginBottom: 22 }}>
                <div style={{ width: '58%', height: 5, background: inkAlpha(0.85), marginBottom: 10 }} />
                {[0.92, 0.84, 0.88, 0.7].slice(0, group ? 2 : 3).map((width, b) => (
                  <div
                    key={b}
                    style={{ width: `${width * 100}%`, height: 3, background: inkAlpha(0.5), marginBottom: 8, marginLeft: 10 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </Box>
        {[
          ['→ backend intern · v1', 'slot0'],
          ['→ teaching assistant · v2', 'slot1'],
        ].map(([text, id]) => (
          <Box key={id} p={at(id as SceneItem)} {...box} dashed pad="0 14px">
            <div style={{ ...mono(11.5, INK), lineHeight: '52px', ...oneLine }}>{text}</div>
          </Box>
        ))}
        <Box p={at('arrows')} {...box} pad="0">
          <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} width="100%" height="100%" style={{ display: 'block' }}>
            {[
              'M284 94 C 316 94, 318 136, 346 136',
              'M284 218 C 316 218, 318 208, 346 208',
            ].map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                stroke={INK}
                strokeWidth={1.3}
                strokeDasharray="4 4"
                markerEnd={`url(#${filterId}-head)`}
                filter={`url(#${filterId})`}
              />
            ))}
          </svg>
        </Box>

        {/* Blobs: one per experience. */}
        {BLOBS.map((blob, i) => {
          const intern = i === 0;
          const ta = i === 2;
          return (
            <Box key={blob.title} p={at(`blob${i}` as SceneItem)} {...box}>
              <BlobHeader index={i} />
              {intern ? (
                <>
                  <div style={{ ...section, ...fade(is('baseContent', 'versions'), 0.25) }}>
                    <div style={label}>base content</div>
                    <div style={{ ...mono(12, INK), lineHeight: 1.45 }}>{INTERN_NOTES}</div>
                  </div>
                  <div style={{ ...section, top: 46 }}>
                    {INTERN_BULLETS.map((line, b) => (
                      <div key={line} style={{ ...bodyText, ...typed(is('bullets'), `• ${line}`, 0.5 + b * 0.45) }}>
                        • {line}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {ta ? (
                <>
                  <div style={{ ...section, ...fade(is('vague', 'refine', 'refined', 'quickAdd'), 0.25) }}>
                    <div style={label}>
                      base content
                      <span style={fade(is('refined', 'quickAdd'), is('quickAdd') ? QUICK.landsAt + 0.3 : 1.4)}>
                        {' '}
                        · updated
                      </span>
                    </div>
                    <div style={{ ...mono(12, INK), lineHeight: 1.45 }}>
                      {TA_BASE.map((run) => {
                        if (run.insert === 'refine') {
                          const delay = 0.75 + refineRun++ * 0.25;
                          return (
                            <span key={run.text} style={woven(is('refined', 'quickAdd'), is('refined'), delay)}>
                              {run.text}
                            </span>
                          );
                        }
                        if (run.insert === 'quick') {
                          return (
                            <span key={run.text} style={woven(is('quickAdd'), true, QUICK.landsAt)}>
                              {run.text}
                            </span>
                          );
                        }
                        return <span key={run.text}>{run.text}</span>;
                      })}
                    </div>
                  </div>
                  <div style={{ ...section, top: 46 }}>
                    {TA_BULLETS.map((line, b) => (
                      <div key={line} style={{ ...bodyText, ...typed(is('bullets'), `• ${line}`, 1.9 + b * 0.45) }}>
                        • {line}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </Box>
          );
        })}

        {/* Tailoring for a job, with a model of your choice. */}
        <Box p={at('jd')} {...box} pad="0 14px">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, height: '100%' }}>
            <div style={{ minWidth: 0 }}>
              <div style={mono(10)}>tailoring for</div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, ...oneLine }}>
                software engineer intern @ lumen
              </div>
            </div>
            <div
              style={{
                ...mono(10.5, INK),
                flexShrink: 0,
                border: `1px solid ${inkAlpha(0.55)}`,
                borderRadius: 999,
                padding: '3px 10px',
              }}
            >
              model · claude ▾
            </div>
          </div>
        </Box>

        {/* Refine: point out the vague blob, ask, and weave the answer in. */}
        <Box p={at('vagueArrow')} {...box} pad="0">
          {/* Local coords: the box's top-left is (120, 150) in the scene. */}
          <svg viewBox="0 0 480 190" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
            <g fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" filter={`url(#${filterId})`}>
              {/* A scribbled underline under the thin base content. */}
              <path
                pathLength={1}
                d="M16 16 C 60 21, 100 11, 150 17 S 240 12, 290 18 S 316 15, 326 16"
                style={drawn(is('vague'), 0.35)}
              />
              {/* The arrow, swinging up from the note to the underline. */}
              <path
                pathLength={1}
                d="M388 138 C 380 92, 330 52, 262 28"
                style={drawn(is('vague'), 0.75)}
              />
              <path pathLength={1} d="M276 22 L 260 27 L 271 40" style={drawn(is('vague'), 1.2)} />
            </g>
            <text x={350} y={172} style={{ ...hand, fontSize: 30, ...fade(is('vague'), 1.25) }} fill={INK}>
              vague
            </text>
          </svg>
        </Box>
        <Box p={at('question')} {...box} pad="12px 16px">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={mono(10)}>refine asks</span>
            <span style={mono(10)}>1 of 3</span>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.35, marginTop: 4 }}>
            how many students did you teach, and what changed because of you?
          </div>
          {/* The answer field, typed into. */}
          <div
            style={{
              position: 'relative',
              marginTop: 10,
              height: 50,
              padding: '8px 10px',
              border: `1px solid ${INK}`,
              borderRadius: 6,
              background: inkAlpha(0.08),
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: 8,
                ...mono(11.5),
                opacity: is('refine') ? 0 : 1,
                transition: motion && is('refine') ? 'opacity 0.15s ease 0.65s' : 'none',
              }}
            >
              type your answer…
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <span style={mono(10.5)}>skip</span>
            <span
              style={{
                ...mono(10.5, INK),
                border: `1px solid ${inkAlpha(0.7)}`,
                borderRadius: 4,
                padding: '1px 8px',
              }}
            >
              answer ↵
            </span>
          </div>
        </Box>

        {/* The answer, typed into the field, then carried up into the blob. */}
        <Box p={at('answer')} {...box} pad="0">
          <div
            style={{
              // Fades as it reaches the blob, which weaves it in.
              opacity: is('refine') ? 1 : 0,
              transition: motion && is('refined') ? 'opacity 0.3s ease 0.5s' : 'none',
            }}
          >
            {REFINE_ANSWER.map((line, i) => (
              <div key={line} style={{ ...mono(11.5, INK), ...typed(is('refine', 'refined'), line, i ? 1.6 : 0.7) }}>
                {line}
                {i ? <span style={{ marginLeft: 1 }}>▍</span> : null}
              </div>
            ))}
          </div>
        </Box>

        {/* Quick add: a panel from the + button logs a win, which flies into its blob. */}
        <Box p={at('fab')} {...box} radius={20} pad="0">
          <div style={{ fontSize: 24, lineHeight: '38px', textAlign: 'center' }}>+</div>
        </Box>
        <Box p={at('quick')} {...box} pad="12px 14px">
          <div style={mono(10, INK)}>+ quick add</div>
          <div style={{ ...mono(10), marginTop: 6 }}>experience</div>
          <div
            style={{
              display: 'inline-block',
              marginTop: 2,
              ...mono(11, INK),
              border: `1px solid ${inkAlpha(0.7)}`,
              borderRadius: 999,
              padding: '0 9px',
              ...fade(is('quickAdd'), QUICK.pick),
            }}
          >
            teaching assistant ▾
          </div>
          <div
            style={{
              position: 'relative',
              marginTop: 8,
              height: 30,
              padding: '6px 9px',
              border: `1px solid ${INK}`,
              borderRadius: 6,
              background: inkAlpha(0.08),
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 9,
                top: 6,
                ...mono(11.5),
                opacity: is('quickAdd') ? 0 : 1,
                transition: motion && is('quickAdd') ? `opacity 0.15s ease ${QUICK.typeAt - 0.05}s` : 'none',
              }}
            >
              what happened?
            </div>
            {/* Lifts out of the field on save and flies to the blob. */}
            <div
              style={{
                animation:
                  motion && is('quickAdd')
                    ? `rebase-win-fly ${QUICK.flight}s cubic-bezier(0.5, 0, 0.3, 1) ${QUICK.fliesAt}s both`
                    : undefined,
              }}
            >
              <div style={{ ...mono(11.5, INK), ...typed(is('quickAdd'), QUICK_WIN, QUICK.typeAt, QUICK.typeFor) }}>{QUICK_WIN}</div>
            </div>
          </div>
          <div style={{ position: 'relative', height: 20, marginTop: 8 }}>
            <span
              style={{
                position: 'absolute',
                right: 0,
                ...mono(10.5, INK),
                border: `1px solid ${inkAlpha(0.7)}`,
                borderRadius: 4,
                padding: '1px 8px',
                opacity: is('quickAdd') ? 0 : 1,
                transition: motion && is('quickAdd') ? `opacity 0.2s ease ${QUICK.fliesAt - 0.1}s` : 'none',
              }}
            >
              save ↵
            </span>
            <span
              style={{
                position: 'absolute',
                right: 0,
                ...mono(10.5, INK),
                padding: '2px 0',
                ...fade(is('quickAdd'), QUICK.fliesAt + 0.1),
              }}
            >
              saved to teaching assistant ✓
            </span>
          </div>
        </Box>

        {/* Typst source, compiled in the browser into the page. */}
        <Box p={at('source')} {...box} radius={4} pad="12px 14px">
          <div style={{ ...mono(10), marginBottom: 6 }}>resume.typ</div>
          {TYPST_SOURCE.map((line, i) => (
            <div
              key={i}
              style={{ ...mono(11, INK), lineHeight: 1.55, ...typed(is('typst'), line, 0.2 + i * 0.09), whiteSpace: 'pre' }}
            >
              {line}
            </div>
          ))}
        </Box>
        <Box p={at('wasm')} {...box} pad="0">
          <div style={{ textAlign: 'center', paddingTop: 2 }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>→</div>
            <div style={mono(9)}>wasm</div>
          </div>
        </Box>
      </div>
    </div>
  );
}
