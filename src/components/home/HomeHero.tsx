'use client';

import Link from 'next/link';
import { useLocation } from '@/context/LocationContext';
import { LocationPicker } from '@/components/layout/LocationPicker';

/** Location-aware hero: names the buyer's community once they've chosen
 *  one; until then it invites them to. */
export function HomeHero() {
  const { location, ready } = useLocation();
  const city = ready ? location?.city : undefined;

  return (
    <section className="bg-gradient-to-b from-terraSoft to-cream px-4 py-16 text-center md:py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {city ? (
            <>
              Discover art from
              <span className="text-terra"> {city}&apos;s local artists</span>
            </>
          ) : (
            <>
              Discover art from
              <span className="text-terra"> your local community</span>
            </>
          )}
        </h1>
        <p className="mt-4 text-lg text-muted md:text-xl">
          {city
            ? `Original work made in ${city} — browse it, collect it, and commission pieces from artists in your community.`
            : 'Local artists, wherever you are. Choose your city to see the art being made around you — and if you fall for a piece from farther away, it ships.'}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {city ? (
            <Link
              href="#feed"
              className="press rounded-full bg-terra px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terraDark"
            >
              Explore {city} Art
            </Link>
          ) : (
            <LocationPicker variant="hero" />
          )}
          <Link
            href="/register"
            className="press rounded-full border border-line px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-sand/50"
          >
            Join as an Artist
          </Link>
        </div>
        <div className="mt-10 flex justify-center gap-8 text-sm text-muted">
          <div>
            <p className="font-display text-2xl font-bold text-ink">Artist-first</p>
            <p>Fair pay, stated up front</p>
          </div>
          <div className="border-l border-line" />
          <div>
            <p className="font-display text-2xl font-bold text-ink">{city ?? 'Local'}</p>
            <p>Community first</p>
          </div>
          <div className="border-l border-line" />
          <div>
            <p className="font-display text-2xl font-bold text-ink">Custom</p>
            <p>Commissions welcome</p>
          </div>
        </div>
      </div>
    </section>
  );
}
