import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { SIGNATURE_REQUIRED_FROM_CENTS } from '@/utils/evaluateProtection';
import { assessProtection } from '@/lib/assessProtection';

/** Record signature confirmation from the carrier's record (ruling D7, L5).
 *
 *  Seller-protection requirement 4 asks for signature confirmation on orders
 *  of $750 or more. The artist's part is buying the service when they buy the
 *  label; Custom Canvas's part is reading the carrier's signature record and
 *  recording it here. That division is why the requirement is never listed in
 *  Studio under "To protect this order" — there is nothing the artist can
 *  click to satisfy it.
 *
 *  Ruling D6 waived the requirement precisely because this route did not
 *  exist. It exists now, and the runbook's chargeback section says to use it
 *  before responding to a dispute on a high-value order.
 *
 *  Compare-and-swap on `signature_confirmed = false`: recording twice is a
 *  no-op with a clear answer rather than a silently moved timestamp. The
 *  columns are frozen for every non-privileged writer (00060), so this route
 *  and the service role are the only path.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, amount_cents, signature_required, signature_confirmed, protection_status')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!order.signature_required) {
    // signature_required is snapshotted at checkout from the listing price,
    // so it — not today's amount — is the authority on whether requirement 4
    // ever applied to this order.
    return NextResponse.json(
      {
        error: `Signature confirmation is only part of seller protection on orders of $${SIGNATURE_REQUIRED_FROM_CENTS / 100} or more. This order is below the threshold.`,
      },
      { status: 409 },
    );
  }
  if (order.signature_confirmed) {
    return NextResponse.json({ error: 'Signature confirmation is already recorded.' }, { status: 409 });
  }

  const { data: updated, error } = await admin
    .from('orders')
    .update({
      signature_confirmed: true,
      signature_confirmed_at: new Date().toISOString(),
      signature_confirmed_by: user.id,
    })
    .eq('id', params.id)
    .eq('signature_confirmed', false)
    .select('id, signature_confirmed_at')
    .maybeSingle();

  if (error) {
    Sentry.captureException(error, { extra: { where: 'admin.signatureConfirmed', orderId: params.id } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    // The CAS lost: another admin recorded it between the read and the write.
    return NextResponse.json({ error: 'Signature confirmation is already recorded.' }, { status: 409 });
  }

  // A dispute freezes the protection verdict the instant the webhook lands —
  // which is long before anyone could open the carrier's tracking page. If we
  // stopped here, recording the signature after a dispute arrived would change
  // nothing, requirement 4 could never actually be satisfied in practice, and
  // the runbook step telling an admin to do this before responding would be
  // theatre. So re-assess against the row as it now stands.
  //
  // Only ever upgrades, and only from `ineligible`: a `protected` verdict is
  // already the best outcome for the artist, and `pending` is the
  // dispute-created handler's to write (it CASes on `pending`, so writing it
  // here would race it).
  let reassessed: string | null = null;
  let stillFailing: string[] = [];
  if (order.status === 'disputed' && order.protection_status === 'ineligible') {
    const assessment = await assessProtection(admin, params.id);
    // Requirement 6 is measured from the live message history, so it can have
    // started failing since the dispute froze the verdict — and then this
    // route silently declined the upgrade it exists to grant while telling
    // the admin it had worked (r9 money pass, P1). Report what is still
    // missing so they can see why.
    stillFailing = assessment?.failures ?? [];
    if (assessment?.status === 'protected') {
      const { error: reassessError } = await admin
        .from('orders')
        .update({ protection_status: 'protected' })
        .eq('id', params.id)
        .eq('protection_status', 'ineligible');
      if (reassessError) {
        // The signature IS recorded; only the verdict lagged. Loud, but not a
        // failure of the caller's action — retrying the whole route would now
        // 409 on the CAS above and lose this information entirely.
        Sentry.captureException(reassessError, {
          extra: { where: 'admin.signatureConfirmed.reassess', orderId: params.id },
        });
      } else {
        reassessed = 'protected';
      }
    }
  }

  return NextResponse.json({
    ok: true,
    signature_confirmed_at: updated.signature_confirmed_at,
    protection_status: reassessed,
    still_failing: stillFailing,
    ...(order.status === 'disputed' && !reassessed && stillFailing.length
      ? {
          warning: `Signature confirmation is recorded, but this order is still NOT protected: ${stillFailing.join(' ')}`,
        }
      : {}),
  });
}
