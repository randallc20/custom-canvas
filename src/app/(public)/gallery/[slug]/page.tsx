import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { GalleryHero } from '@/components/gallery/GalleryHero';
import { ProfileCard } from '@/components/artist/ProfileCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { notFound } from 'next/navigation';
import type { ArtistProfile } from '@/types/artist';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('gallery_profiles')
    .select('gallery_name, bio')
    .eq('slug', params.slug)
    .single();

  if (!data) return { title: 'Gallery Not Found' };

  return {
    title: data.gallery_name,
    description: data.bio ?? `${data.gallery_name} on Custom Canvas.`,
  };
}

export default async function GalleryPage({ params }: Props) {
  const supabase = createServerSupabaseClient();

  const { data: gallery } = await supabase
    .from('gallery_profiles')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (!gallery) notFound();

  const { data: galleryArtists } = await supabase
    .from('gallery_artists')
    .select('role, artist:artist_profiles(*, profile:profiles(*))')
    .eq('gallery_id', gallery.id)
    .order('added_at', { ascending: false });

  const artists = (galleryArtists ?? [])
    .map((ga: Record<string, unknown>) => ({
      ...(ga.artist as Record<string, unknown>),
      gallery_role: ga.role as string,
    }))
    .filter(Boolean);

  return (
    <div>
      <GalleryHero gallery={gallery} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-6 text-xl font-bold text-gray-900">
          Represented Artists
        </h2>
        {artists.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((artist: Record<string, unknown>) => (
              <ProfileCard key={artist.id as string} artist={artist as unknown as ArtistProfile} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No artists yet"
            description="This gallery hasn't added any represented artists yet."
          />
        )}
      </div>
    </div>
  );
}
