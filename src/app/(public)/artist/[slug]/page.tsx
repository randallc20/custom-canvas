import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProfileHero } from '@/components/artist/ProfileHero';
import { GalleryGrid } from '@/components/artist/GalleryGrid';
import { CommissionPanel } from '@/components/artist/CommissionPanel';
import { notFound } from 'next/navigation';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('artist_profiles')
    .select('display_name, bio')
    .eq('slug', params.slug)
    .single();

  if (!data) return { title: 'Artist Not Found' };

  return {
    title: data.display_name,
    description: data.bio ?? `View art by ${data.display_name} on Custom Canvas.`,
  };
}

export default async function ArtistPage({ params }: Props) {
  const supabase = createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', params.slug)
    .single();

  if (!artist) notFound();

  const { data: listings } = await supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
    .eq('artist_id', artist.id)
    .eq('status', 'available')
    .order('created_at', { ascending: false });

  const processedListings = (listings ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    tags: ((l.tags as Array<{ tag: unknown }>) ?? []).map((lt) => lt.tag),
  }));

  return (
    <div>
      <ProfileHero artist={artist} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Artwork</h2>
            <GalleryGrid listings={processedListings} />
          </div>
          <div>
            <CommissionPanel artist={artist} />
          </div>
        </div>
      </div>
    </div>
  );
}
