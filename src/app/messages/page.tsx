'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    <PageShell fullHeight>
      <AuthGuard allowedRoles={['artist', 'user', 'gallery']}>
        <Suspense fallback={<div className="flex justify-center py-16"><Spinner size="lg" /></div>}>
          <MessagesContent />
        </Suspense>
      </AuthGuard>
    </PageShell>
  );
}

function MessagesContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'commissions' ? 'commissions' : 'all';
  const { data: conversations, isLoading } = useConversations(user?.id ?? '');
  const { data: unreadCounts } = useUnreadCounts(user?.id ?? '');
  const { data: blockedIds } = useBlockedIds(user?.id ?? '');
  const { data: mutedIds } = useMutedConversationIds(user?.id ?? '');

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const visible =
    tab === 'commissions'
      ? (conversations ?? []).filter((c) => c.context_type === 'commission')
      : conversations ?? [];

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1">
      <div className="flex w-full flex-col border-r border-line md:w-80">
        <div className="flex gap-1 border-b border-line px-2 py-2">
          {(['all', 'commissions'] as const).map((t) => (
            <button
              key={t}
              onClick={() => router.replace(t === 'all' ? '/messages' : '/messages?tab=commissions')}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                tab === t ? 'bg-terra text-white' : 'text-muted hover:bg-sand/50 hover:text-ink'
              }`}
            >
              {t === 'all' ? 'All' : 'Commissions'}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length > 0 ? (
            <ConversationList
              conversations={visible}
              activeId={null}
              currentUserId={user?.id ?? ''}
              unreadCounts={unreadCounts}
              blockedIds={blockedIds}
              mutedIds={mutedIds}
            />
          ) : tab === 'commissions' ? (
            <EmptyState
              title="No commissions yet"
              description="Commission conversations — requests, quotes, and progress — will live here."
            />
          ) : (
            <EmptyState title="No messages yet" description="Start a conversation from an artist or listing page." />
          )}
        </div>
      </div>
      <div className="hidden flex-1 items-center justify-center md:flex">
        <p className="text-muted">Select a conversation</p>
      </div>
    </div>
  );
}
