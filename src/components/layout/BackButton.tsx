'use client';

import { useRouter, usePathname } from 'next/navigation';

/**
 * Global "back" control shown on every page except the home feed. Uses browser
 * history when possible, falling back to the home page on a fresh/direct load.
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === '/') return null;

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <button
        onClick={goBack}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-muted transition-colors hover:text-ink"
        aria-label="Go back"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
    </div>
  );
}
