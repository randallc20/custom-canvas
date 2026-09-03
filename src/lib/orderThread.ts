import * as Sentry from '@sentry/nextjs';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Post a system note into the buyer↔artist thread for an order (L7).
 *
 * Conversations are keyed by the participant PAIR, not by order or listing —
 * findOrCreateConversation matches on participants only — so the thread is
 * found the same way everywhere, and the same way seller-protection
 * requirement 6 reads it when judging whether the artist replied in time.
 * Extracted from the Stripe webhook's pickup branch, which was the only
 * caller until the fulfilment-window paths needed the same thing three more
 * times.
 *
 * The message is attributed to `senderId`. For a platform notice that is the
 * artist's own user id when the message is the artist speaking (a proposed
 * date), and the buyer's when it is theirs — a `system` message the recipient
 * cannot attribute to anyone is worse than one attributed to the party whose
 * action produced it.
 *
 * Best-effort by design: every caller has already moved the thing that
 * matters (a date, a refund) before calling, and a failed message must not
 * roll that back. But never silent — a dropped note means a buyer was never
 * told, so it goes to Sentry.
 */
export async function postOrderSystemMessage(
  admin: AdminClient,
  opts: {
    buyerId: string;
    artistUserId: string;
    senderId: string;
    listingId?: string | null;
    content: string;
    /** Short label for the conversation list. */
    preview: string;
  },
): Promise<void> {
  try {
    const { buyerId, artistUserId } = opts;
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .or(
        `and(participant_one.eq.${buyerId},participant_two.eq.${artistUserId}),and(participant_one.eq.${artistUserId},participant_two.eq.${buyerId})`,
      )
      .limit(1)
      .maybeSingle();

    let convId = existing?.id as string | undefined;
    if (!convId) {
      const { data: created, error } = await admin
        .from('conversations')
        .insert({
          participant_one: buyerId,
          participant_two: artistUserId,
          context_type: 'listing',
          context_id: opts.listingId ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      convId = created?.id as string | undefined;
    }
    if (!convId) throw new Error('no conversation id after insert');

    const { error: msgError } = await admin.from('messages').insert({
      conversation_id: convId,
      sender_id: opts.senderId,
      content: opts.content,
      message_type: 'system',
    });
    if (msgError) throw msgError;

    await admin
      .from('conversations')
      .update({ last_message_text: opts.preview, last_message_at: new Date().toISOString() })
      .eq('id', convId);
  } catch (err) {
    Sentry.captureException(err, {
      extra: { where: 'postOrderSystemMessage', listingId: opts.listingId },
    });
  }
}
