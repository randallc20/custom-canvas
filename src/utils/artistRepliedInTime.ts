// Seller-protection requirement 6 (docs/SELLER_PROTECTION_SPEC.md): the
// artist replied to buyer messages within REPLY_WINDOW_BUSINESS_DAYS.
//
// Pure over an already-fetched message list so the money tests can pin the
// rule. The caller (the Stripe webhook at dispute time) finds the buyer<->
// artist thread(s) by the two participants — conversations are keyed by
// participant pair, not by order — and hands every message in them here.
//
// Two rules the previous in-webhook version got wrong (05-P1):
//   * the window is the reply window (3 business days), not the order's
//     fulfilment window (5);
//   * only messages written AFTER the order exists count. Pre-sale chatter
//     in a shared thread is not a question about this order.
// No buyer messages at all means there was nothing to answer — that must not
// fail the artist.

import { businessDaysBetween } from './evaluateProtection';

export interface ReplyWindowMessage {
  sender_id: string;
  created_at: string;
}

export interface ReplyWindowOptions {
  buyerId: string;
  /** The artist's profiles.id (message sender id), not artist_profiles.id. */
  artistUserId: string;
  /** orders.created_at — messages at or before this instant are ignored. */
  orderCreatedAt: string;
  windowBusinessDays: number;
  /** Injected for determinism in tests; defaults to the wall clock. */
  now?: string;
}

export function artistRepliedInTime(
  messages: ReplyWindowMessage[],
  opts: ReplyWindowOptions
): boolean {
  const orderCreated = new Date(opts.orderCreatedAt).getTime();
  const relevant = messages
    .filter((m) => new Date(m.created_at).getTime() > orderCreated)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let awaitingSince: string | null = null;
  for (const m of relevant) {
    if (m.sender_id === opts.buyerId) {
      // Several buyer messages in a row are one wait, measured from the first.
      if (!awaitingSince) awaitingSince = m.created_at;
    } else if (m.sender_id === opts.artistUserId && awaitingSince) {
      if (businessDaysBetween(awaitingSince, m.created_at) > opts.windowBusinessDays) return false;
      awaitingSince = null;
    }
  }

  // Still awaiting a reply right now: only a failure once the window is past.
  if (awaitingSince) {
    return businessDaysBetween(awaitingSince, opts.now ?? new Date().toISOString()) <= opts.windowBusinessDays;
  }
  return true;
}
