'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function PreviewBanner() {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  if (searchParams.get('preview') !== '1' || dismissed) return null;

  return (
    <div className="sticky top-16 z-30 flex items-center justify-between gap-4 bg-ink px-4 py-2 text-sm text-cream">
      <span>This is how buyers see your profile.</span>
      <button
        onClick={() => setDismissed(true)}
        className="rounded-full px-2 py-0.5 text-cream/80 transition-colors hover:text-cream"
        aria-label="Dismiss preview banner"
      >
        Dismiss
      </button>
    </div>
  );
}
