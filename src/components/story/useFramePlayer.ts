'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SEGMENTS, STOPS } from '@/components/story/storyData';
import { buildFrameQueue } from '@/components/story/frameQueue';

const LOOP_INTERVAL_MS = 180;
const PLAYBACK_FPS = 12;
const SKIP_SPEED_MULTIPLIER = 2;

function restFrame(index: number): string {
  const stop = STOPS[index];
  return stop.loop?.[0] ?? stop.still ?? '';
}

// Smooth ease-in-out (cubic) for the nav fill sweep.
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export type FramePlayer = {
  currentStop: number;
  /** Destination of the current/last navigation (equals currentStop when parked). */
  target: number;
  /** Where we're parked, or heading during a transition. Drives nav layout. */
  position: number;
  /** Continuous playhead in stop-space; drives the left-to-right black fill. */
  fillProgress: number;
  isTransitioning: boolean;
  displayFrame: string;
  navigateTo: (target: number) => void;
};

/**
 * @param active when false (during the intro) the hook stays idle so the
 * parked rest-loop doesn't run and steal the displayed frame.
 */
export function useFramePlayer(active: boolean): FramePlayer {
  const [currentStop, setCurrentStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayFrame, setDisplayFrame] = useState(restFrame(0));
  const [fillProgress, setFillProgress] = useState(0);

  const queueRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const targetRef = useRef(0);
  const fillFromRef = useRef(0);

  // Parked: animate the current stop's rest loop (or hold its still).
  useEffect(() => {
    if (!active || isTransitioning) {
      return;
    }

    setFillProgress(currentStop);

    const stop = STOPS[currentStop];

    if (!stop.loop) {
      setDisplayFrame(stop.still ?? '');
      return;
    }

    const frames = stop.loop;
    let frame = 0;
    setDisplayFrame(frames[0]);

    const id = window.setInterval(() => {
      frame = (frame + 1) % frames.length;
      setDisplayFrame(frames[frame]);
    }, LOOP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [active, isTransitioning, currentStop]);

  // Transitioning: play the frame queue at a fixed FPS, while the nav fill
  // sweeps smoothly (eased, ~60fps) over the same window — synced at the
  // start/end but decoupled from the choppy frame stepping in between.
  useEffect(() => {
    if (!isTransitioning) {
      return;
    }

    let rafId = 0;
    let frameClock = 0;
    let startTime = 0;
    const from = fillFromRef.current;
    const to = targetRef.current;
    // Skipping over a node (2+ stops) plays the whole run at double speed.
    const speed = Math.abs(to - from) >= 2 ? SKIP_SPEED_MULTIPLIER : 1;
    const frameDuration = 1000 / (PLAYBACK_FPS * speed);
    const totalDuration = Math.max(queueRef.current.length, 1) * frameDuration;

    const tick = (timestamp: number) => {
      if (startTime === 0) {
        startTime = timestamp;
        frameClock = timestamp;
      }

      // Smooth, eased fill across the whole transition window.
      const t = Math.min((timestamp - startTime) / totalDuration, 1);
      setFillProgress(from + (to - from) * easeInOut(t));

      // Advance the hand-drawn frames at a fixed FPS.
      if (timestamp - frameClock >= frameDuration) {
        frameClock = timestamp;
        const queue = queueRef.current;

        if (queueIndexRef.current >= queue.length) {
          setCurrentStop(to);
          setFillProgress(to);
          setIsTransitioning(false);
          return;
        }

        setDisplayFrame(queue[queueIndexRef.current]);
        queueIndexRef.current += 1;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(rafId);
  }, [isTransitioning]);

  const navigateTo = useCallback(
    (next: number) => {
      if (isTransitioning || next === currentStop) {
        return; // ignore clicks mid-transition (v1)
      }

      const queue = buildFrameQueue(currentStop, next, SEGMENTS);
      targetRef.current = next;
      fillFromRef.current = currentStop;
      setTarget(next);

      if (queue.length === 0) {
        setCurrentStop(next);
        setFillProgress(next);
        return;
      }

      queueRef.current = queue;
      queueIndexRef.current = 0;
      setIsTransitioning(true);
    },
    [currentStop, isTransitioning],
  );

  // Layout position (drives nav dock/expand): adopt the destination immediately
  // when moving forward (dock/expand ahead as you leave), but hold the current
  // layout when moving backward so it only collapses/re-centers on arrival.
  const layoutPosition = isTransitioning
    ? target > currentStop
      ? target
      : currentStop
    : currentStop;

  return {
    currentStop,
    target,
    position: layoutPosition,
    fillProgress,
    isTransitioning,
    displayFrame,
    navigateTo,
  };
}
