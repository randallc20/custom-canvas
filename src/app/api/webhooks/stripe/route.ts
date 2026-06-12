import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { calculateCommission } from '@/utils/commissionCalc';
import { sendOrderConfirmationEmail, sendNewSaleEmail } from '@/services/email';
import { formatPrice } from '@/utils/formatPrice';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
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
          const shippingRaw = session.metadata?.shipping_address;
          const shippingAddress = shippingRaw ? JSON.parse(shippingRaw) : null;

          await supabase.from('orders').insert({
            listing_id: listingId,
            buyer_id: buyerId,
            artist_id: (listing.artist as unknown as { id: string }).id,
            amount_cents: listing.price_cents,
            platform_fee_cents: platformFeeCents,
            artist_payout_cents: artistPayoutCents,
            stripe_payment_intent_id: session.payment_intent as string,
            shipping_address: shippingAddress,
            status: 'paid',
          });

          await supabase
            .from('listings')
            .update({ status: 'sold' })
            .eq('id', listingId);

          const artistObj = listing.artist as unknown as { id: string };

          // Email buyer
          const { data: buyer } = await supabase.from('profiles').select('email, full_name').eq('id', buyerId).single();
          if (buyer?.email) {
            sendOrderConfirmationEmail(buyer.email, buyer.full_name ?? 'Collector', listing.title, formatPrice(listing.price_cents), listing.id).catch(() => {});
          }

          // Email artist
          const { data: artistProf } = await supabase.from('artist_profiles').select('display_name, profile_id').eq('id', artistObj.id).single();
          if (artistProf) {
            const { data: artistUser } = await supabase.from('profiles').select('email').eq('id', artistProf.profile_id).single();
            if (artistUser?.email) {
              sendNewSaleEmail(artistUser.email, artistProf.display_name, listing.title, formatPrice(listing.price_cents), formatPrice(artistPayoutCents)).catch(() => {});
            }
          }
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
