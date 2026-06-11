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
  | 'review_received'
  | 'listing_reported'
  | 'payout_sent';

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
