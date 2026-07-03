import { supabase } from '@/lib/supabase';
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
      '*, participant_one_profile:profiles!conversations_participant_one_fkey(*), participant_two_profile:profiles!conversations_participant_two_fkey(*)'
    )
    .or(`participant_one.eq.${userId},participant_two.eq.${userId}`)
    .order('last_message_at', { ascending: false });

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
      '*, participant_one_profile:profiles!conversations_participant_one_fkey(*), participant_two_profile:profiles!conversations_participant_two_fkey(*)'
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

export async function updateLastMessage(conversationId: string, text: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({
      last_message_text: text,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) throw error;
}
