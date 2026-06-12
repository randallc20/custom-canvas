import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { buildOrderRecord } from '@/utils/orderRecord';
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

  // Webhooks carry no user session — the cookie client would be blocked by RLS.
  const supabase = createAdminSupabaseClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const listingId = session.metadata?.listing_id;

      if (listingId) {
        const { data: listing } = await supabase
          .from('listings')
          .select('*, artist:artist_profiles(id)')
          .eq('id', listingId)
          .single();

        if (listing) {
          const artistObj = listing.artist as unknown as { id: string };
          const order = buildOrderRecord(
            { payment_intent: session.payment_intent as string | null, metadata: session.metadata },
            listing,
            artistObj.id
          );

          if (order) {
            await supabase.from('orders').insert(order);

            await supabase
              .from('listings')
              .update({ status: 'sold', sold_price_cents: listing.price_cents })
              .eq('id', listingId);

            // Email buyer
            const { data: buyer } = await supabase.from('profiles').select('email, full_name').eq('id', order.buyer_id).single();
            if (buyer?.email) {
              sendOrderConfirmationEmail(buyer.email, buyer.full_name ?? 'Collector', listing.title, formatPrice(order.amount_cents + order.buyer_fee_cents + order.shipping_cents), listing.id).catch(() => {});
            }

            // Email artist
            const { data: artistProf } = await supabase.from('artist_profiles').select('display_name, profile_id').eq('id', artistObj.id).single();
            if (artistProf) {
              const { data: artistUser } = await supabase.from('profiles').select('email').eq('id', artistProf.profile_id).single();
              if (artistUser?.email) {
                sendNewSaleEmail(artistUser.email, artistProf.display_name, listing.title, formatPrice(order.amount_cents), formatPrice(order.artist_payout_cents)).catch(() => {});
              }
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
