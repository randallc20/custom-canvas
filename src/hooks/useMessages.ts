import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMessages, sendMessage, markMessagesAsRead, getUnreadCounts } from '@/services/messages';
import { supabase } from '@/lib/supabase';
import { Message } from '@/types/message';

export function useMessages(conversationId: string) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) =>
      getMessages(conversationId, { cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const messages: Message[] =
    query.data?.pages.flatMap((page) => page.messages) ?? [];

  return {
    messages,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendMessage,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversation_id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useUnreadCounts(userId: string, conversationIds: string[]) {
  return useQuery({
    queryKey: ['unread-counts', userId, conversationIds],
    queryFn: () => getUnreadCounts(userId, conversationIds),
    enabled: !!userId && conversationIds.length > 0,
    refetchInterval: 30000,
  });
}

export function useMarkAsRead(conversationId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markMessagesAsRead(conversationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
}
