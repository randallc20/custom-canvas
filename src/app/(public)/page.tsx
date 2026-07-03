import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArtFeed } from '@/components/feed/ArtFeed';
import { HomeShelves } from '@/components/feed/HomeShelves';
import { RecentlyViewed } from '@/components/feed/RecentlyViewed';
import { Spinner } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Custom Canvas — Discover Art from Houston\'s Emerging Artists',
  description: 'Browse, collect, and commission one-of-a-kind pieces from Houston\'s most talented emerging artists.',
};

export default function HomePage() {
  return (
    <div>
      <section className="bg-gradient-to-b from-terraSoft to-cream px-4 py-16 text-center md:py-24">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
            Discover art from Houston&apos;s
            <span className="text-terra"> emerging artists</span>
          </h1>
          <p className="mt-4 text-lg text-muted md:text-xl">
            Browse original work, connect with artists, and commission one-of-a-kind pieces
            that tell your story.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="#feed"
              className="press rounded-full bg-terra px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terraDark"
            >
              Explore Art
            </Link>
            <Link
              href="/register"
              className="press rounded-full border border-line px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-sand/50"
            >
              Join as an Artist
            </Link>
          </div>
          <div className="mt-10 flex justify-center gap-8 text-sm text-muted">
            <div>
              <p className="font-display text-2xl font-bold text-ink">85%</p>
              <p>Goes to artists</p>
            </div>
            <div className="border-l border-line" />
            <div>
              <p className="font-display text-2xl font-bold text-ink">Houston</p>
              <p>Local talent</p>
            </div>
            <div className="border-l border-line" />
            <div>
              <p className="font-display text-2xl font-bold text-ink">Custom</p>
              <p>Commissions welcome</p>
            </div>
          </div>
        </div>
      </section>

      <div id="feed" className="mx-auto max-w-7xl px-4 py-8">
        <HomeShelves />
        <RecentlyViewed />
        <h2 className="mb-6 font-display text-2xl font-bold text-ink">Discover</h2>
        <Suspense fallback={<div className="flex justify-center py-16"><Spinner size="lg" /></div>}>
          <ArtFeed />
        </Suspense>
      </div>
    </div>
  );
}
