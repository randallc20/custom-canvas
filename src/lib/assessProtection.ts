import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import {
  pickupHandoffConfirmed,
  evaluateProtection,
  ProtectionInput,
  REPLY_WINDOW_BUSINESS_DAYS,
} from '@/utils/evaluateProtection';
import { artistRepliedInTime } from '@/utils/artistRepliedInTime';

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

// Seller-protection assessment against the live row.
//
// Extracted from the Stripe webhook (L5) because it now has a second caller:
// when an admin records signature confirmation on an order that is already
// disputed, the frozen verdict has to be recomputed, or requirement 4 could
// never be satisfied in practice. The dispute-created handler assesses the
// instant the webhook lands — long before any human could open the carrier's
// tracking page — so without a re-assessment path, recording the signature
// afterwards would change nothing and the runbook step would be theatre.
//
// Reads the order fresh every time. That is what makes a late recording
// count, and it is why the closed handler's late-assessment path is correct.

// Requirement 6 needs the message history. Conversations are keyed by the
// participant pair, not by order or listing (findOrCreateConversation matches
// on participants only, and the pickup branch below reuses any thread between
// the two), so the buyer<->artist thread is found the same way here. Only
// messages written after the order exists count; the rule itself lives in
// utils/artistRepliedInTime so the money tests can pin it. Read failures
// degrade to "replied" — the lenient direction.
export async function artistRepliedInTimeForOrder(
  supabase: AdminClient,
  order: { buyer_id: string | null; artist_id: string | null; created_at: string }
): Promise<boolean> {
  // Either party may be NULL once their account is deleted (00049): their
  // thread cascaded away with them, so there is nothing to judge.
  if (!order.buyer_id || !order.artist_id) return true;
  const { data: artist } = await supabase
    .from('artist_profiles').select('profile_id').eq('id', order.artist_id).maybeSingle();
  const artistUserId = artist?.profile_id as string | undefined;
  if (!artistUserId) return true;

  const { data: convos } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(participant_one.eq.${order.buyer_id},participant_two.eq.${artistUserId}),and(participant_one.eq.${artistUserId},participant_two.eq.${order.buyer_id})`);
  const convoIds = (convos ?? []).map((c) => c.id as string);
  if (!convoIds.length) return true;

  const { data: msgs } = await supabase
    .from('messages')
    .select('sender_id, created_at')
    .in('conversation_id', convoIds)
    .gt('created_at', order.created_at)
    // Platform notes are attributed to one of the two people (a `system`
    // message nobody can be traced to reads worse than one that can), so
    // without this filter Custom Canvas's own "return authorised" or
    // "shipping window missed" note counted as a BUYER message the artist had
    // failed to answer — and requirement 6 then stripped their protection for
    // our messages, not the buyer's (r7 money pass, P1).
    .neq('message_type', 'system')
    .order('created_at', { ascending: true });

  return artistRepliedInTime((msgs ?? []) as { sender_id: string; created_at: string }[], {
    buyerId: order.buyer_id,
    artistUserId,
    orderCreatedAt: order.created_at,
    windowBusinessDays: REPLY_WINDOW_BUSINESS_DAYS,
  });
}

export async function assessProtection(supabase: AdminClient, orderId: string) {
  const { data: o } = await supabase
    .from('orders')
    .select('id, listing_id, buyer_id, artist_id, created_at, shipped_at, delivered_at, tracking_number, carrier, signature_required, signature_confirmed, evidence_photo_count, evidence_has_condition_notes, fulfillment_window_days, is_pickup, pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at')
    .eq('id', orderId)
    .single();
  if (!o) return null;

  // Persisted at checkout (00041) — never inferred from a missing address,
  // which would route shipped orders down the easier pickup branch.
  const isPickup = !!o.is_pickup;

  const input: ProtectionInput = {
    isPickup,
    pickupHandoffConfirmed: pickupHandoffConfirmed(o as Parameters<typeof pickupHandoffConfirmed>[0]),
    createdAt: o.created_at as string,
    shippedAt: o.shipped_at as string | null,
    deliveredAt: o.delivered_at as string | null,
    trackingNumber: o.tracking_number as string | null,
    carrier: o.carrier as string | null,
    signatureRequired: !!o.signature_required,
    signatureConfirmed: !!o.signature_confirmed,
    evidencePhotoCount: (o.evidence_photo_count as number) ?? 0,
    evidenceHasConditionNotes: !!o.evidence_has_condition_notes,
    fulfillmentWindowDays: (o.fulfillment_window_days as number) ?? 5,
    artistRepliedWithinWindow: await artistRepliedInTimeForOrder(supabase, {
      buyer_id: o.buyer_id as string | null,
      artist_id: o.artist_id as string | null,
      created_at: o.created_at as string,
    }),
  };
  return evaluateProtection(input);
}
