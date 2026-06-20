import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendReviewRequestEmail } from '@/services/email';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Daily: orders delivered 7+ days ago with no review and not yet reminded.
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, buyer_id, listing_id, updated_at, listing:listings(title)')
    .eq('status', 'delivered')
    .is('review_requested_at', null)
    .lt('updated_at', cutoff)
    .limit(200);

  let sent = 0;
  for (const o of orders ?? []) {
    const { data: existing } = await supabase.from('reviews').select('id').eq('order_id', o.id).maybeSingle();
    if (existing) {
      await supabase.from('orders').update({ review_requested_at: new Date().toISOString() }).eq('id', o.id);
      continue;
    }
    const { data: buyer } = await supabase.from('profiles').select('email, full_name, email_preferences').eq('id', o.buyer_id).single();
    const title = (o.listing as unknown as { title: string } | null)?.title ?? 'your purchase';
    if (buyer?.email) {
      sendReviewRequestEmail(buyer.email, buyer.full_name ?? 'there', title, o.id).catch(() => {});
    }
    await supabase.from('orders').update({ review_requested_at: new Date().toISOString() }).eq('id', o.id);
    sent++;
  }

  return NextResponse.json({ sent });
}
