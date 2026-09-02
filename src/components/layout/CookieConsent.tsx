'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('cc_cookie_consent')) setShow(true);
  }, []);

  if (!show) return null;

  const accept = () => {
    localStorage.setItem('cc_cookie_consent', '1');
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-3 text-sm sm:flex-row">
        <p className="flex-1 text-muted">
          We use cookies to improve your experience.{' '}
          <Link href="/privacy" className="text-terraText hover:underline">Learn more</Link>.
        </p>
        <button onClick={accept} className="press rounded-full bg-terraText px-5 py-2 text-sm font-medium text-white hover:bg-terraTextDark">
          Accept
        </button>
      </div>
    </div>
  );
}
