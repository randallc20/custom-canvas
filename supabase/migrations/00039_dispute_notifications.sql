-- 00039_dispute_notifications.sql
-- Card chargebacks are handled in the webhook as of this change, and the
-- artist/admin notifications it sends need a type the CHECK constraint allows.
-- (Distinct from 'commission_disputed', which is the commission workflow.)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'new_message', 'new_follower', 'new_order', 'commission_request',
  'commission_accepted', 'commission_declined', 'commission_completed',
  'commission_confirmed', 'commission_disputed', 'commission_update',
  'review_received', 'listing_reported', 'payout_sent',
  'new_listing', 'price_drop', 'houston_verified', 'refund_approved',
  'artist_application', 'artist_approved', 'artist_rejected',
  'order_disputed'
]));
