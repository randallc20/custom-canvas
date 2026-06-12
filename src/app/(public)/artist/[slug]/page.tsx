import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ProfileHero } from '@/components/artist/ProfileHero';
import { StorySection } from '@/components/artist/StorySection';
import { PinnedWork } from '@/components/artist/PinnedWork';
import { SeriesTabs } from '@/components/artist/SeriesTabs';
import { EducationTimeline } from '@/components/artist/EducationTimeline';
import { MeetTheArtist } from '@/components/artist/MeetTheArtist';
import { PreviewBanner } from '@/components/artist/PreviewBanner';
import { CommissionPanel } from '@/components/artist/CommissionPanel';
import { ReviewsList } from '@/components/artist/ReviewsList';
import { TrackView } from '@/components/analytics/TrackView';
import { notFound } from 'next/navigation';
import type { ListingWithImages } from '@/types/listing';
import type { Review } from '@/types/order';

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

  const [listingsRes, reviewsRes, seriesRes, educationRes, photosRes, videosRes] = await Promise.all([
    supabase
      .from('listings')
      .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
      .eq('artist_id', artist.id)
      .in('status', ['available', 'sold'])
      .order('created_at', { ascending: false }),
    supabase
      .from('reviews')
      .select('*, order:orders!inner(artist_id), reviewer:profiles(full_name)')
      .eq('order.artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('listing_series')
      .select('*')
      .eq('artist_id', artist.id)
      .order('display_order'),
    supabase
      .from('artist_education')
      .select('*, partner:gallery_profiles(slug, gallery_name, partner_type, is_verified)')
      .eq('artist_id', artist.id)
      .order('display_order'),
    supabase
      .from('artist_personal_photos')
      .select('*')
      .eq('artist_id', artist.id)
      .order('display_order'),
    supabase
      .from('artist_videos')
      .select('*')
      .eq('artist_id', artist.id)
      .order('display_order'),
  ]);

  const processedListings = (listingsRes.data ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    tags: ((l.tags as Array<{ tag: unknown }>) ?? []).map((lt) => lt.tag),
  })) as unknown as (ListingWithImages & { series_id?: string | null })[];

  const pinnedIds: string[] = artist.pinned_listing_ids ?? [];
  const pinnedListings = pinnedIds
    .map((id) => processedListings.find((l) => l.id === id))
    .filter(Boolean) as ListingWithImages[];

  const reviews = (reviewsRes.data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as Review),
    reviewer_name: ((r.reviewer as Record<string, unknown>)?.full_name as string) ?? null,
  }));

  return (
    <div>
      <TrackView artistId={artist.id} eventType="profile_view" />
      <Suspense>
        <PreviewBanner />
      </Suspense>
      <ProfileHero artist={artist} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-10 lg:col-span-2">
            <StorySection artist={artist} />
            <PinnedWork listings={pinnedListings} />
            <div>
              <h2 className="mb-4 text-xl font-semibold text-ink">Artwork</h2>
              <SeriesTabs
                listings={processedListings}
                series={seriesRes.data ?? []}
                accentColor={artist.accent_color}
              />
            </div>
            <MeetTheArtist
              displayName={artist.display_name}
              photos={photosRes.data ?? []}
              videos={videosRes.data ?? []}
            />
            <EducationTimeline education={educationRes.data ?? []} />
            <div>
              <h2 className="mb-4 text-xl font-semibold text-ink">Reviews</h2>
              <ReviewsList reviews={reviews} />
            </div>
          </div>
          <div>
            <CommissionPanel artist={artist} />
          </div>
        </div>
      </div>
    </div>
  );
}
