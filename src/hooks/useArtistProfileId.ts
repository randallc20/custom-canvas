'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export interface OwnArtistProfile {
  id: string;
  slug: string;
  completeness_score: number;
  stripe_onboarded: boolean;
  pinned_listing_ids: string[] | null;
  application_status: 'draft' | 'pending' | 'approved' | 'rejected';
}

/** The signed-in artist's own artist_profiles row — one React Query-cached
 *  fetch shared by every Studio surface (replaces the per-page useEffect
 *  lookups the old console pages each hand-rolled). */
export function useOwnArtistProfile(): { artist: OwnArtistProfile | null; loading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['own-artist-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('artist_profiles')
        // stripe_account_id + rejection_reason are not client-readable
        // (00033); the banner fetches the rejection reason via
        // /api/artist/application when it needs it.
        .select('id, slug, completeness_score, stripe_onboarded, pinned_listing_ids, application_status')
        .eq('profile_id', user!.id)
        .maybeSingle();
      return (data as OwnArtistProfile | null) ?? null;
    },
    enabled: !!user,
  });
  return { artist: data ?? null, loading: !!user && isLoading };
}

/** Convenience wrapper for surfaces that only need the id. */
export function useArtistProfileId(): { artistId: string; loading: boolean } {
  const { artist, loading } = useOwnArtistProfile();
  return { artistId: artist?.id ?? '', loading };
}
