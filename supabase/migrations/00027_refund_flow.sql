-- Build 3.1: artist-mediated refunds. Buyers request a refund from the
-- artist in chat; when the artist agrees they flag the order, admins get
-- notified and settle the payment (buyer gets price + shipping back, the
-- service fee is never refunded, the artist returns their payout, the
-- platform returns its commission).
ALTER TABLE orders ADD COLUMN refund_approved_at TIMESTAMPTZ;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'new_message', 'new_follower', 'new_order', 'commission_request',
  'commission_accepted', 'commission_declined', 'commission_completed',
  'commission_confirmed', 'commission_disputed', 'commission_update',
  'review_received', 'listing_reported', 'payout_sent',
  'new_listing', 'price_drop', 'houston_verified', 'refund_approved'
]));
