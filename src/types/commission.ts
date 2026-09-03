export type CommissionStatus =
  | 'pending'
  | 'quoted'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'delivered'
  | 'confirmed'
  | 'disputed'
  | 'cancelled';

export interface Commission {
  id: string;
  artist_id: string;
  /** NULL once the requester's account is deleted (00049). */
  requester_id: string | null;
  conversation_id: string | null;
  title: string;
  description: string;
  budget_min_cents: number;
  budget_max_cents: number;
  status: CommissionStatus;
  quoted_price_cents: number | null;
  estimated_completion: string | null;
  artist_notes: string | null;
  /** The requester's account of what went wrong (00053). Was written over
   *  artist_notes until R10. */
  dispute_reason: string | null;
  /** The status a dispute froze, so withdrawing restores it (00053). */
  pre_dispute_status: 'in_progress' | 'delivered' | null;
  closed_by: 'artist' | 'requester' | 'admin' | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
}
