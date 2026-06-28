'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SEGMENTS, STOPS } from '@/components/story/storyData';
import { buildFrameQueue } from '@/components/story/frameQueue';

const LOOP_INTERVAL_MS = 180;
const PLAYBACK_FPS = 12;

function restFrame(index: number): string {
  const stop = STOPS[index];
  return stop.loop?.[0] ?? stop.still ?? '';
}

export type FramePlayer = {
  currentStop: number;
  /** Where we're parked, or heading during a transition. Drives the nav. */
  position: number;
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

  const queueRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const targetRef = useRef(0);

  // Parked: animate the current stop's rest loop (or hold its still).
  useEffect(() => {
    if (!active || isTransitioning) {
      return;
    }

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

  // Transitioning: step through the frame queue at a fixed FPS.
  useEffect(() => {
    if (!isTransitioning) {
      return;
    }

    let rafId = 0;
    let previous = 0;
    const frameDuration = 1000 / PLAYBACK_FPS;

    const tick = (timestamp: number) => {
      if (previous === 0) {
        previous = timestamp;
      }

      if (timestamp - previous >= frameDuration) {
        previous = timestamp;
        const queue = queueRef.current;

        if (queueIndexRef.current >= queue.length) {
          setCurrentStop(targetRef.current);
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
      setTarget(next);

      if (queue.length === 0) {
        setCurrentStop(next);
        return;
      }

      queueRef.current = queue;
      queueIndexRef.current = 0;
      setIsTransitioning(true);
    },
    [currentStop, isTransitioning],
  );

  return {
    currentStop,
    position: isTransitioning ? target : currentStop,
    isTransitioning,
    displayFrame,
    navigateTo,
  };
}
