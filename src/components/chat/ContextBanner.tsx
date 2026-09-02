'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { listingPriceLabel } from '@/utils/formatPrice';

interface ContextBannerProps {
  contextType: string | null;
  contextId: string | null;
}

interface ListingCtx {
  kind: 'listing';
  id: string;
  title: string;
  image: string | null;
  label: string;
}
interface CommissionCtx {
  kind: 'commission';
  id: string;
  title: string;
  status: string;
}
type Ctx = ListingCtx | CommissionCtx;

// Pins the thread's subject (a listing or commission) above the messages so
// both parties always have the context in view.
export function ContextBanner({ contextType, contextId }: ContextBannerProps) {
  const [ctx, setCtx] = useState<Ctx | null>(null);

  useEffect(() => {
    setCtx(null); // reset when switching threads so a stale banner never shows
    if (!contextId) return;
    let active = true;
    (async () => {
      if (contextType === 'listing') {
        const { data } = await supabase
          .from('listings')
          .select('id, title, price_cents, price_visible, status, sold_price_cents, show_sold_price, images:listing_images(image_url, is_primary)')
          .eq('id', contextId)
          .single();
        if (data && active) {
          const imgs = (data.images as { image_url: string; is_primary: boolean }[]) ?? [];
          const primary = imgs.find((i) => i.is_primary) ?? imgs[0];
          setCtx({ kind: 'listing', id: data.id, title: data.title, image: primary?.image_url ?? null, label: listingPriceLabel(data) });
        }
      } else if (contextType === 'commission') {
        const { data } = await supabase.from('commissions').select('id, title, status').eq('id', contextId).single();
        if (data && active) setCtx({ kind: 'commission', id: data.id, title: data.title, status: data.status });
      }
    })();
    return () => { active = false; };
  }, [contextType, contextId]);

  if (!ctx) return null;

  const href = ctx.kind === 'listing' ? `/listing/${ctx.id}` : `/commissions/${ctx.id}`;

  return (
    <Link href={href} className="flex items-center gap-3 border-b border-line bg-sand/40 px-4 py-2 transition-colors hover:bg-sand/70">
      {ctx.kind === 'listing' ? (
        ctx.image ? (
          <Image src={ctx.image} alt={ctx.title} width={40} height={40} className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-line" />
        )
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-terraSoft text-terraText">✦</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{ctx.title}</p>
        <p className="text-xs text-muted">
          {ctx.kind === 'listing' ? ctx.label : `Commission · ${ctx.status.replace('_', ' ')}`}
        </p>
      </div>
    </Link>
  );
}
