'use client';

import { useRouter, usePathname } from 'next/navigation';

// The Back control must sit flush with each page's content column, not float
// at the viewport edge. Longest-prefix match; keep in sync when a page's
// container width changes. Default is max-w-7xl (feed-width pages).
const ROUTE_WIDTHS: Array<[prefix: string, width: string]> = [
  ['/studio/page', 'max-w-2xl'],
  ['/studio', 'max-w-5xl'],
  ['/messages', 'max-w-6xl'],
  ['/admin/verifications', 'max-w-4xl'],
  ['/admin/featured', 'max-w-4xl'],
  ['/admin/disputes', 'max-w-5xl'],
  ['/admin/users', 'max-w-5xl'],
  ['/admin/galleries', 'max-w-5xl'],
  ['/admin', 'max-w-6xl'],
  ['/dashboard', 'max-w-4xl'],
  ['/orders', 'max-w-5xl'],
  ['/following', 'max-w-3xl'],
  ['/notifications', 'max-w-3xl'],
  ['/about', 'max-w-3xl'],
  ['/terms', 'max-w-3xl'],
  ['/privacy', 'max-w-3xl'],
  ['/listings', 'max-w-2xl'],
  ['/checkout', 'max-w-2xl'],
  ['/profile/edit', 'max-w-2xl'],
  ['/account', 'max-w-lg'],
  ['/commission-request', 'max-w-lg'],
  ['/unsubscribe', 'max-w-md'],
  ['/login', 'max-w-lg'],
  ['/register', 'max-w-lg'],
  ['/forgot-password', 'max-w-lg'],
  ['/reset-password', 'max-w-lg'],
];

/**
 * Global "back" control shown on every page except the home feed and the
 * onboarding wizards (those have their own step-back, and a second Back
 * that exits the wizard reads as the same control). Uses browser history
 * when possible, falling back to the home page on a fresh/direct load.
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === '/' || pathname.startsWith('/onboarding')) return null;

  const width = ROUTE_WIDTHS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'max-w-7xl';

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    // w-full matters: PageShell is a flex column, and a flex child with
    // mx-auto shrink-wraps (centering the button) instead of stretching.
    <div className={`mx-auto w-full ${width} px-4 pt-4`}>
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
