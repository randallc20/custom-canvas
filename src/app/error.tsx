'use client';

import { Button } from '@/components/ui/Button';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold text-line">Oops</h1>
      <h2 className="mt-4 text-xl font-semibold text-ink">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        An unexpected error occurred. Please try again.
      </p>
      <div className="mt-6">
        <Button onClick={reset}>Try Again</Button>
      </div>
    </div>
  );
}
