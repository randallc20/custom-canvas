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

  // Affiliated artists merge two sources: the partner's curated roster and
  // artists whose education links to this partner (auto: Alumni & Students).
  const [{ data: galleryArtists }, { data: educationLinks }] = await Promise.all([
    supabase
      .from('gallery_artists')
      .select('role, artist:artist_profiles(*, profile:profiles(*))')
      .eq('gallery_id', gallery.id)
      .order('added_at', { ascending: false }),
    supabase
      .from('artist_education')
      .select('artist:artist_profiles(*, profile:profiles(*))')
      .eq('partner_id', gallery.id),
  ]);

  const rosterArtists = (galleryArtists ?? [])
    .map((ga: Record<string, unknown>) => ({
      ...(ga.artist as Record<string, unknown>),
      gallery_role: ga.role as string,
    }) as Record<string, unknown>)
    .filter((a) => a.id);

  const rosterIds = new Set(rosterArtists.map((a) => a.id as string));
  const alumniArtists = (educationLinks ?? [])
    .map((link: Record<string, unknown>) => link.artist as Record<string, unknown>)
    .filter((a) => a?.id && !rosterIds.has(a.id as string))
    // an artist may list the same school in multiple entries
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);

  return (
    <div>
      <GalleryHero gallery={gallery} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-6 text-xl font-bold text-ink">Artists</h2>
        {rosterArtists.length === 0 && alumniArtists.length === 0 ? (
          <EmptyState
            title="No artists yet"
            description="Artists affiliated with this partner will appear here."
          />
        ) : (
          <div className="space-y-10">
            {rosterArtists.length > 0 && (
              <div>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
                  {gallery.partner_type === 'school' ? 'Featured' : 'Represented'}
                </h3>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {rosterArtists.map((artist: Record<string, unknown>) => (
                    <ProfileCard key={artist.id as string} artist={artist as unknown as ArtistProfile} />
                  ))}
                </div>
              </div>
            )}
            {alumniArtists.length > 0 && (
              <div>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
                  Alumni &amp; Students
                </h3>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {alumniArtists.map((artist) => (
                    <ProfileCard key={artist.id as string} artist={artist as unknown as ArtistProfile} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
