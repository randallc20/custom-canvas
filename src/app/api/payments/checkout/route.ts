import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { calcSplit } from '@/utils/commissionCalc';
import { isPickupOnly } from '@/utils/fulfillment';
import {
  DEFAULT_FULFILLMENT_WINDOW_DAYS,
  MIN_CONDITION_NOTES_CHARS,
  SIGNATURE_REQUIRED_FROM_CENTS,
} from '@/utils/evaluateProtection';
import { z } from 'zod';

// Only these keys, bounded lengths — the address rides Stripe metadata
// (500-char value cap) and lands in orders.shipping_address verbatim.
const shippingSchema = z.object({
  street: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(40),
  zip: z.string().trim().min(3).max(12),
  country: z.string().trim().min(2).max(2).default('US'),
});

export async function POST(request: NextRequest) {
  // Payments gated until Stripe live activation — flip NEXT_PUBLIC_PAYMENTS_ENABLED.
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Purchasing is not open yet.' }, { status: 403 });
  }
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { listingId, shipping } = await request.json();

  // User-context fetch: RLS enforces visibility (a non-live artist's listing
  // 404s for buyers). The artist row comes via the service role because
  // stripe_account_id is not client-readable (00033 column privacy).
  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .single();

  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  if (listing.status !== 'available') {
    return NextResponse.json({ error: 'This piece is no longer available' }, { status: 400 });
  }
  if (listing.price_visible === false) {
    return NextResponse.json({ error: 'Contact the artist for pricing on this piece' }, { status: 400 });
  }

  const { data: artist } = await createAdminSupabaseClient()
    .from('artist_profiles')
    .select('id, stripe_account_id, stripe_onboarded, slug, fulfillment_pref, profile_id, is_live')
    .eq('id', listing.artist_id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  // Belt-and-braces on the approval gate: even with a direct listing id, a
  // non-live artist cannot take money.
  if (!artist.is_live) {
    return NextResponse.json({ error: 'This artist is not live on the platform yet' }, { status: 403 });
  }
  if (artist.profile_id === user.id) {
    return NextResponse.json({ error: 'You cannot purchase your own listing' }, { status: 400 });
  }
  // stripe_onboarded is flipped by the account.updated webhook once the
  // account can take charges — an account id alone can still be mid-KYC,
  // and Stripe rejects transfers to it with an opaque error.
  if (!artist.stripe_account_id || !artist.stripe_onboarded) {
    return NextResponse.json({ error: 'This artist has not finished setting up payments yet' }, { status: 400 });
  }

  const pickup = isPickupOnly(artist.fulfillment_pref);
  const shippingCents = pickup ? 0 : (listing.shipping_rate_cents ?? 0);
  // Stripe collects the ship-to address at Checkout (shipping_address_collection
  // below) so Stripe Tax sources the jurisdiction from where the art is
  // DELIVERED, and so the recorded address is the one Stripe actually taxed.
  // An address posted by an older client build is still accepted and carried as
  // a fallback for the deploy window, but it is no longer required.
  const parsedShipping = pickup ? null : shippingSchema.safeParse(shipping);
  const shippingAddress = parsedShipping?.success ? parsedShipping.data : null;

  // Seller-protection evidence, SNAPSHOT at purchase. Listings stay editable
  // after a sale, so evaluating against the live listing would let an artist
  // add photos the day a dispute arrives and retroactively qualify.
  const { count: photoCount } = await createAdminSupabaseClient()
    .from('listing_images')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId);
  const evidencePhotoCount = photoCount ?? 0;
  const hasConditionNotes = (listing.description ?? '').trim().length >= MIN_CONDITION_NOTES_CHARS;
  const signatureRequired = listing.price_cents >= SIGNATURE_REQUIRED_FROM_CENTS;

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
      // Pinned deliberately. The buyer fee is grossed up for CARD pricing
      // (2.9% + 30c); BNPL methods cost materially more, and that difference
      // comes straight out of the 15% commission. Leaving this unset lets the
      // Stripe dashboard's payment-method configuration silently change the
      // platform's unit economics with no code change and no review.
      // Apple Pay / Google Pay still appear -- wallets ride along with 'card'.
      // Widen this only alongside a fee model that covers the method.
      payment_method_types: ['card'],
      automatic_tax: { enabled: true },
      // WITHOUT this, Stripe Tax sources tax from the card's BILLING address:
      // a buyer with an out-of-state card shipping into Houston was charged $0
      // Texas tax while the platform -- merchant of record, TX-registered --
      // still owed it. Collecting the destination makes the taxed address and
      // the fulfilled address the same address.
      ...(pickup ? {} : { shipping_address_collection: { allowed_countries: ['US' as const] } }),
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
        shipping_address: shippingAddress ? JSON.stringify(shippingAddress) : '',
        shipping_cents: String(shippingCents),
        pickup: String(pickup),
        // Lock the economics at session creation; the webhook records these
        // instead of re-reading the listing (price may change) or re-running
        // the fee formula (which may change between deploys).
        price_cents: String(listing.price_cents),
        buyer_fee_cents: String(split.buyerFee),
        // The payout below is the EXACT amount transferred by transfer_data
        // above. Recording it (rather than recomputing from PLATFORM_RATE at
        // webhook time) keeps the refund reversal exact even if the commission
        // rate is deployed mid-checkout.
        artist_payout_cents: String(split.artistPayout),
        platform_fee_cents: String(split.platformCommission),
        artist_id: artist.id,
        // Frozen seller-protection evidence — see above.
        evidence_photo_count: String(evidencePhotoCount),
        evidence_has_condition_notes: String(hasConditionNotes),
        fulfillment_window_days: String(DEFAULT_FULFILLMENT_WINDOW_DAYS),
        signature_required: String(signatureRequired),
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
