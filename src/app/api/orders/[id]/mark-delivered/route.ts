import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// The artist confirms delivery of a shipped order. Lives server-side because
// `delivered_at` is seller-protection evidence (requirement 3) and, as of
// 00050, frozen for non-privileged writers together with the `delivered`
// status itself: the client can no longer write either, so a self-attested
// delivery is at least a once-only, server-stamped act rather than a
// client-editable timestamp (DECISIONS.md 2026-09-02, ruling D1).
//
// Compare-and-swap on `status = 'shipped'` with the service-role client; the
// 00022 trigger stamps delivered_at on the transition (db-smoke pins that it
// still fires under the service role).
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artist = order.artist as unknown as { profile_id: string } | null;
  if (artist?.profile_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (order.status === 'delivered') return NextResponse.json({ ok: true, alreadyDelivered: true });
  if (order.status !== 'shipped') {
    return NextResponse.json({ error: 'Only shipped orders can be marked delivered.' }, { status: 409 });
  }

  const { data: updated, error } = await admin
    .from('orders')
    .update({ status: 'delivered' })
    .eq('id', order.id)
    .eq('status', 'shipped')
    .select('id, delivered_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    // Lost the race to a refund, dispute or a concurrent call.
    return NextResponse.json({ error: 'The order changed before it could be marked delivered — refresh and try again.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, delivered_at: updated.delivered_at });
}
