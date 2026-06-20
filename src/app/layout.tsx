import type { Metadata } from 'next';
import { Fraunces, DM_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { CookieConsent } from '@/components/layout/CookieConsent';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fraunces',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'Custom Canvas',
    template: '%s | Custom Canvas',
  },
  description: 'Discover and purchase original art from emerging Houston artists. Browse, collect, and commission one-of-a-kind pieces.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://customcanvas.art'),
  openGraph: {
    title: 'Custom Canvas',
    description: 'Discover and purchase original art from emerging Houston artists.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Custom Canvas',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Custom Canvas',
    description: 'Discover and purchase original art from emerging Houston artists.',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E8704A" />
      </head>
      <body className={`${fraunces.variable} ${dmSans.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
