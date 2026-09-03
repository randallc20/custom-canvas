import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { authorizeReturn } from '@/lib/orderReturns';
import { REFUND_REASONS, type RefundReason } from '@/utils/refundSplit';

/** Admin actions on a return (L8, ruling D13's admin-run minimum).
 *
 *  Three things, all of which the documents put on Custom Canvas rather than
 *  on either party:
 *
 *  - `authorize`: require a return on a FAULT refund, with the address we
 *    tell the buyer to use. The artist supplies the address on a
 *    change-of-mind approval; we supply it when we are the ones deciding.
 *  - `receive`: record delivery and the reasonable inspection §5 makes the
 *    refund conditional on. Accepted unblocks the settle; rejected does not,
 *    deliberately — a rejected inspection is a support conversation, not an
 *    automatic outcome.
 *  - `waive`: the four grounds the documents allow, and a reason is required.
 *    "Unnecessary" is the common one: a piece that never arrived has nothing
 *    to come back.
 */

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('authorize'),
    reason: z.enum(REFUND_REASONS as [RefundReason, ...RefundReason[]]),
    required: z.boolean().optional(),
    instructions: z.string().trim().max(2000).optional(),
    return_address: z.object({
      name: z.string().trim().min(1).max(120),
      street: z.string().trim().min(1).max(200),
      city: z.string().trim().min(1).max(100),
      state: z.string().trim().min(1).max(40),
      zip: z.string().trim().min(3).max(12),
      country: z.string().trim().length(2).optional(),
    }),
  }),
  z.object({
    action: z.literal('receive'),
    outcome: z.enum(['accepted', 'rejected']),
    notes: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal('waive'),
    waived_reason: z.enum(['unlawful', 'unsafe', 'impracticable', 'unnecessary']),
    notes: z.string().trim().max(2000).optional(),
  }),
]);

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminSupabaseClient();

  if (parsed.data.action === 'authorize') {
    const result = await authorizeReturn(admin, {
      orderId: params.id,
      reason: parsed.data.reason,
      authorizedBy: user.id,
      returnAddress: parsed.data.return_address,
      instructions: parsed.data.instructions,
      required: parsed.data.required,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, ret: result.ret });
  }

  if (parsed.data.action === 'receive') {
    const { data: updated, error } = await admin
      .from('order_returns')
      .update({
        received_at: new Date().toISOString(),
        inspection_outcome: parsed.data.outcome,
        ...(parsed.data.notes ? { inspection_notes: parsed.data.notes } : {}),
      })
      .eq('order_id', params.id)
      .not('authorized_at', 'is', null)
      .select('id')
      .maybeSingle();
    if (error) {
      Sentry.captureException(error, { extra: { where: 'admin.return.receive', orderId: params.id } });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'There is no authorised return on this order.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  // waive
  const { data: updated, error } = await admin
    .from('order_returns')
    .update({
      waived_at: new Date().toISOString(),
      waived_reason: parsed.data.waived_reason,
      ...(parsed.data.notes ? { inspection_notes: parsed.data.notes } : {}),
    })
    .eq('order_id', params.id)
    .select('id')
    .maybeSingle();
  if (error) {
    Sentry.captureException(error, { extra: { where: 'admin.return.waive', orderId: params.id } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'There is no return record on this order to waive.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
