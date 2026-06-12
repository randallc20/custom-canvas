'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useConversations, useConversation } from '@/hooks/useConversations';
import { useUnreadCounts } from '@/hooks/useMessages';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatThread } from '@/components/chat/ChatThread';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { usePartnerStatus } from '@/hooks/usePartnerStatus';
import { PartnerBadge } from '@/components/gallery/PartnerBadge';
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
  const { data: activeConv } = useConversation(conversationId);
  const conversationIds = useMemo(() => conversations?.map((c) => c.id) ?? [], [conversations]);
  const { data: unreadCounts } = useUnreadCounts(user?.id ?? '', conversationIds);

  const otherParticipantId = activeConv
    ? (activeConv.participant_one === user?.id ? activeConv.participant_two : activeConv.participant_one)
    : null;
  const { data: partnerStatus } = usePartnerStatus(otherParticipantId);
  const otherPartnerType = partnerStatus?.isVerifiedPartner ? partnerStatus.partnerType : null;

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const otherParticipant = activeConv
    ? (activeConv.participant_one === user?.id
        ? activeConv.participant_two_profile
        : activeConv.participant_one_profile)
    : null;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl">
      <div className="hidden w-80 border-r border-gray-200 md:block">
        {conversations && (
          <ConversationList
            conversations={conversations}
            activeId={conversationId}
            currentUserId={user?.id ?? ''}
            unreadCounts={unreadCounts}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
          <Link href="/messages" className="text-gray-500 hover:text-gray-700 md:hidden">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          {otherParticipant && (
            <>
              <Avatar
                src={otherParticipant.avatar_url}
                alt={otherParticipant.full_name ?? otherParticipant.email}
                size="sm"
              />
              <span className="text-sm font-medium text-gray-900">
                {otherParticipant.full_name ?? otherParticipant.email}
              </span>
              {otherPartnerType != null && <PartnerBadge partnerType={otherPartnerType} />}
            </>
          )}
        </div>
        <ChatThread conversationId={conversationId} otherPartnerType={otherPartnerType} />
      </div>
    </div>
  );
}
