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
  closed_by: 'artist' | 'requester' | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
}
