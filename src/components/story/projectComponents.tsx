'use client';

// Live, interactive components that a project chunk can bring on screen in
// place of an image or video (see ProjectMedia's 'component' kind).

import { useEffect, useState, type ComponentType } from 'react';
import type { ProjectComponentId } from './storyData';
import { INK, inkAlpha } from '@/theme';
import RebaseBlobs from './RebaseBlobs';

export type ProjectComponentProps = {
  /** True while the component is on screen and should animate. */
  active: boolean;
  /** The lit chunk's `state` for this component, if it gives one. */
  state?: string;
};

const LANDING_FRAMES = [1, 2, 3, 4].map((i) => `/Animation/landingloop${i}.webp`);
const FRAME_MS = 180; // the landing loop's own pace

/** The landing scene's loop, playable and steppable frame by frame. */
function SceneFrames({ active }: ProjectComponentProps) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!active || !playing) return undefined;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % LANDING_FRAMES.length), FRAME_MS);
    return () => window.clearInterval(id);
  }, [active, playing]);

  const control: React.CSSProperties = {
    font: 'inherit',
    color: INK,
    background: 'none',
    border: `1px solid ${inkAlpha(0.6)}`,
    borderRadius: 4,
    padding: '3px 8px',
    cursor: 'pointer',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {LANDING_FRAMES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={i === frame ? `Landing scene, frame ${i + 1} of ${LANDING_FRAMES.length}` : ''}
            className="ink-art"
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              visibility: i === frame ? 'visible' : 'hidden',
            }}
          />
        ))}
      </div>
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          borderTop: `1px solid ${inkAlpha(0.4)}`,
          fontFamily: 'var(--font-inconsolata), monospace',
          fontSize: 12,
          color: INK,
        }}
      >
        <button type="button" style={control} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'pause' : 'play'}
        </button>
        <button
          type="button"
          style={control}
          onClick={() => {
            setPlaying(false);
            setFrame((f) => (f + 1) % LANDING_FRAMES.length);
          }}
        >
          step
        </button>
        <span aria-live="polite">
          frame {frame + 1}/{LANDING_FRAMES.length}
        </span>
        <span aria-hidden="true" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {LANDING_FRAMES.map((src, i) => (
            <i key={src} style={{ width: 18, height: 4, background: i === frame ? INK : inkAlpha(0.3) }} />
          ))}
        </span>
      </div>
    </div>
  );
}

export const PROJECT_COMPONENTS: Record<ProjectComponentId, ComponentType<ProjectComponentProps>> = {
  sceneFrames: SceneFrames,
  rebaseBlobs: RebaseBlobs,
};
