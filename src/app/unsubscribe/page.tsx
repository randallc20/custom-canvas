'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function UnsubscribeInner() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');

  useEffect(() => {
    if (!token) { setState('error'); return; }
    fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST' })
      .then((r) => setState(r.ok ? 'done' : 'error'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {state === 'working' && <p className="text-muted">Updating your preferences…</p>}
      {state === 'done' && (
        <>
          <h1 className="font-display text-2xl font-bold text-ink">You&apos;re unsubscribed</h1>
          <p className="mt-2 text-muted">You won&apos;t receive non-essential emails from Custom Canvas. You can re-enable categories anytime in your account.</p>
          <Link href="/account" className="mt-6 inline-block rounded-full bg-terra px-5 py-2.5 text-sm font-medium text-white hover:bg-terraDark">Email preferences</Link>
        </>
      )}
      {state === 'error' && <p className="text-muted">This unsubscribe link is invalid or expired.</p>}
    </div>
  );
}

export default function UnsubscribePage() {
  return <Suspense><UnsubscribeInner /></Suspense>;
}
