import { supabase } from '@/lib/supabase';
import { withSessionRetry } from '@/lib/sessionRetry';
import { ArtistProfile, ArtistWithProfile } from '@/types/artist';
import { ARTIST_PROFILE_EMBED, ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';

export async function getArtistBySlug(slug: string): Promise<ArtistWithProfile | null> {
  const { data, error } = await supabase
    .from('artist_profiles')
    .select(`${ARTIST_PUBLIC_COLS}, ${ARTIST_PROFILE_EMBED}`)
    .eq('slug', slug)
    .single();

  if (error) throw error;
  // Dynamic select string defeats supabase-js inference — pin the type.
  return data as unknown as ArtistWithProfile;
}

/** Thrown when the UPDATE matched zero rows even after re-syncing auth —
 *  the caller should tell the user to refresh rather than "try again". */
export class ProfileSaveAuthError extends Error {
  constructor() {
    super('Profile update matched no rows (RLS): the request was not authenticated as the profile owner.');
    this.name = 'ProfileSaveAuthError';
  }
}

export async function updateArtistProfile(
  id: string,
  updates: Partial<ArtistProfile>
): Promise<ArtistProfile> {
  const run = () =>
    supabase
      .from('artist_profiles')
      .update(updates)
      .eq('id', id)
      .select(ARTIST_PUBLIC_COLS) // bare .select() = RETURNING * → 42501 on revoked columns
      .maybeSingle();

  // Zero rows updated with no error: RLS didn't match auth.uid() — on an
  // UPDATE that's how the fresh-session race manifests. .single() used to
  // turn this into an opaque PGRST116 "Failed to update profile" toast.
  const { data, error } = await withSessionRetry(run, (r) => !r.error && !r.data);

  if (error) throw error;
  if (!data) throw new ProfileSaveAuthError();
  return data as unknown as ArtistProfile;
}

export async function getArtistListings(artistId: string) {
  const { data, error } = await supabase
    .from('listings')
    .select('*, images:listing_images(*)')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}
