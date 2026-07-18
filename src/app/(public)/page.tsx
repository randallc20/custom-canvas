import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArtFeed } from '@/components/feed/ArtFeed';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeShelves } from '@/components/feed/HomeShelves';
import { RecentlyViewed } from '@/components/feed/RecentlyViewed';
import { Spinner } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Custom Canvas — Discover Art from Local Artists Near You',
  description: 'Browse, collect, and commission one-of-a-kind pieces from the artists in your community.',
};

export default function HomePage() {
  return (
    <div>
      <HomeHero />

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
