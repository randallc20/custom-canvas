import { useToast } from '@/components/ui/Toast';

// Shared onError for mutation hooks whose call sites fire-and-forget with
// .mutate() — without this, a failed write (RLS zero-row, 429, network) is
// invisible to the user. See docs/CONVENTIONS.md: writes must assert rows.
export function toastError(toast: ReturnType<typeof useToast>['toast']) {
  return (err: unknown) =>
    toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
}
