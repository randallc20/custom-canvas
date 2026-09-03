import { supabase } from '@/lib/supabase';
import { withSessionRetry, isRlsDenial } from '@/lib/sessionRetry';
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
  // Near signup the session cookie may not be attached yet (CONVENTIONS
  // rule 3): re-sync and retry once on an RLS refusal.
  const { error } = await withSessionRetry(
    () => supabase.from('follows').insert({ follower_id: profileId, artist_id: artistId }),
    (r) => isRlsDenial(r.error)
  );

  if (error) throw error;
}

export async function unfollowArtist(profileId: string, artistId: string): Promise<void> {
  const { data, error } = await withSessionRetry(
    () => supabase
      .from('follows')
      .delete()
      .eq('follower_id', profileId)
      .eq('artist_id', artistId)
      .select('artist_id'),
    (r) => !r.error && !r.data?.length
  );

  if (error) throw error;
  // Zero rows = RLS refused the delete — the button would flip to "Follow"
  // while the follow silently survived.
  if (!data?.length) throw new Error('Could not unfollow — please refresh and try again.');
}

/** Just the artist ids, for the shared followed-state set the browse cards read. */
export async function getFollowedArtistIds(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('artist_id')
    .eq('follower_id', profileId);

  if (error) throw error;
  return (data ?? []).map((row) => row.artist_id as string);
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
