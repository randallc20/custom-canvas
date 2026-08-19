'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/**
 * Studio banner for the artist's review lifecycle:
 *  draft    → build freely (hidden) + "Submit for review"
 *  pending  → in the admin queue, everything still hidden
 *  rejected → the admin's reason (fetched server-side — it isn't client-
 *             readable) + fix & resubmit
 *  approved → renders nothing; the shop is live.
 * Submitting invalidates the own-artist-profile query so every Studio
 * surface picks up the new status without a reload.
 */
export function ReviewStatusBanner({
  status,
}: {
  status: 'draft' | 'pending' | 'approved' | 'rejected';
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  // The rejection reason lives behind /api/artist/application (00033 column
  // privacy) — only fetch it when there's something to show.
  useEffect(() => {
    if (status !== 'rejected') return;
    fetch('/api/artist/application')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setReason(data?.rejection_reason ?? null))
      .catch(() => {});
  }, [status]);

  if (status === 'approved') return null;

  const submit = async () => {
    setSubmitting(true);
    const res = await fetch('/api/artist/submit', { method: 'POST' });
    if (res.ok) {
      toast('Submitted — we\'ll review your shop soon', 'success');
      queryClient.invalidateQueries({ queryKey: ['own-artist-profile'] });
    } else {
      const { error } = await res.json().catch(() => ({ error: null }));
      toast(error ?? 'Could not submit — please try again', 'error');
      if (res.status === 409) queryClient.invalidateQueries({ queryKey: ['own-artist-profile'] });
    }
    setSubmitting(false);
  };

  if (status === 'draft') {
    return (
      <div className="mb-6 rounded-xl border border-line bg-sand/40 p-4">
        <p className="text-sm font-medium text-ink">Build your shop, then submit it for review</p>
        <p className="mt-1 text-sm text-muted">
          Add your profile details and listings — nothing is public yet. When you&apos;re ready, submit and
          we&apos;ll review your shop. Once approved, everything goes live at once.
        </p>
        <div className="mt-3">
          <Button size="sm" loading={submitting} onClick={submit}>Submit for review</Button>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="mb-6 rounded-xl border border-line bg-sand/40 p-4">
        <p className="text-sm font-medium text-ink">Your shop is in review</p>
        <p className="mt-1 text-sm text-muted">
          We&apos;re taking a look. You can keep adding work in the meantime — nothing is public until
          we approve your shop, then it all goes live at once.
        </p>
      </div>
    );
  }

  // rejected
  return (
    <div className="mb-6 rounded-xl border border-terra/30 bg-terraSoft/60 p-4">
      <p className="text-sm font-medium text-ink">Your application needs a few changes</p>
      {reason && <p className="mt-1 text-sm text-ink">{reason}</p>}
      <p className="mt-1 text-sm text-muted">
        Update your profile or listings to address this, then resubmit for another review.
      </p>
      <div className="mt-3">
        <Button size="sm" loading={submitting} onClick={submit}>Resubmit for review</Button>
      </div>
    </div>
  );
}
