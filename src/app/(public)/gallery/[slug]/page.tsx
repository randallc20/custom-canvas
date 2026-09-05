import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ARTIST_PROFILE_EMBED, ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';
import { GalleryHero } from '@/components/gallery/GalleryHero';
import { ProfileCard } from '@/components/artist/ProfileCard';
import { ListingShelf } from '@/components/feed/ListingShelf';
import { EmptyState } from '@/components/ui/EmptyState';
import { notFound } from 'next/navigation';
import type { ArtistProfile } from '@/types/artist';
import type { ListingWithImages } from '@/types/listing';

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

  // notFound() HERE, not only in the page body. Metadata resolves before the
  // response commits; a notFound() thrown later, from the body, arrives after
  // the 200 has already gone out — the browser hydrates the not-found UI so it
  // looks right, but curl, Google and a link checker see a live 200 with an
  // empty shell. Every public detail page had this. Found the morning the
  // database was reset for launch, when the old test artist's URL kept
  // answering 200.
  if (!data) notFound();

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
  const [{ data: galleryArtists }, { data: educationLinks }, { data: pickRows }] = await Promise.all([
    supabase
      .from('gallery_artists')
      .select(`role, artist:artist_profiles(${ARTIST_PUBLIC_COLS}, ${ARTIST_PROFILE_EMBED})`)
      .eq('gallery_id', gallery.id)
      .order('added_at', { ascending: false }),
    supabase
      .from('artist_education')
      .select(`artist:artist_profiles(${ARTIST_PUBLIC_COLS}, ${ARTIST_PROFILE_EMBED})`)
      .eq('partner_id', gallery.id),
    // Picks only exist publicly while the partner is verified — a revoked
    // partner's stale curation must not keep trading on the badge.
    gallery.is_verified
      ? supabase
          .from('partner_picks')
          .select('blurb, display_order, listing:listings!inner(*, images:listing_images(*), artist:artist_profiles(slug, display_name))')
          .eq('gallery_id', gallery.id)
          .eq('listings.status', 'available')
          .order('display_order', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const picks = ((pickRows ?? []).map((row: Record<string, unknown>) => row.listing) ?? []) as unknown as ListingWithImages[];
  const pickBlurbs: Record<string, string> = {};
  for (const row of (pickRows ?? []) as { blurb?: string | null; listing?: { id?: string } }[]) {
    if (row.blurb && row.listing?.id) pickBlurbs[row.listing.id] = row.blurb;
  }

  // Only live artists appear on partner rosters — a draft/pending artist's
  // card would link to a 404 (their page isn't public yet).
  const rosterArtists = (galleryArtists ?? [])
    .map((ga: Record<string, unknown>) => ({
      ...(ga.artist as Record<string, unknown>),
      gallery_role: ga.role as string,
    }) as Record<string, unknown>)
    .filter((a) => a.id && a.is_live);

  const rosterIds = new Set(rosterArtists.map((a) => a.id as string));
  const alumniArtists = (educationLinks ?? [])
    .map((link: Record<string, unknown>) => link.artist as Record<string, unknown>)
    .filter((a) => a?.id && a.is_live && !rosterIds.has(a.id as string))
    // an artist may list the same school in multiple entries
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);

  return (
    <div>
      <GalleryHero gallery={gallery} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        {picks.length > 0 && (
          <div className="mb-4">
            <ListingShelf
              eyebrow="Curated"
              title="Our picks"
              subtitle={`Pieces ${gallery.gallery_name} thinks you should see`}
              listings={picks}
              captions={pickBlurbs}
            />
          </div>
        )}
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
