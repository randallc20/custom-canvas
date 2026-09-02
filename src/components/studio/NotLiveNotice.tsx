'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';

/**
 * The approval gate is invisible from where artists actually work: listings
 * show up fine in the Studio (owner-exempt RLS) while the public site shows
 * nothing, and the checklist that explains this lives only on /studio. This
 * banner puts the truth next to the work — a tester made two listings, opened
 * an incognito window, and reasonably concluded the site was broken.
 *
 * Mounted once in the studio layout so every tab gets it; the Studio home is
 * skipped because SetupChecklist/ReviewStatusBanner already own that
 * messaging there.
 */
export function NotLiveNotice() {
  const pathname = usePathname();
  const { artist } = useOwnArtistProfile();
  if (pathname === '/studio') return null;
  if (!artist || artist.application_status === 'approved') return null;

  const pending = artist.application_status === 'pending';
  const rejected = artist.application_status === 'rejected';

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6">
      <div
        className={`rounded-xl p-4 ${
          pending ? 'border border-line bg-sand/40' : 'border border-terra/30 bg-terraSoft/60'
        }`}
      >
        <p className="text-sm font-medium text-ink">Only you can see your work right now</p>
        <p className="mt-1 text-sm text-muted">
          {pending
            ? 'Your shop is in review — everything here goes public the moment it’s approved.'
            : rejected
              ? 'Your application needs changes before your shop can go live — see the feedback in your Studio.'
              : 'Your shop hasn’t been submitted for review yet — buyers can’t find your profile or listings until it’s approved.'}
        </p>
        {!pending && (
          <Link href="/studio" className="mt-2 inline-block text-sm font-medium text-terraText hover:underline">
            {rejected ? 'See the feedback →' : 'Finish setup & submit for review →'}
          </Link>
        )}
      </div>
    </div>
  );
}
