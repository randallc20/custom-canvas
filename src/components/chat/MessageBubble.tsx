import Image from 'next/image';
import { Message } from '@/types/message';
import { formatTime } from '@/utils/formatTime';
import { PartnerBadge } from '@/components/gallery/PartnerBadge';
import type { PartnerType } from '@/types/gallery';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Set when the sender is a verified partner — renders the shield. */
  senderPartnerType?: PartnerType | null;
}

export function MessageBubble({ message, isOwn, senderPartnerType }: MessageBubbleProps) {
  if (message.message_type === 'system') {
    return (
      <div className="py-1 text-center text-xs italic text-gray-400">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isOwn ? 'bg-terra text-white' : 'bg-gray-100 text-gray-900'}`}>
        {message.message_type === 'image' ? (
          <Image src={message.content} alt="Shared image" width={300} height={300} className="max-w-full rounded-lg" sizes="300px" />
        ) : (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        )}
        <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
          {!isOwn && senderPartnerType != null && <PartnerBadge partnerType={senderPartnerType} compact />}
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
