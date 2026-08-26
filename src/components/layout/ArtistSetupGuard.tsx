'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
 * Deliberately does its own read rather than reusing useOwnArtistProfile: that
 * hook swallows query errors and returns null, which here is indistinguishable
 * from "no profile" and would bounce an established artist into a wizard whose
 * insert then fails on the slug's unique constraint. On any error we render the
 * Studio and let the page's own loading states handle it — a transient blip must
 * never trap someone in onboarding.
 */
export function ArtistSetupGuard({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ok' | 'redirecting'>('checking');

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'artist') {
      // AuthGuard owns these cases; don't hold the tree hostage.
      setState('ok');
      return;
    }

    let live = true;
    supabase
      .from('artist_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setState('ok');
          return;
        }
        if (data) {
          setState('ok');
        } else {
          setState('redirecting');
          router.replace('/onboarding/artist');
        }
      });

    return () => {
      live = false;
    };
  }, [user, authLoading, router]);

  if (state !== 'ok') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
