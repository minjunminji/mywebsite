import './globals.css';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { Analytics } from '@vercel/analytics/react';

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
    <html lang="en" className={GeistSans.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
