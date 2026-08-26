import { useToast } from '@/components/ui/Toast';
import { captureException } from '@/lib/sentry';

// Shared onError for mutation hooks whose call sites fire-and-forget with
// .mutate() — without this, a failed write (RLS zero-row, 429, network) is
// invisible to the user. See docs/CONVENTIONS.md: writes must assert rows.
// Every surfaced failure also reaches Sentry, tagged with where it happened —
// visible failures should not need a tester to reach us.
export function toastError(toast: ReturnType<typeof useToast>['toast'], where: string) {
  return (err: unknown) => {
    captureException(err, { where });
    toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
  };
}
