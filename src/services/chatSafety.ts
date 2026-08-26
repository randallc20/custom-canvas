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
  const { data, error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .select('blocked_id');
  if (error) throw error;
  // Zero rows = RLS refused the delete — the UI would say "unblocked" while
  // the block silently survived.
  if (!data?.length) throw new Error('Could not unblock — please refresh and try again.');
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
  const { data, error } = await supabase
    .from('muted_conversations')
    .delete()
    .eq('profile_id', profileId)
    .eq('conversation_id', conversationId)
    .select('conversation_id');
  if (error) throw error;
  // Zero rows = RLS refused the delete — the thread would look unmuted while
  // staying muted.
  if (!data?.length) throw new Error('Could not unmute — please refresh and try again.');
}
