'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { captureException } from '@/lib/sentry';
import { ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';
import type { ArtistProfile } from '@/types/artist';

/** The signed-in artist's own row. Every client-readable column (00033's
 *  grant list, ARTIST_PUBLIC_COLS) rather than a per-caller subset: the six
 *  Studio surfaces that used to hand-roll this each selected a different
 *  handful, so a grant change had to be discovered six times. One list, one
 *  place to extend. `application_status` is granted but absent from the
 *  ArtistProfile type, which the public pages share. */
export type OwnArtistProfile = ArtistProfile & {
  application_status: 'draft' | 'pending' | 'approved' | 'rejected';
};

/** One React Query-cached fetch shared by every Studio surface (replaces the
 *  per-page useEffect lookups the old console pages each hand-rolled).
 *
 *  The queryFn THROWS on error rather than degrading to null: "no row" and
 *  "the read failed" are different answers, and ArtistSetupGuard redirects
 *  into onboarding on the first one — conflating them would bounce an
 *  established artist into a wizard whose insert then fails. Callers that
 *  only render get `artist === null` either way; the guard reads `isError`. */
export function useOwnArtistProfile(): {
  artist: OwnArtistProfile | null;
  loading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { user } = useAuth();
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['own-artist-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('artist_profiles')
        // stripe_account_id + rejection_reason are not client-readable
        // (00033); the banner fetches the rejection reason via
        // /api/artist/application when it needs it.
        .select(ARTIST_PUBLIC_COLS)
        .eq('profile_id', user!.id)
        .maybeSingle();
      if (error) {
        captureException(error, { where: 'useOwnArtistProfile' });
        throw error;
      }
      return (data as unknown as OwnArtistProfile | null) ?? null;
    },
    enabled: !!user,
    retry: 1,
  });
  return {
    artist: data ?? null,
    loading: !!user && isLoading,
    isFetching,
    isError,
    refetch: () => { void refetch(); },
  };
}

/** Convenience wrapper for surfaces that only need the id. */
export function useArtistProfileId(): { artistId: string; loading: boolean } {
  const { artist, loading } = useOwnArtistProfile();
  return { artistId: artist?.id ?? '', loading };
}
