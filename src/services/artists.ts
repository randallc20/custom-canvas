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

export async function updateArtistProfile(
  id: string,
  updates: Partial<ArtistProfile>
): Promise<ArtistProfile> {
  const { data, error } = await supabase
    .from('artist_profiles')
    .update(updates)
    .eq('id', id)
    .select(ARTIST_PUBLIC_COLS) // bare .select() = RETURNING * → 42501 on revoked columns
    .single();

  if (error) throw error;
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
