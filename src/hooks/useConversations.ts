import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConversations, getConversationById, findOrCreateConversation } from '@/services/conversations';

export function useConversations(userId: string) {
  return useQuery({
    queryKey: ['conversations', userId],
    queryFn: () => getConversations(userId),
    enabled: !!userId,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => getConversationById(id),
    enabled: !!id,
  });
}

export function useFindOrCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      userId: string;
      otherUserId: string;
      contextType?: string;
      contextId?: string;
    }) =>
      findOrCreateConversation(
        params.userId,
        params.otherUserId,
        params.contextType,
        params.contextId
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
