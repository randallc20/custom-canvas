'use client';

import { useEffect, useState } from 'react';

/**
 * Studio banner for the artist's review lifecycle. The SetupChecklist owns
 * the build steps and the submit/resubmit button (draft + rejected states);
 * this banner communicates status:
 *  draft    → nothing (checklist covers it)
 *  pending  → in the admin queue, everything still hidden
 *  rejected → the admin's reason (fetched server-side — it isn't client-
 *             readable); the checklist below carries the fix links + button
 *  approved → nothing; the shop is live.
 */
export function ReviewStatusBanner({
  status,
}: {
  status: 'draft' | 'pending' | 'approved' | 'rejected';
}) {
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

  if (status === 'approved' || status === 'draft') return null;

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

  // rejected — the reason lives here; the checklist below carries the
  // deep links and the Resubmit button.
  return (
    <div className="mb-6 rounded-xl border border-terra/30 bg-terraSoft/60 p-4">
      <p className="text-sm font-medium text-ink">Your application needs a few changes</p>
      {reason && <p className="mt-1 text-sm text-ink">{reason}</p>}
      <p className="mt-1 text-sm text-muted">
        Work through the checklist below to address this, then resubmit for another review.
      </p>
    </div>
  );
}
