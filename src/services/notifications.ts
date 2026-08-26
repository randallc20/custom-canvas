import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types/notification';

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  // Zero rows = RLS refused the update — the badge count would never clear.
  if (!data) throw new Error('Could not mark the notification read.');
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  // Zero rows is legitimate here (nothing unread) — no row assertion.
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}
