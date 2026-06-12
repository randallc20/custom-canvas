import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { calcSplit, BUYER_FEE_CENTS } from '@/utils/commissionCalc';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId, shipping } = await request.json();

  const { data: listing } = await supabase
    .from('listings')
    .select('*, artist:artist_profiles(stripe_account_id, slug, fulfillment_pref)')
    .eq('id', listingId)
    .single();

  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  if (listing.status !== 'available') {
    return NextResponse.json({ error: 'This piece is no longer available' }, { status: 400 });
  }
  if (listing.price_visible === false) {
    return NextResponse.json({ error: 'Contact the artist for pricing on this piece' }, { status: 400 });
  }

  const artist = listing.artist as unknown as {
    stripe_account_id: string | null;
    slug: string;
    fulfillment_pref: string | null;
  };
  if (!artist.stripe_account_id) {
    return NextResponse.json({ error: 'Artist has not set up payments' }, { status: 400 });
  }

  const isPickup = artist.fulfillment_pref === 'pickup_only';
  const shippingCents = isPickup ? 0 : (listing.shipping_rate_cents ?? 0);
  if (!isPickup && !shipping) {
    return NextResponse.json({ error: 'Shipping address is required' }, { status: 400 });
  }

  const split = calcSplit(listing.price_cents, shippingCents);

  const lineItems = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: listing.title },
        unit_amount: listing.price_cents,
      },
      quantity: 1,
    },
    {
      price_data: {
        currency: 'usd',
        product_data: { name: 'Service fee' },
        unit_amount: BUYER_FEE_CENTS,
      },
      quantity: 1,
    },
  ];
  if (shippingCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Shipping' },
        unit_amount: shippingCents,
      },
      quantity: 1,
    });
  }

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    automatic_tax: { enabled: true },
    payment_intent_data: {
      // Commission + buyer fee stay with the platform; price - commission
      // + shipping flows to the artist.
      application_fee_amount: split.platformRevenue,
      transfer_data: { destination: artist.stripe_account_id },
    },
    metadata: {
      listing_id: listingId,
      buyer_id: user.id,
      shipping_address: shipping ? JSON.stringify(shipping) : '',
      shipping_cents: String(shippingCents),
      pickup: isPickup ? 'true' : 'false',
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/orders?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/listing/${listingId}`,
  });

  return NextResponse.json({ url: session.url });
}
