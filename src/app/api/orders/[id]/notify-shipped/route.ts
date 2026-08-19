import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendShippingUpdateEmail } from '@/services/email';

// Sends the buyer's "your order shipped" email. Lives server-side because
// (a) Resend can only be called from the server — the old client-side call in
// services/orders.ts never actually sent, and (b) buyer email is
// service-role-only under 00031 column privacy. Caller: the artist's sales UI
// right after it marks the order shipped (RLS lets artists update status).
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, buyer_id, listing_id, tracking_number, artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only the artist on the order may trigger the buyer email, and only once
  // the order is actually shipped.
  const artist = order.artist as unknown as { profile_id: string } | null;
  if (artist?.profile_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (order.status !== 'shipped') return NextResponse.json({ error: 'Order is not shipped' }, { status: 409 });

  const [{ data: buyer }, { data: listing }] = await Promise.all([
    admin.from('profiles').select('email, full_name').eq('id', order.buyer_id).single(),
    admin.from('listings').select('title').eq('id', order.listing_id!).single(),
  ]);
  if (!buyer?.email) return NextResponse.json({ ok: true });

  await sendShippingUpdateEmail(
    buyer.email,
    buyer.full_name ?? 'Collector',
    listing?.title ?? 'Your artwork',
    order.tracking_number
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
