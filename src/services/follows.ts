import { supabase } from '@/lib/supabase';
import { ArtistProfile } from '@/types/artist';
import { ARTIST_PROFILE_EMBED, ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';

/** Following rows render the artist's avatar, which lives on the profiles row. */
export type FollowedArtist = ArtistProfile & { profile?: { avatar_url: string | null } | null };

export async function getFollowedArtists(profileId: string): Promise<FollowedArtist[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(`artist:artist_profiles(${ARTIST_PUBLIC_COLS}, ${ARTIST_PROFILE_EMBED})`)
    .eq('follower_id', profileId);

  if (error) throw error;
  return (data?.map((f) => f.artist) ?? []) as unknown as FollowedArtist[];
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

export async function getFollowerCount(artistId: string): Promise<number> {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artistId);

  if (error) throw error;
  return count ?? 0;
}
