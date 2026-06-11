'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { trackEvent } from '@/services/analytics';
import type { AnalyticsEventType } from '@/types/analytics';

interface TrackViewProps {
  artistId: string;
  eventType: AnalyticsEventType;
  listingId?: string;
}

export function TrackView({ artistId, eventType, listingId }: TrackViewProps) {
  const { user } = useAuth();
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    if (user?.id === artistId) return;
    tracked.current = true;

    trackEvent({
      artistId,
      eventType,
      listingId,
      viewerId: user?.id,
    }).catch(() => {});
  }, [artistId, eventType, listingId, user?.id]);

  return null;
}
