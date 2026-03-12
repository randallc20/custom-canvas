import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConversations, getConversationById, createConversation } from '@/services/conversations';

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

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      participantOne: string;
      participantTwo: string;
      contextType?: string;
      contextId?: string;
    }) =>
      createConversation(
        params.participantOne,
        params.participantTwo,
        params.contextType,
        params.contextId
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
