export type AnalyticsEventType =
  | 'profile_view'
  | 'listing_view'
  | 'listing_save'
  | 'listing_share'
  | 'follow';

export interface AnalyticsEvent {
  id: string;
  artist_id: string;
  event_type: AnalyticsEventType;
  listing_id: string | null;
  viewer_id: string | null;
  created_at: string;
}

export interface ArtistAnalytics {
  total_views: number;
  total_saves: number;
  total_followers: number;
  total_earnings_cents: number;
  total_orders: number;
  views_over_time: { date: string; count: number }[];
  earnings_over_time: { date: string; amount_cents: number }[];
}
