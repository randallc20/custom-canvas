import { supabase } from '@/lib/supabase';
import { PUBLIC_PROFILE_COLS } from '@/lib/publicProfile';
import { Conversation, ConversationWithParticipants } from '@/types/conversation';
import type { CommissionStatus } from '@/types/commission';

export type InboxConversation = ConversationWithParticipants & {
  /** Status of the linked commission, for commission-anchored threads. */
  commission_status?: CommissionStatus;
};

export async function getConversations(userId: string): Promise<InboxConversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      // email is not client-readable (00031) — explicit public columns only.
      `*, participant_one_profile:profiles!conversations_participant_one_fkey(${PUBLIC_PROFILE_COLS}), participant_two_profile:profiles!conversations_participant_two_fkey(${PUBLIC_PROFILE_COLS})`
    )
    .or(`participant_one.eq.${userId},participant_two.eq.${userId}`)
    // Postgres puts NULLs FIRST on a DESC sort, so a brand-new empty thread
    // floated above every real conversation in the inbox.
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;
  const conversations = data as InboxConversation[];

  // context_id is polymorphic (no FK), so commission statuses come from a
  // second batched query. Resolved via commissions.conversation_id — always
  // written at request time, unlike the context_id backfill.
  const commissionConvIds = conversations
    .filter((c) => c.context_type === 'commission')
    .map((c) => c.id);
  if (commissionConvIds.length) {
    const { data: commissions } = await supabase
      .from('commissions')
      .select('conversation_id, status')
      .in('conversation_id', commissionConvIds);
    const statusByConv = new Map(
      (commissions ?? []).map((c) => [c.conversation_id as string, c.status as CommissionStatus])
    );
    for (const conv of conversations) {
      if (conv.context_type === 'commission') {
        conv.commission_status = statusByConv.get(conv.id);
      }
    }
  }
  return conversations;
}

export async function getConversationById(id: string): Promise<ConversationWithParticipants | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      // email is not client-readable (00031) — explicit public columns only.
      `*, participant_one_profile:profiles!conversations_participant_one_fkey(${PUBLIC_PROFILE_COLS}), participant_two_profile:profiles!conversations_participant_two_fkey(${PUBLIC_PROFILE_COLS})`
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as ConversationWithParticipants;
}

export async function createConversation(
  participantOne: string,
  participantTwo: string,
  contextType?: string,
  contextId?: string
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      participant_one: participantOne,
      participant_two: participantTwo,
      context_type: contextType ?? null,
      context_id: contextId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function findOrCreateConversation(
  userId: string,
  otherUserId: string,
  contextType?: string,
  contextId?: string
): Promise<Conversation> {
  // Check for existing conversation between these two users
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .or(
      `and(participant_one.eq.${userId},participant_two.eq.${otherUserId}),and(participant_one.eq.${otherUserId},participant_two.eq.${userId})`
    )
    .limit(1)
    .single();

  if (existing) return existing;

  return createConversation(userId, otherUserId, contextType, contextId);
}
