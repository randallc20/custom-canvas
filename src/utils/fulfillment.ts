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
  // EITHER confirmation, not both.
  //
  // Requiring both made possession depend on a voluntary button the refunding
  // BUYER controls: collect the piece, never tap Confirm, ask for a
  // change-of-mind refund, and the artist's modal told them "the buyer never
  // received this piece" over the top of their own confirmation — no return,
  // refund settled, painting relisted while it hung on the buyer's wall (r7
  // money pass, P0). The artist's confirmation alone is the studio saying the
  // work left it, which is the fact that matters here.
  return (
    order.status === 'delivered' ||
    !!order.pickup_confirmed_by_artist_at ||
    !!order.pickup_confirmed_by_buyer_at
  );
}

/**
 * A pickup order nobody has confirmed at all: possession is genuinely unknown,
 * and only the artist can say. The refund modal asks them, defaulting to "yes,
 * they collected it" — the safe direction, because the cost of being wrong is
 * a return the artist can waive, not a piece and a refund both gone.
 */
export function pickupPossessionUnknown(order: {
  shipped_at?: string | null;
  is_pickup?: boolean | null;
  status?: string;
  pickup_confirmed_by_buyer_at?: string | null;
  pickup_confirmed_by_artist_at?: string | null;
}): boolean {
  return (
    !order.shipped_at &&
    !!order.is_pickup &&
    order.status !== 'delivered' &&
    !order.pickup_confirmed_by_artist_at &&
    !order.pickup_confirmed_by_buyer_at
  );
}

/**
 * Are we CONFIDENT the piece is still with the artist?
 *
 * The relist question, and deliberately not the negation of
 * `buyerTookPossession`. Three states, not two:
 *
 *   buyer has it        -> no relist, and a return is required
 *   artist still has it -> relist
 *   nobody knows        -> a pickup order neither party confirmed. The return
 *                          gate treats this as "might have it" and asks for
 *                          the piece back; the relist must treat it the same
 *                          way, or the two halves of the same fix disagree
 *                          and the painting goes back on sale while the buyer
 *                          holds it (r7 auth pass, P0).
 *
 * Relist only on the middle one.
 */
export function pieceIsWithArtist(order: {
  shipped_at?: string | null;
  is_pickup?: boolean | null;
  status?: string;
  pickup_confirmed_by_buyer_at?: string | null;
  pickup_confirmed_by_artist_at?: string | null;
}): boolean {
  return !buyerTookPossession(order) && !pickupPossessionUnknown(order);
}
