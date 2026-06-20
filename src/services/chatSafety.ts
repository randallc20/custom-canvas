import { supabase } from '@/lib/supabase';

// --- Blocking ---

export async function getBlockedIds(blockerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', blockerId);
  if (error) throw error;
  return (data ?? []).map((r) => r.blocked_id);
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

// --- Muting ---

export async function getMutedConversationIds(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('muted_conversations')
    .select('conversation_id')
    .eq('profile_id', profileId);
  if (error) throw error;
  return (data ?? []).map((r) => r.conversation_id);
}

export async function muteConversation(profileId: string, conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('muted_conversations')
    .insert({ profile_id: profileId, conversation_id: conversationId });
  if (error) throw error;
}

export async function unmuteConversation(profileId: string, conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('muted_conversations')
    .delete()
    .eq('profile_id', profileId)
    .eq('conversation_id', conversationId);
  if (error) throw error;
}
