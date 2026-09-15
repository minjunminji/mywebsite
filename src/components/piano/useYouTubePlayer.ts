'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Minimal IFrame Player API types                                    */
/* ------------------------------------------------------------------ */

// Only the handful of methods we actually call, rather than pulling in
// @types/youtube for six signatures.
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
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

/** Player states as reported by onStateChange. */
const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;

const POLL_INTERVAL_MS = 250;

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

  apiPromise = new Promise<YTNamespace>((resolve) => {
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
    document.head.appendChild(script);
  });

  return apiPromise;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export type YouTubeController = {
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekToFraction: (fraction: number) => void;
};

/**
 * Wraps one YouTube embed in a play/pause/seek interface.
 *
 * The API *replaces* the element it is handed with an iframe, so `mountRef` must
 * point at a node that never unmounts and never moves in the tree — remounting
 * reloads the embed and loses playback position.
 */
export function useYouTubePlayer(
  mountRef: React.RefObject<HTMLDivElement | null>,
  videoId: string,
  size: { width: number; height: number },
): YouTubeController {
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Create the player once the API and the mount node are both available.
  useEffect(() => {
    const node = mountRef.current;
    if (!node) return undefined;

    let destroyed = false;

    loadYouTubeApi().then((YT) => {
      if (destroyed || playerRef.current) return;

      playerRef.current = new YT.Player(node, {
        videoId,
        // Without these the API builds a 640x390 iframe, not our 16:9 box.
        width: size.width,
        height: size.height,
        playerVars: {
          controls: 0, // no bottom control bar; the header owns transport
          iv_load_policy: 3, // no annotations or cards
          disablekb: 1, // don't let the embed eat arrow keys
          rel: 0, // keep end-screen suggestions on-channel
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (destroyed) return;
            setReady(true);
            setDuration(playerRef.current?.getDuration() ?? 0);
          },
          onStateChange: (event) => {
            if (destroyed) return;
            // Drive the glyph from the player's own state, not from our click
            // handler — YouTube changes state on its own (buffering, ads) and a
            // locally-tracked button would desync from what's actually happening.
            setPlaying(event.data === PLAYING || event.data === BUFFERING);

            if (event.data === PLAYING) {
              setDuration(playerRef.current?.getDuration() ?? 0);
            }

            // Rewind on finish so YouTube's related-video end screen never gets
            // a chance to render over the video.
            if (event.data === ENDED) {
              playerRef.current?.seekTo(0, true);
              playerRef.current?.pauseVideo();
              setCurrentTime(0);
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
    };
    // videoId is a module constant, the mount node is stable by contract, and
    // `size` is read once at construction — the collapse scales the embed rather
    // than resizing it, so a changed size must never rebuild the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Poll the clock only while playing, so a paused player isn't spinning a timer
  // for the rest of the session.
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setCurrentTime(player.getCurrentTime());
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const toggle = useCallback(() => {
    if (playing) playerRef.current?.pauseVideo();
    else playerRef.current?.playVideo();
  }, [playing]);

  const seekToFraction = useCallback((fraction: number) => {
    const player = playerRef.current;
    if (!player) return;
    const total = player.getDuration();
    if (!total) return;
    const seconds = total * fraction;
    player.seekTo(seconds, true);
    // Move the thumb immediately rather than waiting up to 250ms for the poll.
    setCurrentTime(seconds);
  }, []);

  return { ready, playing, currentTime, duration, play, pause, toggle, seekToFraction };
}
