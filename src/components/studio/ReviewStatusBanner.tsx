'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/**
 * Shown at the top of the Studio while an artist isn't yet live. Pending →
 * a calm "we're reviewing you" note; rejected → the admin's reason plus a
 * resubmit action. Approved artists see nothing (they're live).
 */
export function ReviewStatusBanner({
  status,
  reason,
}: {
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);

  if (status === 'approved') return null;

  if (status === 'pending' || resubmitted) {
    return (
      <div className="mb-6 rounded-xl border border-line bg-sand/40 p-4">
        <p className="text-sm font-medium text-ink">Your shop is awaiting review</p>
        <p className="mt-1 text-sm text-muted">
          Keep building — add your profile details and listings now. As soon as we approve you, everything
          goes live to buyers at once. Nothing here is public yet.
        </p>
      </div>
    );
  }

  // rejected
  const resubmit = async () => {
    setSubmitting(true);
    const res = await fetch('/api/artist/resubmit', { method: 'POST' });
    if (res.ok) {
      setResubmitted(true);
      toast('Resubmitted for review', 'success');
    } else {
      toast('Could not resubmit — please try again', 'error');
    }
    setSubmitting(false);
  };

  return (
    <div className="mb-6 rounded-xl border border-terra/30 bg-terraSoft/60 p-4">
      <p className="text-sm font-medium text-ink">Your application needs a few changes</p>
      {reason && <p className="mt-1 text-sm text-ink">{reason}</p>}
      <p className="mt-1 text-sm text-muted">
        Update your profile or listings to address this, then resubmit for another review.
      </p>
      <div className="mt-3">
        <Button size="sm" loading={submitting} onClick={resubmit}>Resubmit for review</Button>
      </div>
    </div>
  );
}
