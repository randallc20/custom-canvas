'use client';

import Link from 'next/link';
import { ConversationWithParticipants } from '@/types/conversation';
import { Avatar } from '@/components/ui/Avatar';
import { formatTime } from '@/utils/formatTime';

interface ConversationListProps {
  conversations: ConversationWithParticipants[];
  activeId: string | null;
  currentUserId: string;
  unreadCounts?: Record<string, number>;
}

export function ConversationList({ conversations, activeId, currentUserId, unreadCounts }: ConversationListProps) {
  return (
    <div className="divide-y divide-gray-100 overflow-y-auto">
      {conversations.map((conv) => {
        const other = conv.participant_one === currentUserId
          ? conv.participant_two_profile
          : conv.participant_one_profile;
        const unread = unreadCounts?.[conv.id] ?? 0;

        return (
          <Link
            key={conv.id}
            href={`/messages/${conv.id}`}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50
              ${conv.id === activeId ? 'bg-orange-50' : ''}`}
          >
            <Avatar
              src={other.avatar_url}
              alt={other.full_name ?? other.email}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className={`truncate text-sm ${unread > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-900'}`}>
                  {other.full_name ?? other.email}
                </p>
                {conv.last_message_at && (
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {formatTime(conv.last_message_at)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                {conv.last_message_text && (
                  <p className={`truncate text-xs ${unread > 0 ? 'font-medium text-gray-700' : 'text-gray-500'}`}>
                    {conv.last_message_text}
                  </p>
                )}
                {unread > 0 && (
                  <span className="ml-2 flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-[#E8704A] px-1.5 text-[10px] font-bold text-white">
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
