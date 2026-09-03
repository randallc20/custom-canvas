'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { formatTime } from '@/utils/formatTime';
import { commissionDisplayStatus } from '@/utils/commissionDisplay';
import type { InboxConversation } from '@/services/conversations';

interface ConversationListProps {
  conversations: InboxConversation[];
  activeId: string | null;
  currentUserId: string;
  unreadCounts?: Record<string, number>;
  /** Profile ids the current user has blocked — their threads are hidden. */
  blockedIds?: string[];
  /** Conversation ids the current user has muted — shown with a mute icon. */
  mutedIds?: string[];
}

export function ConversationList({
  conversations, activeId, currentUserId, unreadCounts, blockedIds = [], mutedIds = [],
}: ConversationListProps) {
  const visible = conversations.filter((conv) => {
    const otherId = conv.participant_one === currentUserId ? conv.participant_two : conv.participant_one;
    return !blockedIds.includes(otherId);
  });

  return (
    <div className="divide-y divide-line overflow-y-auto">
      {visible.map((conv) => {
        const other = conv.participant_one === currentUserId
          ? conv.participant_two_profile
          : conv.participant_one_profile;
        const unread = unreadCounts?.[conv.id] ?? 0;
        const muted = mutedIds.includes(conv.id);
        const commissionDisplay = conv.commission_status
          ? commissionDisplayStatus(conv.commission_status)
          : null;

        return (
          <Link
            key={conv.id}
            href={`/messages/${conv.id}`}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sand/50
              ${conv.id === activeId ? 'bg-terraSoft' : ''}`}
          >
            <Avatar src={other.avatar_url} alt={other.full_name ?? 'Conversation'} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className={`flex items-center gap-1 truncate text-sm ${unread > 0 && !muted ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                  {other.full_name ?? 'Someone'}
                  {muted && (
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Muted">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 9l4 4m0-4l-4 4" />
                    </svg>
                  )}
                </p>
                {conv.last_message_at && (
                  <span className="flex-shrink-0 text-xs text-muted">{formatTime(conv.last_message_at)}</span>
                )}
              </div>
              {commissionDisplay && (
                <div className="mt-0.5">
                  <Badge variant={commissionDisplay.variant}>{commissionDisplay.label}</Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                {conv.last_message_text && (
                  <p className={`truncate text-xs ${unread > 0 && !muted ? 'font-medium text-ink' : 'text-muted'}`}>
                    {conv.last_message_text}
                  </p>
                )}
                {unread > 0 && !muted && (
                  <span className="ml-2 flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-terraText px-1.5 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
