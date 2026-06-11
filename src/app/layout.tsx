import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={`${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
