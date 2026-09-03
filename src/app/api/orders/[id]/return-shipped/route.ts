import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { postOrderSystemMessage } from '@/lib/orderThread';

const bodySchema = z.object({
  tracking_number: z.string().trim().min(3).max(60),
  carrier: z.string().trim().min(2).max(40),
});

/** The buyer says they have sent the piece back (L8).
 *
 *  The only client-reachable write on a return record, and it goes through a
 *  route rather than the table so `shipped_back_at` is a server timestamp
 *  instead of a client's idea of one — the seven-day window in Terms of Sale
 *  §5 is measured against it.
 *
 *  Compare-and-swap on authorised-and-not-yet-shipped: pressing it twice does
 *  not move the date, and pressing it on a return nobody authorised does
 *  nothing at all.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'A tracking number and carrier are required — the return instructions ask for tracking.' },
      { status: 400 },
    );
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, buyer_id, listing_id, artist:artist_profiles(profile_id, display_name), listing:listings(title)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.buyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const { data: updated, error } = await admin
    .from('order_returns')
    .update({
      tracking_number: parsed.data.tracking_number,
      carrier: parsed.data.carrier,
      shipped_back_at: new Date().toISOString(),
    })
    .eq('order_id', params.id)
    .not('authorized_at', 'is', null)
    .is('shipped_back_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    Sentry.captureException(error, { extra: { where: 'orders.returnShipped', orderId: params.id } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'There is no authorised return waiting on this order, or you have already marked it shipped.' },
      { status: 409 },
    );
  }

  const artist = order.artist as unknown as { profile_id: string; display_name: string } | null;
  const title = (order.listing as unknown as { title: string } | null)?.title ?? 'the piece';
  if (order.buyer_id && artist?.profile_id) {
    await postOrderSystemMessage(admin, {
      buyerId: order.buyer_id,
      artistUserId: artist.profile_id,
      senderId: order.buyer_id,
      listingId: order.listing_id,
      content: `The buyer has shipped "${title}" back — ${parsed.data.carrier.toUpperCase()} ${parsed.data.tracking_number}. The refund settles once it arrives and is inspected.`,
      preview: 'Return shipped back',
    });
    // Admins settle, so they are the ones who need to know it is coming.
    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map((a) => ({
          user_id: a.id,
          type: 'refund_approved' as const,
          title: 'Return on its way',
          body: `The buyer shipped "${title}" back (${parsed.data.carrier.toUpperCase()} ${parsed.data.tracking_number}). Record receipt and inspection before settling the refund.`,
          link: '/admin/orders',
        })),
      );
    }
  }

  return NextResponse.json({ ok: true });
}
