import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ListingDetail } from '@/components/listing/ListingDetail';
import { PurchasePanel } from '@/components/listing/PurchasePanel';
import { RelatedListings } from '@/components/listing/RelatedListings';
import { TrackView } from '@/components/analytics/TrackView';
import { notFound } from 'next/navigation';
import type { ListingWithImages } from '@/types/listing';

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

  if (!data) return { title: 'Listing Not Found' };

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
      .select('*')
      .eq('id', listing.artist_id)
      .single(),
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
          <ListingDetail listing={processedListing} artist={artist} />
        </div>
        <div>
          <PurchasePanel listing={processedListing} artistSlug={artist?.slug ?? ''} artistProfileId={artist?.profile_id} />
        </div>
      </div>
      <div className="mt-12">
        <RelatedListings listings={relatedListings} />
      </div>
    </div>
  );
}
