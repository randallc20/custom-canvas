import { supabase } from '@/lib/supabase';
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

  let { data, error } = await run();

  // Zero rows updated, no error: RLS didn't match auth.uid(), which right
  // after signup usually means the request went out before the fresh session
  // cookie attached. Re-sync the session and retry once — .single() used to
  // turn this into an opaque PGRST116 "Failed to update profile" toast.
  if (!error && !data) {
    await supabase.auth.refreshSession();
    ({ data, error } = await run());
  }

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
