'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-cream font-sans text-ink">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
          <p className="mb-4 text-sm text-muted">We&apos;ve been notified and are looking into it.</p>
          <button
            onClick={reset}
            className="rounded-full bg-terra px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-terraDark"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
