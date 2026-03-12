'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useConversations } from '@/hooks/useConversations';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatThread } from '@/components/chat/ChatThread';
import { Spinner } from '@/components/ui/Spinner';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';

export default function ConversationPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'user', 'gallery']}>
        <ConversationContent />
      </AuthGuard>
    </PageShell>
  );
}

function ConversationContent() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { data: conversations, isLoading } = useConversations(user?.id ?? '');

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl">
      <div className="hidden w-80 border-r border-gray-200 md:block">
        {conversations && (
          <ConversationList conversations={conversations} activeId={conversationId} currentUserId={user?.id ?? ''} />
        )}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center border-b border-gray-200 px-4 py-2 md:hidden">
          <Link href="/messages" className="mr-3 text-gray-500 hover:text-gray-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-sm font-medium">Back to messages</span>
        </div>
        <ChatThread conversationId={conversationId} />
      </div>
    </div>
  );
}
