'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface NotificationContextValue {
  unreadCount: number;
  refreshNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setUnreadCount(count ?? 0);
  }, [user]);

  useEffect(() => {
    void refreshNotifications();

    if (!user) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => refreshNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => refreshNotifications()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refreshNotifications]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationCount(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotificationCount must be used within NotificationProvider');
  return context;
}
