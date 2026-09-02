'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { trackEvent } from '@/services/analytics';
import { captureException } from '@/lib/sentry';
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

    // Fire-and-forget: a failed view ping must never touch the page, but it
    // should not vanish either — the route inserting with the service role
    // is the only path that records views now.
    trackEvent({ artistId, eventType, listingId }).catch((err) => {
      captureException(err, { where: 'TrackView', eventType });
    });
  }, [artistId, eventType, listingId, user?.id]);

  return null;
}
