// Mirrors the DB check constraint (00017, extended since) — keep in lockstep,
// and give every member an entry in both TYPE_ICONS maps.
export type NotificationType =
  | 'new_message'
  | 'new_follower'
  | 'new_order'
  | 'commission_request'
  | 'commission_accepted'
  | 'commission_declined'
  | 'commission_completed'
  | 'commission_confirmed'
  | 'commission_disputed'
  | 'commission_update'
  | 'review_received'
  | 'listing_reported'
  | 'payout_sent'
  | 'new_listing'
  | 'price_drop'
  | 'houston_verified'
  | 'refund_approved'
  | 'artist_application'
  | 'artist_approved'
  | 'artist_rejected'
  | 'order_disputed';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
