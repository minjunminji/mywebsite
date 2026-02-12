import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import StickyAudioPlayer from '@/components/StickyAudioPlayer';

export const metadata: Metadata = {
  title: 'Personal Website',
  description: 'Hand-drawn animation website',
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
      </body>
    </html>
  );
}
