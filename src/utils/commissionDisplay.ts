import type { CommissionStatus } from '@/types/commission';

export interface CommissionDisplay {
  label: string;
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
  /** Reason sub-label for closed states. */
  sub?: string;
}

// The DB state machine keeps all nine statuses (they gate transitions and
// protections); users see five. Display-only mapping — no schema change.
// For 'cancelled', closed_by (00048) distinguishes an artist decline from a
// requester cancel; rows closed before 00048 have neither and stay "Closed".
// 'admin' (00053) is a dispute an admin resolved, either way.
export function commissionDisplayStatus(
  status: CommissionStatus,
  opts?: { closedBy?: 'artist' | 'requester' | 'admin' | null; viewerIsRequester?: boolean }
): CommissionDisplay {
  switch (status) {
    case 'pending':
      return { label: 'New request', variant: 'warning' };
    case 'quoted':
      return { label: 'Quoted', variant: 'info' };
    case 'accepted':
    case 'in_progress':
      return { label: 'In progress', variant: 'info' };
    case 'completed':
    case 'delivered':
      return { label: 'Delivered', variant: 'success' };
    case 'confirmed':
      if (opts?.closedBy === 'admin') return { label: 'Closed', variant: 'success', sub: 'dispute resolved' };
      return { label: 'Closed', variant: 'success', sub: 'completed' };
    case 'cancelled':
      if (opts?.closedBy === 'artist') return { label: 'Declined by artist', variant: 'default' };
      if (opts?.closedBy === 'admin') return { label: 'Closed', variant: 'default', sub: 'dispute resolved' };
      if (opts?.closedBy === 'requester') {
        return {
          label: opts.viewerIsRequester ? 'Cancelled by you' : 'Cancelled by requester',
          variant: 'default',
        };
      }
      return { label: 'Closed', variant: 'default' };
    case 'disputed':
      return { label: 'Disputed', variant: 'danger' };
  }
}
