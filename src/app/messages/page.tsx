'use client';

import { useAuth } from '@/context/AuthContext';
import { useConversations } from '@/hooks/useConversations';
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

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl">
      <div className="w-full border-r border-gray-200 md:w-80">
        {conversations && conversations.length > 0 ? (
          <ConversationList conversations={conversations} activeId={null} currentUserId={user?.id ?? ''} />
        ) : (
          <EmptyState title="No messages" description="Start a conversation from an artist or listing page." />
        )}
      </div>
      <div className="hidden flex-1 items-center justify-center md:flex">
        <p className="text-gray-400">Select a conversation</p>
      </div>
    </div>
  );
}
