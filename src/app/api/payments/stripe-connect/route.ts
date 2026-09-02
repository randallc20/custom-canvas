import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

const STRIPE_DOWN = 'Stripe could not start your payout setup right now — please try again in a minute.';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // stripe_account_id is not client-readable (00033) — read via service role,
  // scoped to the caller's own profile.
  const admin = createAdminSupabaseClient();
  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, stripe_account_id')
    .eq('profile_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 403 });

  let accountId = artist.stripe_account_id;

  if (!accountId) {
    let created: { id: string };
    try {
      created = await getStripe().accounts.create(
        {
          type: 'express',
          email: user.email!,
          // transfers-only: destination charges mean artists never create charges,
          // so card_payments (and its full merchant KYC) is unnecessary — this is
          // the lighter recipient onboarding. Verified in test mode 2026-08-21:
          // bank account (external_account) is still collected.
          capabilities: { transfers: { requested: true } },
          // 14-day payout delay: disputes arrive weeks after delivery; the buffer
          // keeps the money in the artist's Stripe balance long enough that a
          // refund reversal doesn't drive their checking account negative.
          settings: { payouts: { schedule: { interval: 'daily', delay_days: 14 } } },
        },
        // One Express account per artist row, however many times the button
        // is pressed: Stripe replays the first response for this key for 24 h,
        // so a double tap or a retry after a failed row write below gets the
        // SAME account back instead of minting a second one (04-P3).
        { idempotencyKey: `connect_${artist.id}` }
      );
    } catch (err) {
      Sentry.captureException(err, { extra: { where: 'stripe-connect.accounts.create', artistId: artist.id } });
      return NextResponse.json({ error: STRIPE_DOWN }, { status: 502 });
    }
    accountId = created.id;

    // stripe_account_id is a guard-frozen column (00009) — write it with the
    // service-role client. Ownership is already established above (this is the
    // caller's own artist row). Assert the row: a zero-row write would send the
    // artist to onboard on an account no row points at, so account.updated
    // could never flip stripe_onboarded.
    const { data: written, error: writeError } = await admin
      .from('artist_profiles')
      .update({ stripe_account_id: accountId })
      .eq('id', artist.id)
      .select('id')
      .maybeSingle();
    if (writeError || !written) {
      // The account is deliberately NOT deleted here: the idempotency key
      // above means the artist's retry replays this same account, and a
      // deleted account replayed for 24 h would strand them completely. Left
      // alone it is an empty, never-onboarded Express account that the retry
      // adopts — no KYC data, no second account.
      Sentry.captureException(writeError ?? new Error('stripe_account_id write matched zero rows'), {
        extra: { where: 'stripe-connect.write', artistId: artist.id, accountId },
      });
      return NextResponse.json(
        { error: 'We could not save your payout account — please try again.' },
        { status: 502 }
      );
    }
  }

  try {
    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/studio/sales`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/studio/sales?setup=complete`,
      type: 'account_onboarding',
    });
    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    Sentry.captureException(err, { extra: { where: 'stripe-connect.accountLinks.create', artistId: artist.id } });
    return NextResponse.json({ error: STRIPE_DOWN }, { status: 502 });
  }
}
