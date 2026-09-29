'use client';

import { useEffect, useRef, type VideoHTMLAttributes } from 'react';

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'autoPlay' | 'preload'> & {
  active: boolean;
};

/** CSS visibility alone doesn't stop media downloads or playback. */
export default function ProjectVideo({ active, ...props }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const update = () => {
      if (active && !document.hidden) void video.play().catch(() => {});
      else video.pause();
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      video.pause();
    };
  }, [active, props.src]);
  return <video {...props} ref={ref} preload="none" />;
}
