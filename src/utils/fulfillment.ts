// All shipping semantics branch through here so a new fulfillment
// preference only needs handling in one place.
export function isPickupOnly(pref: string | null | undefined): boolean {
  return pref === 'pickup_only';
}

/**
 * Did the buyer take possession of the piece?
 *
 * The question every return and every cancellation actually turns on, and
 * `shipped_at` is the wrong proxy for it: a LOCAL PICKUP order never has a
 * `shipped_at`, not even after the buyer has walked out of the studio with
 * the painting (confirm-pickup promotes it straight to `delivered` under the
 * service role, so the guard's shipped_at stamp never fires).
 *
 * Using `shipped_at` alone meant a change-of-mind refund on a collected
 * pickup piece required no return at all — the buyer kept the artwork and the
 * money, which is precisely what Terms of Sale §5 ("you may not keep both")
 * and rulings D9/D13 exist to prevent. Found by the r6 money pass.
 */
export function buyerTookPossession(order: {
  shipped_at?: string | null;
  is_pickup?: boolean | null;
  status?: string;
  pickup_confirmed_by_buyer_at?: string | null;
  pickup_confirmed_by_artist_at?: string | null;
}): boolean {
  if (order.shipped_at) return true;
  if (!order.is_pickup) return false;
  // A pickup handoff is two-sided; either the pair of confirmations or the
  // `delivered` status they produce means the piece has changed hands.
  return (
    order.status === 'delivered' ||
    (!!order.pickup_confirmed_by_buyer_at && !!order.pickup_confirmed_by_artist_at)
  );
}
