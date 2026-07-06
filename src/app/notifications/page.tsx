'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useNotificationCount } from '@/context/NotificationContext';
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '@/hooks/useNotifications';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { formatTime } from '@/utils/formatTime';
import type { Notification, NotificationType } from '@/types/notification';

const TYPE_ICONS: Record<NotificationType, string> = {
  new_message: '💬',
  new_follower: '👤',
  new_order: '🛒',
  commission_request: '🎨',
  commission_accepted: '✅',
  commission_declined: '❌',
  commission_completed: '🎉',
  commission_confirmed: '✅',
  commission_disputed: '⚠️',
  review_received: '⭐',
  listing_reported: '🚩',
  payout_sent: '💰',
};

export default function NotificationsPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'user', 'gallery', 'admin']}>
        <NotificationsContent />
      </AuthGuard>
    </PageShell>
  );
}

function NotificationsContent() {
  const { user } = useAuth();
  const { unreadCount, refreshNotifications } = useNotificationCount();
  const { data: notifications, isLoading } = useNotifications(user?.id ?? '');
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead(user?.id ?? '');

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => refreshNotifications(),
    });
  };

  const handleMarkRead = (id: string) => {
    markRead.mutate(id, {
      onSuccess: () => refreshNotifications(),
    });
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      {!notifications || notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="You're all caught up! Notifications about orders, messages, and commissions will appear here."
        />
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onMarkRead={() => handleMarkRead(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ notification, onMarkRead }: { notification: Notification; onMarkRead: () => void }) {
  const icon = TYPE_ICONS[notification.type] ?? '🔔';

  const content = (
    <div
      className={`flex items-start gap-3 px-4 py-4 transition-colors hover:bg-sand/50 ${
        !notification.is_read ? 'bg-orange-50/40' : ''
      }`}
    >
      <span className="mt-0.5 flex-shrink-0 text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${!notification.is_read ? 'font-semibold text-ink' : 'text-ink'}`}>
          {notification.title}
        </p>
        <p className="mt-0.5 text-sm text-muted">{notification.body}</p>
        <p className="mt-1 text-xs text-muted">{formatTime(notification.created_at)}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {!notification.is_read && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMarkRead(); }}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-sand hover:text-muted"
          >
            Mark read
          </button>
        )}
        {!notification.is_read && (
          <span className="h-2.5 w-2.5 rounded-full bg-terra" />
        )}
      </div>
    </div>
  );

  if (notification.link) {
    return <Link href={notification.link} onClick={onMarkRead}>{content}</Link>;
  }

  return content;
}
