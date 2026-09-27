'use client';

import { useEffect, useState } from 'react';
import StoryPlayer from '@/components/StoryPlayer';
import MobileTldr from '@/components/mobile/MobileTldr';
import { usePiano } from '@/components/piano/PianoContext';
import { MOBILE_QUERY } from '@/components/mobile/breakpoint';

export default function ResponsiveStory() {
  // null until mounted: the server can't see the viewport, so it sends both
  // layouts and CSS shows the right one. After mount only that one stays.
  const [mobile, setMobile] = useState<boolean | null>(null);
  const { close: closePiano } = usePiano();

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // The player is a desktop-sized window and the mobile page has no ♪ to stop
  // it, so a resize into the mobile layout closes it.
  useEffect(() => {
    if (mobile) closePiano();
  }, [mobile, closePiano]);

  return (
    <>
      {mobile !== true ? (
        <div className="story-desktop">
          <StoryPlayer />
        </div>
      ) : null}
      {mobile !== false ? (
        <div className="story-mobile">
          <MobileTldr />
        </div>
      ) : null}
    </>
  );
}
