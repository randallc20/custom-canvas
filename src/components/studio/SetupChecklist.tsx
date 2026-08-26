'use client';

import { useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import type { OwnArtistProfile } from '@/hooks/useArtistProfileId';
import type { ListingWithImages } from '@/types/listing';

/**
 * The draft artist's self-serve path to going live: every setup step as a
 * checkable row with a deep link, a progress bar, and — once the essentials
 * are done — the "Submit for review" button. Replaces the plain draft banner;
 * disappears once the shop is submitted/approved (ReviewStatusBanner takes
 * over for pending/rejected).
 */
export function SetupChecklist({
  artist,
  listings,
}: {
  artist: OwnArtistProfile;
  listings: ListingWithImages[] | undefined;
}) {
  const isResubmit = artist.application_status === 'rejected';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  // Avatar lives on profiles; one small read.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (mounted) {
            setAvatarUrl(data?.avatar_url ?? null);
            setAvatarLoaded(true);
          }
        }, () => { if (mounted) setAvatarLoaded(true); });
    });
    return () => { mounted = false; };
  }, []);

  const listingCount = listings?.length ?? 0;
  const bestPhotoCount = (listings ?? []).reduce(
    (max, l) => Math.max(max, l.images?.length ?? 0),
    0
  );

  const items: { label: string; done: boolean; href: string; hint?: string }[] = [
    {
      label: 'Add a profile photo',
      done: !!avatarUrl,
      href: '/studio/page',
      hint: 'Buyers connect with faces — yours, or you at work.',
    },
    {
      label: 'Tell your story (100+ characters)',
      done: (artist.story?.trim().length ?? 0) >= 100,
      href: '/studio/page',
      hint: 'Where you make, what drives the work.',
    },
    {
      label: 'Pick your mediums',
      done: (artist.primary_mediums?.length ?? 0) > 0,
      href: '/studio/page',
    },
    {
      label: 'Set your neighborhood',
      done: !!artist.neighborhood?.trim(),
      href: '/studio/page',
      hint: 'Local is the whole point — buyers browse by community.',
    },
    {
      label: 'Choose shipping or pickup',
      done: !!artist.fulfillment_pref,
      href: '/studio/page',
    },
    {
      label: 'Add a banner image',
      done: !!artist.banner_image_url,
      href: '/studio/page',
    },
    {
      label: 'Create your first listing — aim for 3+ photos',
      done: listingCount > 0 && bestPhotoCount >= 3,
      href: '/listings/new',
      hint: listingCount > 0 && bestPhotoCount < 3
        ? `Your best listing has ${bestPhotoCount} photo${bestPhotoCount === 1 ? '' : 's'} — add more angles and a detail shot.`
        : 'Great photos sell art. Natural light, straight-on, fill the frame.',
    },
    {
      label: 'Connect Stripe so you can get paid',
      done: artist.stripe_onboarded,
      href: '/studio/sales',
      hint: 'Takes a few minutes; approval can happen while Stripe verifies you.',
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);

  // Essentials to submit: photo, story, at least one listing. Stripe/banner
  // etc. can finish during review.
  const essentialsDone =
    !!avatarUrl && (artist.story?.trim().length ?? 0) >= 100 && listingCount > 0;

  const submit = async () => {
    setSubmitting(true);
    const res = await fetch('/api/artist/submit', { method: 'POST' });
    if (res.ok) {
      toast('Submitted — we\'ll review your shop soon', 'success');
      queryClient.invalidateQueries({ queryKey: ['own-artist-profile'] });
    } else {
      const { error } = await res.json().catch(() => ({ error: null }));
      // 409 = already submitted (double click / second tab) — not an error event.
      if (res.status !== 409) {
        captureException(new Error(`${error ?? 'submit failed'} (HTTP ${res.status})`), { where: 'SetupChecklist.submit' });
      }
      toast(error ?? 'Could not submit — please try again', 'error');
      if (res.status === 409) queryClient.invalidateQueries({ queryKey: ['own-artist-profile'] });
    }
    setSubmitting(false);
  };

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{isResubmit ? 'Address the feedback, then resubmit for review' : 'Build your shop, then submit it for review'}</p>
        <span className="text-xs font-medium text-muted">{doneCount}/{items.length}</span>
      </div>
      <p className="mb-3 text-sm text-muted">
        Nothing is public yet — work through the list, then submit. Once we approve, everything goes
        live at once.
      </p>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-terra transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-sand/50"
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                  item.done
                    ? 'border-terra bg-terra text-white'
                    : 'border-line bg-surface text-transparent'
                }`}
              >
                ✓
              </span>
              <span>
                <span className={`text-sm ${item.done ? 'text-muted line-through' : 'font-medium text-ink group-hover:text-terraDark'}`}>
                  {item.label}
                </span>
                {!item.done && item.hint && (
                  <span className="block text-xs text-muted">{item.hint}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <Button
          size="sm"
          loading={submitting}
          disabled={!avatarLoaded || !essentialsDone}
          onClick={submit}
        >
          {isResubmit ? 'Resubmit for review' : 'Submit for review'}
        </Button>
        {!essentialsDone && (
          <span className="text-xs text-muted">
            To submit: profile photo, your story, and at least one listing.
          </span>
        )}
      </div>
    </div>
  );
}
