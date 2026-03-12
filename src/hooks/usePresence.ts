import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function usePresence(conversationId: string, userId: string) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase.channel(`presence:${conversationId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineUsers(Object.keys(state));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  return {
    onlineUsers,
    isUserOnline: (id: string) => onlineUsers.includes(id),
  };
}
