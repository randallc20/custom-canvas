import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
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
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
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
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/payouts`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/payouts?setup=complete`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
