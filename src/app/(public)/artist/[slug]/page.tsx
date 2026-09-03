import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ARTIST_PROFILE_EMBED, ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';
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
    .select('display_name, bio, is_live')
    .eq('slug', params.slug)
    .single();

  // Non-live shops must not leak the artist's name via <title>/og tags —
  // the page body 404s, and the metadata must match (owner/admin previews
  // just get the generic title; fine).
  if (!data || !data.is_live) return { title: 'Artist Not Found' };

  return {
    title: data.display_name,
    description: data.bio ?? `View art by ${data.display_name} on Custom Canvas.`,
  };
}

export default async function ArtistPage({ params }: Props) {
  const supabase = createServerSupabaseClient();

  // Dynamic select string defeats supabase-js inference — pin the type.
  const { data: artist } = (await supabase
    .from('artist_profiles')
    .select(`${ARTIST_PUBLIC_COLS}, ${ARTIST_PROFILE_EMBED}`)
    .eq('slug', params.slug)
    .single()) as unknown as { data: import('@/types/artist').ArtistWithProfile | null };

  if (!artist) notFound();

  // Draft/pending/rejected shops are not public. The owner still sees their
  // page (the ?preview=1 flow), and admins see it from the review queue —
  // everyone else gets a 404, same as a slug that never existed.
  if (!artist.is_live) {
    const { data: { user } } = await supabase.auth.getUser();
    const isOwner = user?.id === artist.profile_id;
    let isAdmin = false;
    if (user && !isOwner) {
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      isAdmin = me?.role === 'admin';
    }
    if (!isOwner && !isAdmin) notFound();
  }

  const [listingsRes, reviewsRes, seriesRes, educationRes, photosRes] = await Promise.all([
    supabase
      .from('listings')
      .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
      .eq('artist_id', artist.id)
      .in('status', ['available', 'sold'])
      .order('created_at', { ascending: false }),
    supabase
      .from('reviews')
      // NOT via orders!inner: orders RLS is buyer/artist/admin, so an inner
      // join silently dropped every review for the shoppers reviews exist to
      // persuade. reviews.artist_id (00038) is set by trigger from the order.
      .select('*, reviewer:profiles(full_name)')
      .eq('artist_id', artist.id)
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
                accentColor={artist.accent_color ?? undefined}
              />
            </div>
            <MeetTheArtist
              displayName={artist.display_name}
              photos={photosRes.data ?? []}
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
