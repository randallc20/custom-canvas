import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtFeed } from '@/components/feed/ArtFeed';
import { HomeHero } from '@/components/home/HomeHero';
import { HomeShelves } from '@/components/feed/HomeShelves';
import { RecentlyViewed } from '@/components/feed/RecentlyViewed';
import { DiscoverHeader } from '@/components/home/DiscoverHeader';
import { Spinner } from '@/components/ui/Spinner';

export const metadata: Metadata = {
  title: 'Custom Canvas — Discover Art from Local Artists Near You',
  description: 'Browse, collect, and commission one-of-a-kind pieces from the artists in your community.',
};

export default async function HomePage() {
  // Decided on the SERVER, deliberately. Gating the hero on `useAuth()` would
  // render it on the first paint — the client has no session yet — and then
  // remove it, jumping the whole page up half a screen the moment auth
  // resolves. That is worse than leaving the hero in place. The cost is that
  // this page is dynamic for anonymous visitors too, which is the right trade
  // for a feed that was already client-fetching everything below the fold.
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const signedIn = !!user;

  return (
    <div>
      {/* The hero is an ACQUISITION surface: what the site is, why to trust it,
          how to join. Someone who is already signed in has agreed to all of it,
          and it was costing them ~500px above the fold before the artwork. */}
      {!signedIn && <HomeHero />}

      <div id="feed" className="mx-auto max-w-7xl px-4 py-8">
        <HomeShelves />
        <RecentlyViewed />
        {signedIn ? (
          <DiscoverHeader />
        ) : (
          <h2 className="mb-6 font-display text-2xl font-bold text-ink">Discover</h2>
        )}
        <Suspense fallback={<div className="flex justify-center py-16"><Spinner size="lg" /></div>}>
          <ArtFeed />
        </Suspense>
      </div>
    </div>
  );
}
