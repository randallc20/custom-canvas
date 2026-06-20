'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useConversations } from '@/hooks/useConversations';
import { useUnreadCounts } from '@/hooks/useMessages';
import { useBlockedIds, useMutedConversationIds } from '@/hooks/useChatSafety';
import { ConversationList } from '@/components/chat/ConversationList';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';

export default function MessagesPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'user', 'gallery']}>
        <MessagesContent />
      </AuthGuard>
    </PageShell>
  );
}

function MessagesContent() {
  const { user } = useAuth();
  const { data: conversations, isLoading } = useConversations(user?.id ?? '');
  const conversationIds = useMemo(() => conversations?.map((c) => c.id) ?? [], [conversations]);
  const { data: unreadCounts } = useUnreadCounts(user?.id ?? '', conversationIds);
  const { data: blockedIds } = useBlockedIds(user?.id ?? '');
  const { data: mutedIds } = useMutedConversationIds(user?.id ?? '');

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl">
      <div className="w-full border-r border-line md:w-80">
        {conversations && conversations.length > 0 ? (
          <ConversationList
            conversations={conversations}
            activeId={null}
            currentUserId={user?.id ?? ''}
            unreadCounts={unreadCounts}
            blockedIds={blockedIds}
            mutedIds={mutedIds}
          />
        ) : (
          <EmptyState title="No messages yet" description="Start a conversation from an artist or listing page." />
        )}
      </div>
      <div className="hidden flex-1 items-center justify-center md:flex">
        <p className="text-muted">Select a conversation</p>
      </div>
    </div>
  );
}
