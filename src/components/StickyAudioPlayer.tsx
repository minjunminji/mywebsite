'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

const DEFAULT_VOLUME = 0.3;

export default function StickyAudioPlayer() {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [showVolume, setShowVolume] = useState(false);

  useEffect(() => {
    if (!waveformRef.current) {
      return;
    }

    const waveSurfer = WaveSurfer.create({
      container: waveformRef.current,
      url: '/song/arigato.mp3',
      waveColor: '#9a9a9a',
      progressColor: '#000000',
      height: 28,
      normalize: true,
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      dragToSeek: true,
      interact: true,
    });

    waveSurfer.setVolume(DEFAULT_VOLUME);
    waveSurferRef.current = waveSurfer;

    const onReady = async () => {
      try {
        await waveSurfer.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    waveSurfer.on('ready', onReady);
    waveSurfer.on('play', onPlay);
    waveSurfer.on('pause', onPause);
    waveSurfer.on('finish', onPause);

    return () => {
      waveSurfer.un('ready', onReady);
      waveSurfer.un('play', onPlay);
      waveSurfer.un('pause', onPause);
      waveSurfer.un('finish', onPause);
      waveSurfer.destroy();
      waveSurferRef.current = null;
    };
  }, []);

  const togglePlayback = async () => {
    if (!waveSurferRef.current) {
      return;
    }

    try {
      await waveSurferRef.current.playPause();
    } catch {
      setIsPlaying(waveSurferRef.current.isPlaying());
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    waveSurferRef.current?.setVolume(newVolume);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '1.1rem',
        right: '1.1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.35rem 0.55rem',
        background: 'rgba(246, 242, 234, 0.76)',
        borderRadius: '10px',
        backdropFilter: 'blur(4px)',
        zIndex: 21,
      }}
    >
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        style={{
          width: '26px',
          height: '26px',
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          color: '#111111',
        }}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <polygon points="7,5 19,12 7,19" fill="currentColor" />
          </svg>
        )}
      </button>

      <div
        ref={waveformRef}
        style={{
          width: '180px',
          cursor: 'pointer',
        }}
      />

      <div
        onMouseEnter={() => setShowVolume(true)}
        onMouseLeave={() => setShowVolume(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: showVolume ? '0.45rem' : 0,
        }}
      >
        <button
          type="button"
          aria-label="Volume"
          style={{
            width: '22px',
            height: '22px',
            border: 'none',
            background: 'transparent',
            padding: 0,
            display: 'grid',
            placeItems: 'center',
            color: '#111111',
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3 10v4h4l5 5V5L7 10H3zm12.5 2a3.5 3.5 0 0 0-2-3.15v6.3A3.5 3.5 0 0 0 15.5 12z"
            />
          </svg>
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => handleVolumeChange(Number(event.target.value))}
          aria-label="Volume slider"
          style={{
            width: showVolume ? '88px' : 0,
            opacity: showVolume ? 1 : 0,
            transition: 'width 180ms ease, opacity 160ms ease',
            overflow: 'hidden',
            cursor: 'pointer',
            accentColor: '#000000',
          }}
        />
      </div>
    </div>
  );
}
