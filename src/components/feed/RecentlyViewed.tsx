'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ListingShelf } from './ListingShelf';
import type { ListingWithImages } from '@/types/listing';

// Logged-in only: the last 12 distinct listings the user viewed.
export function RecentlyViewed() {
  const { user } = useAuth();
  const [listings, setListings] = useState<ListingWithImages[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data: events } = await supabase
        .from('analytics_events')
        .select('listing_id, created_at')
        .eq('viewer_id', user.id)
        .eq('event_type', 'listing_view')
        .not('listing_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60);

      const seen = new Set<string>();
      const ids: string[] = [];
      for (const e of events ?? []) {
        if (e.listing_id && !seen.has(e.listing_id)) { seen.add(e.listing_id); ids.push(e.listing_id); }
        if (ids.length >= 12) break;
      }
      if (ids.length === 0) return;

      const { data } = await supabase
        .from('listings')
        .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
        .in('id', ids)
        .eq('status', 'available');

      if (!active || !data) return;
      const byId = new Map(data.map((l: Record<string, unknown>) => [l.id as string, l]));
      const ordered = ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((l) => ({ ...(l as Record<string, unknown>), tags: (((l as Record<string, unknown>).tags as { tag: unknown }[]) ?? []).map((t) => t.tag) })) as unknown as ListingWithImages[];
      setListings(ordered);
    })();
    return () => { active = false; };
  }, [user]);

  if (!user) return null;

  return <ListingShelf title="Recently viewed" listings={listings} />;
}
