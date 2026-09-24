// src/components/explainer/figure/AboutUnderlay.tsx
'use client';
import { type Ref } from 'react';
import { aboutFrames } from '@/components/story/storyData';

// On the about page the drawing sits in the right part of a 1920×1080 frame,
// with text to its left. Figures show only the drawing, centered: the WebGL
// canvas crops the reference image to this rect (via `crop`) and the underlay
// below crops the about-loop frame to the same one.
const FRAME_W = 1920;
const FRAME_H = 1080;
const CROP_X = 668;
const CROP_Y = 200;
const CROP_W = 1300;
const CROP_H = 760;

/** x, y, w, h in 0..1 of the frame, top-left origin. */
export const ABOUT_CROP = [CROP_X / FRAME_W, CROP_Y / FRAME_H, CROP_W / FRAME_W, CROP_H / FRAME_H] as const;
/** CSS aspect-ratio for a box that shows exactly the cropped region. */
export const ABOUT_CROP_ASPECT = `${CROP_W} / ${CROP_H}`;

/**
 * The first about-loop frame, cropped to ABOUT_CROP. Fills a positioned parent
 * whose aspect ratio is ABOUT_CROP_ASPECT and which clips overflow.
 */
export function AboutUnderlay({ imgRef }: { imgRef?: Ref<HTMLImageElement> }) {
  const [x, y, w, h] = ABOUT_CROP;
  return (
    <img
      ref={imgRef}
      src={aboutFrames[0]}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: `${(-x / w) * 100}%`,
        top: `${(-y / h) * 100}%`,
        width: `${100 / w}%`,
        height: `${100 / h}%`,
        maxWidth: 'none',
        userSelect: 'none',
      }}
    />
  );
}
