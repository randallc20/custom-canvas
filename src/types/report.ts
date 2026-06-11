export type ReportReason =
  | 'inappropriate'
  | 'copyright'
  | 'misleading'
  | 'spam'
  | 'other';

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken';

export interface Report {
  id: string;
  reporter_id: string;
  listing_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  admin_notes: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}
