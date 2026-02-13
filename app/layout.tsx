import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';
import StickyAudioPlayer from '@/components/StickyAudioPlayer';

export const metadata: Metadata = {
  title: 'ryan kim',
  description: 'Hand-drawn animation website',
  icons: {
    icon: '/favicon.png',
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <StickyAudioPlayer />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
