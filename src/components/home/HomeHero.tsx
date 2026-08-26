'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useLocation } from '@/context/LocationContext';
import { LocationPicker } from '@/components/layout/LocationPicker';
import { useFeaturedShelf } from '@/hooks/useFeatured';

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
        <HeroArtStrip />
        <div className="mt-10 flex justify-center gap-4 text-xs text-muted sm:gap-8 sm:text-sm">
          <div className="min-w-0">
            <p className="whitespace-nowrap font-display text-lg font-bold text-ink sm:text-2xl">Artist-first</p>
            <p>Fair pay, stated up front</p>
          </div>
          <div className="border-l border-line" />
          <div className="min-w-0">
            <p className="whitespace-nowrap font-display text-lg font-bold text-ink sm:text-2xl">{city ?? 'Local'}</p>
            <p>Community first</p>
          </div>
          <div className="border-l border-line" />
          <div className="min-w-0">
            <p className="whitespace-nowrap font-display text-lg font-bold text-ink sm:text-2xl">Custom</p>
            <p>Commissions welcome</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A shelf of real, admin-featured pieces inside the hero — small framed
 *  canvases, hung a degree or two off level. Renders nothing until the
 *  Featured shelf has work, so a brand-new city (or the empty launch state)
 *  keeps the plain hero. */
function HeroArtStrip() {
  const { data } = useFeaturedShelf();
  const pieces = (data ?? []).filter((l) => l.images?.length).slice(0, 5);
  if (pieces.length < 3) return null;

  const tilts = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2', '-rotate-1'];
  return (
    <div className="mt-10 flex items-end justify-center gap-3 sm:gap-5">
      {pieces.map((piece, i) => {
        const img = piece.images.find((im) => im.is_primary) ?? piece.images[0];
        return (
          <Link
            key={piece.id}
            href={`/listing/${piece.id}`}
            className={`${tilts[i % tilts.length]} ${i > 2 ? 'hidden sm:block' : ''} block shrink-0 rounded-sm border-4 border-white bg-white shadow-card transition-transform duration-200 hover:rotate-0 hover:scale-105 hover:shadow-cardHover`}
            aria-label={piece.title}
          >
            <Image
              src={img.image_url}
              alt={piece.title}
              width={112}
              height={112}
              className="h-20 w-20 rounded-[1px] object-cover sm:h-28 sm:w-28"
            />
          </Link>
        );
      })}
    </div>
  );
}
