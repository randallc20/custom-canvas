import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { formatPrice } from '@/utils/formatPrice';

// The artist agrees to a buyer's refund request (made in chat). This flags
// the order and notifies admins to settle the payment — artists can't move
// money themselves.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, amount_cents, refund_approved_at, artist:artist_profiles(profile_id, display_name), listing:listings(title)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artist = order.artist as unknown as { profile_id: string; display_name: string };
  if (artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!['paid', 'shipped', 'delivered'].includes(order.status)) {
    return NextResponse.json({ error: 'This order cannot be refunded.' }, { status: 409 });
  }
  if (order.refund_approved_at) {
    return NextResponse.json({ error: 'Refund already approved — Custom Canvas is settling it.' }, { status: 409 });
  }

  const admin = createAdminSupabaseClient();
  const { data: updated, error } = await admin
    .from('orders')
    .update({ refund_approved_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('refund_approved_at', null)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Refund already approved.' }, { status: 409 });

  // Every admin gets the settle-payment task in their bell.
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
  if (admins?.length) {
    const title = (order.listing as unknown as { title: string } | null)?.title ?? 'an order';
    await admin.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        type: 'refund_approved',
        title: 'Refund to settle',
        body: `${artist.display_name} approved a refund for "${title}" (${formatPrice(order.amount_cents)}). Settle the payment in admin.`,
        link: '/admin/orders',
      }))
    );
  }

  return NextResponse.json(updated);
}
