import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { calculateCommission } from '@/utils/commissionCalc';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const listingId = session.metadata?.listing_id;
      const buyerId = session.metadata?.buyer_id;

      if (listingId && buyerId) {
        const { data: listing } = await supabase
          .from('listings')
          .select('*, artist:artist_profiles(id)')
          .eq('id', listingId)
          .single();

        if (listing) {
          const { platformFeeCents, artistPayoutCents } = calculateCommission(listing.price_cents);

          await supabase.from('orders').insert({
            listing_id: listingId,
            buyer_id: buyerId,
            artist_id: (listing.artist as { id: string }).id,
            amount_cents: listing.price_cents,
            platform_fee_cents: platformFeeCents,
            artist_payout_cents: artistPayoutCents,
            stripe_payment_intent_id: session.payment_intent as string,
            status: 'paid',
          });

          await supabase
            .from('listings')
            .update({ status: 'sold' })
            .eq('id', listingId);
        }
      }
      break;
    }

    case 'account.updated': {
      const account = event.data.object;
      if (account.charges_enabled) {
        await supabase
          .from('artist_profiles')
          .update({ stripe_onboarded: true })
          .eq('stripe_account_id', account.id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
