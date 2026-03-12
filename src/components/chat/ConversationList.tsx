'use client';

import Link from 'next/link';
import { ConversationWithParticipants } from '@/types/conversation';
import { formatTime } from '@/utils/formatTime';

interface ConversationListProps {
  conversations: ConversationWithParticipants[];
  activeId: string | null;
  currentUserId: string;
}

export function ConversationList({ conversations, activeId, currentUserId }: ConversationListProps) {
  return (
    <div className="divide-y divide-gray-100">
      {conversations.map((conv) => {
        const other = conv.participant_one === currentUserId
          ? conv.participant_two_profile
          : conv.participant_one_profile;

        return (
          <Link
            key={conv.id}
            href={`/messages/${conv.id}`}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50
              ${conv.id === activeId ? 'bg-orange-50' : ''}`}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
              {other.full_name?.[0]?.toUpperCase() ?? other.email[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-sm font-medium text-gray-900">
                  {other.full_name ?? other.email}
                </p>
                {conv.last_message_at && (
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {formatTime(conv.last_message_at)}
                  </span>
                )}
              </div>
              {conv.last_message_text && (
                <p className="truncate text-xs text-gray-500">{conv.last_message_text}</p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
