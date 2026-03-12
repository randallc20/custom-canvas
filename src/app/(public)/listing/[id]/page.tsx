import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ListingDetail } from '@/components/listing/ListingDetail';
import { PurchasePanel } from '@/components/listing/PurchasePanel';
import { notFound } from 'next/navigation';

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

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('*')
    .eq('id', listing.artist_id)
    .single();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ListingDetail listing={processedListing} artist={artist} />
        </div>
        <div>
          <PurchasePanel listing={processedListing} artistSlug={artist?.slug ?? ''} />
        </div>
      </div>
    </div>
  );
}
