import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { settleRefund } from '@/lib/settleRefund';
import { REFUND_REASONS, type RefundReason } from '@/utils/refundSplit';

// Admin settles a refund. The money mechanics — the split, the Stripe refund,
// the exact payout reversal, the close and the relist — live in
// src/lib/settleRefund.ts, shared with the buyer's cancel-unshipped route and
// the fulfilment-window cron (L7). This route is the admin's door to it.
//
// L6: the REASON decides the split and whether artist approval was needed. A
// change-of-mind refund keeps the service fee and its tax and needs the
// artist's approval; every fault reason returns the whole charge and settles
// without them (Artist Agreement §8's four exceptions).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const note = typeof body?.reason === 'string' ? body.reason.trim() : undefined;

  const refundReason: RefundReason | null =
    typeof body?.refund_reason === 'string' && REFUND_REASONS.includes(body.refund_reason as RefundReason)
      ? (body.refund_reason as RefundReason)
      : null;
  if (!refundReason) {
    return NextResponse.json(
      { error: `A refund reason is required. One of: ${REFUND_REASONS.join(', ')}.` },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();

  // Who set it in motion: the artist if they approved it, otherwise the
  // platform acting on its own (a substantiated fault, an obvious error).
  const { data: order } = await admin
    .from('orders')
    .select('refund_approved_at')
    .eq('id', params.id)
    .maybeSingle();

  const result = await settleRefund(admin, {
    orderId: params.id,
    reason: refundReason,
    initiatedBy: order?.refund_approved_at ? 'artist' : 'platform',
    note,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    refunded_cents: result.refundedCents,
    tax_refunded_cents: result.taxRefundedCents,
    payout_reversed_cents: result.payoutReversedCents,
  });
}
