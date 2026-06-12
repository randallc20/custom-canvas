'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useMessages, useSendMessage, useMarkAsRead } from '@/hooks/useMessages';
import { useAuth } from '@/context/AuthContext';
import { useUnread } from '@/context/UnreadContext';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Spinner } from '@/components/ui/Spinner';

interface ChatThreadProps {
  conversationId: string;
}

export function ChatThread({ conversationId }: ChatThreadProps) {
  const { user } = useAuth();
  const { messages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead(conversationId, user?.id ?? '');
  const { refreshUnread } = useUnread();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  // Mark messages as read on mount and when new messages arrive
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const hasUnread = messages.some((m) => !m.is_read && m.sender_id !== user.id);
    if (hasUnread) {
      markAsRead.mutate(undefined, { onSuccess: () => refreshUnread() });
    }
  }, [messages.length, user, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages (but not when loading older)
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const isNewMessage = prevMessageCount.current > 0;
      if (!isNewMessage || messages.length - prevMessageCount.current <= 2) {
        bottomRef.current?.scrollIntoView({ behavior: isNewMessage ? 'smooth' : 'auto' });
      }
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSend = (content: string) => {
    if (!user) return;
    sendMessage.mutate({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
    });
  };

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;
  }

  const reversed = [...messages].reverse();

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {hasNextPage && (
          <div className="mb-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={isFetchingNextPage}
              className="text-sm text-terra hover:underline disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load earlier messages'}
            </button>
          </div>
        )}
        <div className="space-y-2">
          {reversed.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isOwn={msg.sender_id === user?.id} />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={handleSend} disabled={sendMessage.isPending} />
    </div>
  );
}
