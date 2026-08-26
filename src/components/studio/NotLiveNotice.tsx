'use client';

import Link from 'next/link';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';

/**
 * The approval gate is invisible from where artists actually work: listings
 * show up fine in the Studio (owner-exempt RLS) while the public site shows
 * nothing, and the checklist that explains this lives only on /studio. This
 * banner puts the truth next to the work — a tester made two listings, opened
 * an incognito window, and reasonably concluded the site was broken.
 */
export function NotLiveNotice() {
  const { artist } = useOwnArtistProfile();
  if (!artist || artist.application_status === 'approved') return null;

  if (artist.application_status === 'pending') {
    return (
      <div className="mb-6 rounded-xl border border-line bg-sand/40 p-4">
        <p className="text-sm font-medium text-ink">Only you can see your work right now</p>
        <p className="mt-1 text-sm text-muted">
          Your shop is in review — everything here goes public the moment it&apos;s approved.
        </p>
      </div>
    );
  }

  // draft or rejected: the artist has a step to take.
  return (
    <div className="mb-6 rounded-xl border border-terra/30 bg-terraSoft/60 p-4">
      <p className="text-sm font-medium text-ink">Only you can see your work right now</p>
      <p className="mt-1 text-sm text-muted">
        {artist.application_status === 'rejected'
          ? 'Your application needs changes before your shop can go live — see the feedback in your Studio.'
          : 'Your shop hasn’t been submitted for review yet — buyers can’t find your profile or listings until it’s approved.'}
      </p>
      <Link href="/studio" className="mt-2 inline-block text-sm font-medium text-terra hover:underline">
        {artist.application_status === 'rejected' ? 'See the feedback →' : 'Finish setup & submit for review →'}
      </Link>
    </div>
  );
}
