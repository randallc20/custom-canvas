import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMessages, sendMessage, markMessagesAsRead, getUnreadCounts, MessageRefusedError } from '@/services/messages';
import { useToast } from '@/components/ui/Toast';
import { captureException } from '@/lib/sentry';
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
          void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
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
  const { toast } = useToast();

  return useMutation({
    mutationFn: sendMessage,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['messages', variables.conversation_id] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    // The composer clears optimistically — without this, a refused send
    // (blocked user, bad payload) just vanishes with zero feedback.
    onError: (err) => {
      // A policy refusal (blocked sender) is the app working as designed —
      // toast it, but don't page Sentry (the nightly's block test would fire
      // an issue every night).
      if (!(err instanceof MessageRefusedError)) {
        captureException(err, { where: 'useSendMessage' });
      }
      toast('Your message didn’t send — please try again.', 'error');
    },
  });
}

export function useUnreadCounts(userId: string) {
  return useQuery({
    queryKey: ['unread-counts', userId],
    queryFn: getUnreadCounts,
    enabled: !!userId,
    refetchInterval: 30000,
  });
}

export function useMarkAsRead(conversationId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markMessagesAsRead(conversationId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    // A toast would be noise (nobody asked to mark this read), but the
    // failure has to reach someone: a zero-row update leaves the unread badge
    // stuck in the inbox and navbar with no other signal. CONVENTIONS rule 2.
    onError: (err) => captureException(err, { where: 'useMarkAsRead' }),
  });
}
