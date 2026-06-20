export interface CommissionUpdate {
  id: string;
  commission_id: string;
  artist_id: string;
  note: string;
  photo_url: string | null;
  progress_percent: number | null;
  created_at: string;
}
