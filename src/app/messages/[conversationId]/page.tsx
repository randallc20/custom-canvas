'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useConversations, useConversation } from '@/hooks/useConversations';
import { useUnreadCounts } from '@/hooks/useMessages';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatThread } from '@/components/chat/ChatThread';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { usePartnerStatus } from '@/hooks/usePartnerStatus';
import { useBlockedIds, useMutedConversationIds } from '@/hooks/useChatSafety';
import { PartnerBadge } from '@/components/gallery/PartnerBadge';
import { ThreadMenu } from '@/components/chat/ThreadMenu';
import { ContextBanner } from '@/components/chat/ContextBanner';
import { CommissionPanel } from '@/components/commission/CommissionPanel';
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
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const { data: conversations, isLoading } = useConversations(user?.id ?? '');
  const { data: activeConv } = useConversation(conversationId);
  const conversationIds = useMemo(() => conversations?.map((c) => c.id) ?? [], [conversations]);
  const { data: unreadCounts } = useUnreadCounts(user?.id ?? '', conversationIds);
  const { data: blockedIds } = useBlockedIds(user?.id ?? '');
  const { data: mutedIds } = useMutedConversationIds(user?.id ?? '');

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

  const isCommission = activeConv?.context_type === 'commission';

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl">
      <div className="hidden w-80 border-r border-line md:block">
        {conversations && (
          <ConversationList
            conversations={conversations}
            activeId={conversationId}
            currentUserId={user?.id ?? ''}
            unreadCounts={unreadCounts}
            blockedIds={blockedIds}
            mutedIds={mutedIds}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          {otherParticipant && (
            <>
              <Avatar
                src={otherParticipant.avatar_url}
                alt={otherParticipant.full_name ?? otherParticipant.email}
                size="sm"
              />
              <span className="text-sm font-medium text-ink">
                {otherParticipant.full_name ?? otherParticipant.email}
              </span>
              {otherPartnerType != null && <PartnerBadge partnerType={otherPartnerType} />}
              <div className="ml-auto flex items-center gap-2">
                {isCommission && (
                  <>
                    <button
                      onClick={() => setMobilePanelOpen(true)}
                      className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink hover:bg-sand/50 lg:hidden"
                    >
                      Commission details
                    </button>
                    <button
                      onClick={() => setPanelOpen((o) => !o)}
                      className="hidden rounded-full border border-line px-3 py-1 text-xs font-medium text-ink hover:bg-sand/50 lg:block"
                    >
                      {panelOpen ? 'Hide details' : 'Commission details'}
                    </button>
                  </>
                )}
                {otherParticipantId && (
                  <ThreadMenu
                    conversationId={conversationId}
                    otherUserId={otherParticipantId}
                    otherName={otherParticipant.full_name ?? 'this user'}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {activeConv && !isCommission && (
          <ContextBanner contextType={activeConv.context_type} contextId={activeConv.context_id} />
        )}
        <ChatThread conversationId={conversationId} otherPartnerType={otherPartnerType} />
      </div>

      {/* Commission rail: the commission lives in its conversation. */}
      {isCommission && panelOpen && (
        <aside className="hidden w-96 overflow-y-auto border-l border-line bg-surface lg:block">
          <CommissionPanel conversationId={conversationId} />
        </aside>
      )}
      {isCommission && mobilePanelOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobilePanelOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface shadow-card">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
              <span className="text-sm font-semibold text-ink">Commission details</span>
              <button onClick={() => setMobilePanelOpen(false)} className="text-muted hover:text-ink" aria-label="Close">
                ✕
              </button>
            </div>
            <CommissionPanel conversationId={conversationId} />
          </div>
        </div>
      )}
    </div>
  );
}
