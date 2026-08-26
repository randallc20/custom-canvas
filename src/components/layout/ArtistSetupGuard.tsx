'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Registering as an artist creates the profiles row; the artist_profiles row is
 * only created when they finish the setup wizard. The wizard's one entry point
 * was the "Continue to setup" link on the post-signup screen — so anyone who
 * clicked the confirmation email in a new tab (which is everyone) signed in and
 * landed on a bare Studio: no checklist, no banner, stat cards reading zero, and
 * nothing telling them what to do. Send them to the wizard instead.
 *
 * Cached with staleTime: Infinity and keyed on the user id: the answer never
 * changes after onboarding, so an established artist pays the existence check
 * once per session — not on every Studio entry, and not again on each hourly
 * token refresh (which re-creates the `user` object identity). The wizard
 * invalidates this key after its insert.
 *
 * Deliberately its own query rather than useOwnArtistProfile: that hook
 * swallows errors and returns null, which here is indistinguishable from "no
 * profile" and would bounce an established artist into a wizard whose insert
 * then fails. This queryFn THROWS on error, and errors render the Studio —
 * a transient blip must never trap someone in onboarding. (The wizard itself
 * backstops the residual silent-empty edge: it re-checks for an existing row
 * before inserting.)
 */
export function ArtistSetupGuard({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isArtist = !!user && user.role === 'artist';

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['artist-profile-exists', user?.id],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('profile_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return row ? 'exists' : 'missing';
    },
    enabled: isArtist,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  // Never redirect on stale data: right after the wizard finishes it
  // invalidates this key, and the cache still says 'missing' while the
  // refetch is in flight — redirecting then bounces the artist straight back
  // into the wizard they just completed.
  const shouldRedirect = isArtist && data === 'missing' && !isFetching;
  useEffect(() => {
    if (shouldRedirect) router.replace('/onboarding/artist');
  }, [shouldRedirect, router]);

  // Non-artists are AuthGuard's problem; errors fail open to the Studio.
  const ready = !isArtist || data === 'exists' || isError;

  if (authLoading || (!ready && (isLoading || isFetching || shouldRedirect))) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
