'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useNotificationCount } from '@/context/NotificationContext';
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from '@/hooks/useNotifications';
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

export function NotificationDropdown() {
  const { user } = useAuth();
  const { unreadCount, refreshNotifications } = useNotificationCount();
  const { data: notifications } = useNotifications(user?.id ?? '');
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead(user?.id ?? '');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => refreshNotifications(),
    });
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markRead.mutate(notification.id, {
        onSuccess: () => refreshNotifications(),
      });
    }
    setOpen(false);
  };

  const recent = (notifications ?? []).slice(0, 8);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-gray-600 hover:text-gray-900"
        aria-label="Notifications"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-terra px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-terra hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No notifications yet
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {recent.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={() => handleNotificationClick(n)}
                />
              ))}
            </div>
          )}

          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-terra hover:underline"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notification, onClick }: { notification: Notification; onClick: () => void }) {
  const icon = TYPE_ICONS[notification.type] ?? '🔔';

  const content = (
    <div
      className={`flex gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${
        !notification.is_read ? 'bg-orange-50/50' : ''
      }`}
    >
      <span className="flex-shrink-0 text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${!notification.is_read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
          {notification.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{notification.body}</p>
        <p className="mt-1 text-[10px] text-gray-400">{formatTime(notification.created_at)}</p>
      </div>
      {!notification.is_read && (
        <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-terra" />
      )}
    </div>
  );

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return <button onClick={onClick} className="block w-full text-left">{content}</button>;
}
