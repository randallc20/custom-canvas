import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';
import { calculateCommission } from '@/utils/commissionCalc';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId, shipping } = await request.json();

  const { data: listing } = await supabase
    .from('listings')
    .select('*, artist:artist_profiles(stripe_account_id, slug)')
    .eq('id', listingId)
    .single();

  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  if (listing.status !== 'available') {
    return NextResponse.json({ error: 'This piece is no longer available' }, { status: 400 });
  }

  const artist = listing.artist as unknown as { stripe_account_id: string | null; slug: string };
  if (!artist.stripe_account_id) {
    return NextResponse.json({ error: 'Artist has not set up payments' }, { status: 400 });
  }

  const { platformFeeCents } = calculateCommission(listing.price_cents);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: listing.title },
          unit_amount: listing.price_cents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      transfer_data: { destination: artist.stripe_account_id },
    },
    metadata: {
      listing_id: listingId,
      buyer_id: user.id,
      shipping_address: shipping ? JSON.stringify(shipping) : '',
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/orders?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/listing/${listingId}`,
  });

  return NextResponse.json({ url: session.url });
}
