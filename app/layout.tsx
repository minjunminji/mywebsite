import './globals.css';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { Inconsolata } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import CustomCursor from '@/components/CustomCursor';
import { PianoProvider } from '@/components/piano/PianoContext';

const inconsolata = Inconsolata({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '900'],
  variable: '--font-inconsolata',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ryan kim',
  description: 'Hand-drawn animation website',
  icons: {
    icon: '/favicon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${inconsolata.variable}`}>
      <body>
        {/* The player lives outside the story so it survives every navigation.
            There is no routing here, but this also keeps it out of the story's
            conditional rendering, where a remount would reload the embed. */}
        <PianoProvider>{children}</PianoProvider>
        <CustomCursor />
        <Analytics />
        <div className="desktop-gate" role="alert">
          please view this website on desktop, sorry! mobile support is coming soon
        </div>
      </body>
    </html>
  );
}
