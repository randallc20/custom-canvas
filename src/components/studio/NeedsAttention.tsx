'use client';

import Link from 'next/link';
import { useArtistOrders } from '@/hooks/useOrders';
import { useArtistCommissions } from '@/hooks/useCommissions';
import { useUnread } from '@/context/UnreadContext';

interface QueueItem {
  key: string;
  text: string;
  href: string;
  cta: string;
}

/** The "what needs me today" queue — the reason Studio home exists. */
export function NeedsAttention({ artistId }: { artistId: string }) {
  const { data: orders } = useArtistOrders(artistId);
  const { data: commissions } = useArtistCommissions(artistId);
  const { unreadCount } = useUnread();

  const items: QueueItem[] = [];

  const toShip = orders?.filter((o) => o.status === 'paid') ?? [];
  if (toShip.length > 0) {
    items.push({
      key: 'ship',
      text: `${toShip.length} order${toShip.length > 1 ? 's' : ''} awaiting shipment`,
      href: '/studio/sales',
      cta: 'Ship',
    });
  }

  const needsQuote = commissions?.filter((c) => c.status === 'pending') ?? [];
  if (needsQuote.length > 0) {
    items.push({
      key: 'quote',
      text: `${needsQuote.length} commission request${needsQuote.length > 1 ? 's' : ''} waiting for a quote`,
      href: '/messages?tab=commissions',
      cta: 'Quote',
    });
  }

  const delivered = commissions?.filter((c) => c.status === 'accepted' || c.status === 'in_progress') ?? [];
  if (delivered.length > 0) {
    items.push({
      key: 'wip',
      text: `${delivered.length} commission${delivered.length > 1 ? 's' : ''} in progress — post an update`,
      href: '/messages?tab=commissions',
      cta: 'Update',
    });
  }

  if (unreadCount > 0) {
    items.push({
      key: 'messages',
      text: `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`,
      href: '/messages',
      cta: 'Reply',
    });
  }

  if (items.length === 0) {
    return (
      <div className="mb-8 rounded-xl border border-line bg-sand/40 p-4 text-sm text-muted">
        Nothing needs your attention right now. Nice.
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-xl border border-terra/30 bg-terraSoft/60 p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">Needs your attention</h2>
      <ul className="divide-y divide-terra/10">
        {items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm text-ink">{item.text}</span>
            <Link href={item.href} className="whitespace-nowrap text-sm font-medium text-terraText hover:text-terraTextDark">
              {item.cta} →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
