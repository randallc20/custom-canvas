import { supabase } from '@/lib/supabase';
import { ArtistProfile } from '@/types/artist';

export async function getFollowedArtists(profileId: string): Promise<ArtistProfile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('artist:artist_profiles(*)')
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
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', profileId)
    .eq('artist_id', artistId);

  if (error) throw error;
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

export async function getFollowerCount(artistId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId);

  if (error) throw error;
  return count ?? 0;
}
