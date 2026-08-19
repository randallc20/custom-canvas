import { supabase } from '@/lib/supabase';
import { ArtistProfile, ArtistWithProfile } from '@/types/artist';
import { ARTIST_PROFILE_EMBED } from '@/lib/publicProfile';

export async function getArtistBySlug(slug: string): Promise<ArtistWithProfile | null> {
  const { data, error } = await supabase
    .from('artist_profiles')
    .select(`*, ${ARTIST_PROFILE_EMBED}`)
    .eq('slug', slug)
    .single();

  if (error) throw error;
  return data;
}

export async function updateArtistProfile(
  id: string,
  updates: Partial<ArtistProfile>
): Promise<ArtistProfile> {
  const { data, error } = await supabase
    .from('artist_profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
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
