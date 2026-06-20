import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBlockedIds, blockUser, unblockUser,
  getMutedConversationIds, muteConversation, unmuteConversation,
} from '@/services/chatSafety';

export function useBlockedIds(blockerId: string) {
  return useQuery({
    queryKey: ['blocked-ids', blockerId],
    queryFn: () => getBlockedIds(blockerId),
    enabled: !!blockerId,
  });
}

export function useMutedConversationIds(profileId: string) {
  return useQuery({
    queryKey: ['muted-conversations', profileId],
    queryFn: () => getMutedConversationIds(profileId),
    enabled: !!profileId,
  });
}

export function useToggleBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockerId, blockedId, isBlocked }: { blockerId: string; blockedId: string; isBlocked: boolean }) =>
      isBlocked ? unblockUser(blockerId, blockedId) : blockUser(blockerId, blockedId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['blocked-ids', v.blockerId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useToggleMute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, conversationId, isMuted }: { profileId: string; conversationId: string; isMuted: boolean }) =>
      isMuted ? unmuteConversation(profileId, conversationId) : muteConversation(profileId, conversationId),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['muted-conversations', v.profileId] }),
  });
}
