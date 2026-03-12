import { Message } from '@/types/message';
import { formatTime } from '@/utils/formatTime';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  if (message.message_type === 'system') {
    return (
      <div className="py-1 text-center text-xs italic text-gray-400">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isOwn ? 'bg-[#E8704A] text-white' : 'bg-gray-100 text-gray-900'}`}>
        {message.message_type === 'image' ? (
          <img src={message.content} alt="" className="max-w-full rounded-lg" />
        ) : (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        )}
        <p className={`mt-1 text-right text-[10px] ${isOwn ? 'text-white/70' : 'text-gray-400'}`}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
