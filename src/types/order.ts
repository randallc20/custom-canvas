export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'refunded' | 'disputed';

export interface ShippingAddress {
  /** Recipient name from Stripe's shipping details (utils/orderRecord.ts);
   *  the app's own form never collected one, so it may be absent. */
  name?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Order {
  refund_approved_at?: string | null;
  /** Joined on the buyer orders view for the refund-request chat handoff. */
  artist?: { profile_id: string; display_name: string } | null;
  listing?: { title: string } | null;
  id: string;
  listing_id: string | null;
  commission_id: string | null;
  /** NULL once the buyer's account is deleted (00049): the order outlives them. */
  buyer_id: string | null;
  /** artist_profiles id; NULL once the artist's account is deleted (00049). */
  artist_id: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  artist_payout_cents: number;
  stripe_payment_intent_id: string | null;
  status: OrderStatus;
  shipping_address: ShippingAddress | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  signature_required: boolean;
  signature_confirmed: boolean;
  protection_status: 'pending' | 'protected' | 'ineligible' | 'waived';
  dispute_id: string | null;
  dispute_outcome: 'won' | 'lost' | 'accepted' | null;
  /** Status the order held when a chargeback froze it (00050); the closed
   *  handler restores to it. Null outside an open dispute. */
  pre_dispute_status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'refunded' | null;
  /** Once-only stamp for the buyer's shipped email (00050). */
  shipped_email_sent_at: string | null;
  delivered_at: string | null;
  is_pickup: boolean;
  pickup_confirmed_by_buyer_at: string | null;
  pickup_confirmed_by_artist_at: string | null;
  evidence_photo_count: number;
  evidence_has_condition_notes: boolean;
  fulfillment_window_days: number;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  /** NULL once the reviewer's account is deleted (00049). */
  reviewer_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}
