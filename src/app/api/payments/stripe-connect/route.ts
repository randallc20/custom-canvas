import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // stripe_account_id is not client-readable (00033) — read via service role,
  // scoped to the caller's own profile.
  const { data: artist } = await createAdminSupabaseClient()
    .from('artist_profiles')
    .select('id, stripe_account_id')
    .eq('profile_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 403 });

  let accountId = artist.stripe_account_id;

  if (!accountId) {
    const account = await getStripe().accounts.create({
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
    });
    accountId = account.id;

    // stripe_account_id is a guard-frozen column (00009) — write it with the
    // service-role client. Ownership is already established above (this is the
    // caller's own artist row).
    await createAdminSupabaseClient()
      .from('artist_profiles')
      .update({ stripe_account_id: accountId })
      .eq('id', artist.id);
  }

  const accountLink = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/studio/sales`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/studio/sales?setup=complete`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
