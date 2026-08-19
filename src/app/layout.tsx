import type { Metadata } from 'next';
import { Fraunces, DM_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { CookieConsent } from '@/components/layout/CookieConsent';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

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
  description: 'Discover and buy original art from local artists in your community — browse, collect, and commission one-of-a-kind pieces.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://customcanvas.shop'),
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Custom Canvas',
    description: 'Discover and buy original art from local artists in your community.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Custom Canvas',
    images: ['/og-default.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Custom Canvas',
    description: 'Discover and buy original art from local artists in your community.',
    images: ['/og-default.png'],
  },
  robots: {
    index: true,
    follow: true,
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
