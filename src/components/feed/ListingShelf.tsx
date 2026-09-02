'use client';

import Link from 'next/link';
import { ListingWithImages } from '@/types/listing';
import { FeedCard } from '@/components/feed/FeedCard';
import { Skeleton } from '@/components/ui/Skeleton';

interface ListingShelfProps {
  title: string;
  subtitle?: string;
  listings: ListingWithImages[] | undefined;
  isLoading?: boolean;
  eyebrow?: string;
  /** Optional destination for a right-aligned "View →" link. */
  href?: string;
  hrefLabel?: string;
  /** Optional curator notes, keyed by listing id, shown under the cards. */
  captions?: Record<string, string>;
}

/** A horizontal-scroll row of listing cards with a Fraunces header.
 *  Renders nothing when there is nothing to show — shelves never leave
 *  sad empty bands on the homepage. */
export function ListingShelf({ title, subtitle, listings, isLoading, eyebrow, href, hrefLabel, captions }: ListingShelfProps) {
  if (isLoading) {
    return (
      <section className="mb-10">
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-56 flex-none rounded-xl md:w-64" />
          ))}
        </div>
      </section>
    );
  }
  if (!listings?.length) return null;

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-wide text-terraText">{eyebrow}</p>
          )}
          <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="whitespace-nowrap text-sm font-medium text-terraText hover:text-terraTextDark">
            {hrefLabel ?? 'View'} →
          </Link>
        )}
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
        {listings.map((listing) => (
          <div key={listing.id} className="w-56 flex-none snap-start md:w-64">
            <FeedCard listing={listing} />
            {captions?.[listing.id] && (
              <p className="mt-2 px-1 text-xs italic leading-snug text-muted">
                &ldquo;{captions[listing.id]}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
