import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ListingDetail } from '@/components/listing/ListingDetail';
import { PurchasePanel } from '@/components/listing/PurchasePanel';
import { ShareButton } from '@/components/ui/ShareButton';
import { RelatedListings } from '@/components/listing/RelatedListings';
import { TrackView } from '@/components/analytics/TrackView';
import { notFound } from 'next/navigation';
import type { ListingWithImages } from '@/types/listing';
import { ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('listings')
    .select('title, description, medium')
    .eq('id', params.id)
    .single();

  // notFound() HERE, not only in the page body. Metadata resolves before the
  // response commits; a notFound() thrown later, from the body, arrives after
  // the 200 has already gone out — the browser hydrates the not-found UI so it
  // looks right, but curl, Google and a link checker see a live 200 with an
  // empty shell. Every public detail page had this. Found the morning the
  // database was reset for launch, when the old test artist's URL kept
  // answering 200.
  if (!data) notFound();

  return {
    title: data.title,
    description: data.description ?? `${data.title} — ${data.medium} on Custom Canvas.`,
  };
}

export default async function ListingPage({ params }: Props) {
  const supabase = createServerSupabaseClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
    .eq('id', params.id)
    .single();

  if (!listing) notFound();

  const processedListing = {
    ...listing,
    tags: (listing.tags ?? []).map((lt: { tag: unknown }) => lt.tag),
  };

  const [{ data: artist }, { data: relatedRaw }] = await Promise.all([
    supabase
      .from('artist_profiles')
      .select(ARTIST_PUBLIC_COLS)
      .eq('id', listing.artist_id)
      // dynamic select string defeats supabase-js inference — pin the type
      .single<import('@/types/artist').ArtistProfile>(),
    supabase
      .from('listings')
      .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
      .eq('artist_id', listing.artist_id)
      .neq('id', listing.id)
      .eq('status', 'available')
      .limit(4),
  ]);

  const relatedListings = (relatedRaw ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    tags: ((l.tags as { tag: unknown }[]) ?? []).map((lt) => lt.tag),
  })) as unknown as ListingWithImages[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <TrackView artistId={listing.artist_id} eventType="listing_view" listingId={listing.id} />
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ListingDetail listing={processedListing} />
        </div>
        <div>
          {/* The piece's identity sits with the buy decision: on desktop this
              rail is the first thing beside the image; on mobile it follows
              the image directly. */}
          <div className="mb-4">
            <h1 className="font-display text-3xl font-bold leading-tight text-ink">{processedListing.title}</h1>
            {artist && (
              <Link href={`/artist/${artist.slug}`} className="mt-1 inline-block text-sm font-medium text-terraText hover:underline">
                {artist.display_name}
              </Link>
            )}
            <p className="mt-1 text-sm text-muted">
              {processedListing.medium}
              {processedListing.year_created ? ` · ${processedListing.year_created}` : ''}
            </p>
          </div>
          <PurchasePanel listing={processedListing} artistProfileId={artist?.profile_id} artistName={artist?.display_name} fulfillmentPref={artist?.fulfillment_pref} awayMode={artist?.away_mode} awayUntil={artist?.away_until} />
          <div className="mt-4">
            <ShareButton title={processedListing.title} text={`Check out "${processedListing.title}" on Custom Canvas`} path={`/listing/${processedListing.id}`} className="w-full justify-center" />
          </div>
        </div>
      </div>
      <div className="mt-12">
        <RelatedListings listings={relatedListings} />
      </div>
    </div>
  );
}
