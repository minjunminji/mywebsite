'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Minimal IFrame Player API types                                    */
/* ------------------------------------------------------------------ */

// Only the handful of methods we actually call, rather than pulling in
// @types/youtube for three signatures.
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
};

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width?: number;
      height?: number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Player state as reported by onStateChange. */
const ENDED = 0;

/**
 * Ceiling on the whole boot, from mount to onReady. Generous, because a slow
 * connection is not a broken one — but without some ceiling a blocked
 * youtube.com leaves the player waiting forever with nothing to report.
 */
const READY_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ */
/*  Script loader                                                      */
/* ------------------------------------------------------------------ */

let apiPromise: Promise<YTNamespace> | null = null;

/**
 * Loads the IFrame Player API exactly once per page, no matter how many callers
 * ask. The API signals readiness through a single global callback, so we chain
 * onto any existing one rather than clobbering it.
 */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    // A blocked or unreachable youtube.com must reject, not hang. Drop the
    // cached promise so a later attempt can try again instead of inheriting
    // this failure.
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube IFrame API failed to load'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export type YouTubeController = {
  /** The embed has loaded and can be driven. Latches on for good. */
  ready: boolean;
  /**
   * The API script or the video failed to load, or onReady never arrived
   * within READY_TIMEOUT_MS. Can also flip after `ready` if playback errors
   * later — in that case the embed is still on screen showing YouTube's own
   * message, so `ready` takes precedence for display.
   */
  failed: boolean;
  play: () => void;
  pause: () => void;
};

/**
 * Wraps one YouTube embed in a play/pause interface. Transport itself belongs
 * to the embed; this exists to start on summon, pause on close, and report
 * whether the thing loaded at all.
 *
 * The API *replaces* the element it is handed with an iframe, so `mountRef` must
 * point at a node that never unmounts and never moves in the tree — remounting
 * reloads the embed and loses playback position.
 */
export function useYouTubePlayer(
  mountRef: React.RefObject<HTMLDivElement | null>,
  videoId: string,
  size: { width: number; height: number },
  /** Offset the recording opens at, in seconds. Applies to the initial load
   *  only — finishing rewinds to 0, not back to here. */
  startSeconds: number,
): YouTubeController {
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Create the player once the API and the mount node are both available.
  useEffect(() => {
    const node = mountRef.current;
    if (!node) return undefined;

    let destroyed = false;

    const giveUp = () => {
      if (destroyed) return;
      window.clearTimeout(timeout);
      setFailed(true);
    };
    const timeout = window.setTimeout(giveUp, READY_TIMEOUT_MS);

    loadYouTubeApi()
      .then((YT) => {
        if (destroyed || playerRef.current) return;

        playerRef.current = new YT.Player(node, {
          videoId,
          // Without these the API builds a 640x390 iframe, not our 16:9 box.
          width: size.width,
          height: size.height,
          playerVars: {
            controls: 1, // the embed owns transport; the bar only moves the window
            fs: 0, // no fullscreen button — this is a 400px window by design
            color: 'white', // progress bar in white rather than YouTube red
            iv_load_policy: 3, // no annotations or cards
            rel: 0, // keep end-screen suggestions on-channel
            start: startSeconds,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (destroyed) return;
              window.clearTimeout(timeout);
              setReady(true);
            },
            onStateChange: (event) => {
              if (destroyed) return;
              // Rewind on finish so YouTube's related-video end screen never
              // gets a chance to render over the video.
              if (event.data === ENDED) {
                playerRef.current?.seekTo(0, true);
                playerRef.current?.pauseVideo();
              }
            },
            // Removed, private, region-blocked, or embedding disallowed.
            onError: giveUp,
          },
        });
      })
      .catch(giveUp);

    return () => {
      destroyed = true;
      window.clearTimeout(timeout);
    };
    // videoId is a module constant, the mount node is stable by contract, and
    // `size` / `startSeconds` are read once at construction — the collapse scales
    // the embed rather than resizing it, so neither must ever rebuild the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);

  return { ready, failed, play, pause };
}
