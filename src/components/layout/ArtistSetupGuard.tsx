'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Registering as an artist creates the profiles row; the artist_profiles row is
 * only created when they finish the setup wizard. The wizard's one entry point
 * was the "Continue to setup" link on the post-signup screen — so anyone who
 * clicked the confirmation email in a new tab (which is everyone) signed in and
 * landed on a bare Studio: no checklist, no banner, stat cards reading zero, and
 * nothing telling them what to do. Send them to the wizard instead.
 *
 * Shares useOwnArtistProfile's cached read (keyed on the user id, invalidated
 * by the wizard after its insert) rather than hand-rolling a seventh copy of
 * the lookup. That hook now THROWS on a read error instead of degrading to
 * null, which is what this guard needs: "no row" and "the read failed" are
 * different answers, and only the first may redirect. Errors render the
 * Studio — a transient blip must never trap someone in onboarding. (The
 * wizard itself backstops the residual silent-empty edge: it re-checks for an
 * existing row before inserting.)
 */
export function ArtistSetupGuard({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const isArtist = !!user && user.role === 'artist';

  const { artist, loading: isLoading, isFetching, isError } = useOwnArtistProfile();

  // Never redirect on stale data: right after the wizard finishes it
  // invalidates this key, and the cache still says 'missing' while the
  // refetch is in flight — redirecting then bounces the artist straight back
  // into the wizard they just completed.
  const shouldRedirect = isArtist && !artist && !isError && !isLoading && !isFetching;
  useEffect(() => {
    if (shouldRedirect) router.replace('/onboarding/artist');
  }, [shouldRedirect, router]);

  // Non-artists are AuthGuard's problem; errors fail open to the Studio.
  const ready = !isArtist || !!artist || isError;

  if (authLoading || (!ready && (isLoading || isFetching || shouldRedirect))) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
