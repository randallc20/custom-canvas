'use client';

import { Button } from '@/components/ui/Button';

interface QueryErrorProps {
  /** What failed, in the user's words — "We couldn't load your orders." */
  message?: string;
  /** Usually React Query's `refetch`; the button is omitted without it. */
  onRetry?: () => void;
  /** Usually `isFetching`, so the button spins while the retry is in flight. */
  retrying?: boolean;
}

/** The failed-fetch state. Every list surface used to fall through to its
 *  empty copy when the query errored — "No sales yet" over a paid order the
 *  artist could not see. Errors must look like errors and offer a way back. */
export function QueryError({ message = "Something went wrong loading this.", onRetry, retrying = false }: QueryErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center"
    >
      <div>
        <p className="text-sm font-medium text-red-700">{message}</p>
        <p className="mt-1 text-xs text-red-700/80">Check your connection and try again.</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} loading={retrying}>
          Retry
        </Button>
      )}
    </div>
  );
}
