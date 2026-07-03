import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { calcSplit } from '@/utils/commissionCalc';
import { isPickupOnly } from '@/utils/fulfillment';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId, shipping } = await request.json();

  const { data: listing } = await supabase
    .from('listings')
    .select('*, artist:artist_profiles(stripe_account_id, slug, fulfillment_pref, profile_id)')
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
    profile_id: string;
  };
  if (artist.profile_id === user.id) {
    return NextResponse.json({ error: 'You cannot purchase your own listing' }, { status: 400 });
  }
  if (!artist.stripe_account_id) {
    return NextResponse.json({ error: 'Artist has not set up payments' }, { status: 400 });
  }

  const pickup = isPickupOnly(artist.fulfillment_pref);
  const shippingCents = pickup ? 0 : (listing.shipping_rate_cents ?? 0);
  if (!pickup && !shipping) {
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
        unit_amount: split.buyerFee,
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

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      automatic_tax: { enabled: true },
      payment_intent_data: {
        // A fixed transfer amount (rather than application_fee_amount) keeps
        // Stripe Tax money with the platform: the artist receives exactly
        // price - commission + shipping, and the platform retains the
        // commission, the buyer fee, and all collected tax for remittance.
        transfer_data: {
          destination: artist.stripe_account_id,
          amount: split.artistPayout,
        },
      },
      metadata: {
        listing_id: listingId,
        buyer_id: user.id,
        shipping_address: shipping ? JSON.stringify(shipping) : '',
        shipping_cents: String(shippingCents),
        pickup: String(pickup),
        // Lock the economics at session creation; the webhook records these
        // instead of re-reading the listing (price may change) or re-running
        // the fee formula (which may change between deploys).
        price_cents: String(listing.price_cents),
        buyer_fee_cents: String(split.buyerFee),
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/orders?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/listing/${listingId}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json(
      { error: 'We could not start checkout. Please try again in a moment.' },
      { status: 502 }
    );
  }
}
