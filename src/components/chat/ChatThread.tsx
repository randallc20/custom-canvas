'use client';

import { useRef, useEffect } from 'react';
import { useMessages, useSendMessage } from '@/hooks/useMessages';
import { useAuth } from '@/context/AuthContext';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Spinner } from '@/components/ui/Spinner';

interface ChatThreadProps {
  conversationId: string;
}

export function ChatThread({ conversationId }: ChatThreadProps) {
  const { user } = useAuth();
  const { messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {[...messages].reverse().map((msg) => (
            <MessageBubble key={msg.id} message={msg} isOwn={msg.sender_id === user?.id} />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={handleSend} disabled={sendMessage.isPending} />
    </div>
  );
}
