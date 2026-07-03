import type { CommissionStatus } from '@/types/commission';

export interface CommissionDisplay {
  label: string;
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
  /** Reason sub-label for closed states. */
  sub?: string;
}

// The DB state machine keeps all nine statuses (they gate transitions and
// protections); users see five. Display-only mapping — no schema change.
export function commissionDisplayStatus(status: CommissionStatus): CommissionDisplay {
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
      return { label: 'Closed', variant: 'success', sub: 'completed' };
    case 'cancelled':
      return { label: 'Closed', variant: 'default' };
    case 'disputed':
      return { label: 'Disputed', variant: 'danger' };
  }
}
