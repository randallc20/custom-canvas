export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'refunded' | 'disputed';

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Order {
  id: string;
  listing_id: string | null;
  commission_id: string | null;
  buyer_id: string;
  artist_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  artist_payout_cents: number;
  stripe_payment_intent_id: string | null;
  status: OrderStatus;
  shipping_address: ShippingAddress | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}
