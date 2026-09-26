'use client';

import { useEffect, useState } from 'react';
import StoryPlayer from '@/components/StoryPlayer';
import MobileTldr from '@/components/mobile/MobileTldr';

// Same line the old desktop gate used.
const MOBILE_QUERY = '(max-width: 1023px)';

export default function ResponsiveStory() {
  const [mobile, setMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (mobile === null) return null;
  return mobile ? <MobileTldr /> : <StoryPlayer />;
}
