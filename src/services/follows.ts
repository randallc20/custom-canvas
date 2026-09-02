import { supabase } from '@/lib/supabase';
import { ArtistProfile } from '@/types/artist';
import { ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';

export async function getFollowedArtists(profileId: string): Promise<ArtistProfile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(`artist:artist_profiles(${ARTIST_PUBLIC_COLS})`)
    .eq('follower_id', profileId);

  if (error) throw error;
  return (data?.map((f) => f.artist) ?? []) as unknown as ArtistProfile[];
}

export async function followArtist(profileId: string, artistId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: profileId, artist_id: artistId });

  if (error) throw error;
}

export async function unfollowArtist(profileId: string, artistId: string): Promise<void> {
  const { data, error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', profileId)
    .eq('artist_id', artistId)
    .select('artist_id');

  if (error) throw error;
  // Zero rows = RLS refused the delete — the button would flip to "Follow"
  // while the follow silently survived.
  if (!data?.length) throw new Error('Could not unfollow — please refresh and try again.');
}

export async function isFollowing(profileId: string, artistId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', profileId)
    .eq('artist_id', artistId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

// follows is own-rows-only since 00052; the public number comes from the
// SECURITY DEFINER follower_count(), which returns the count and nothing else.
export async function getFollowerCount(artistId: string): Promise<number> {
  const { data, error } = await supabase.rpc('follower_count', { p_artist_id: artistId });

  if (error) throw error;
  return Number(data ?? 0);
}
