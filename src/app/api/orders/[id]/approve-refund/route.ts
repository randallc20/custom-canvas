import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { formatPrice } from '@/utils/formatPrice';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { authorizeReturn } from '@/lib/orderReturns';
import { buyerTookPossession, pickupPossessionUnknown } from '@/utils/fulfillment';

const returnAddressSchema = z.object({
  name: z.string().trim().min(1).max(120),
  street: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(40),
  zip: z.string().trim().min(3).max(12),
  country: z.string().trim().length(2).optional(),
});

// The artist agrees to a buyer's refund request (made in chat). This flags
// the order and notifies admins to settle the payment — artists can't move
// money themselves.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, shipped_at, is_pickup, pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at, amount_cents, refund_approved_at, artist:artist_profiles(profile_id, display_name), listing:listings(title)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artist = order.artist as unknown as { profile_id: string; display_name: string };
  if (artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!['paid', 'shipped', 'delivered'].includes(order.status)) {
    return NextResponse.json({ error: 'This order cannot be refunded.' }, { status: 409 });
  }
  if (order.refund_approved_at) {
    return NextResponse.json({ error: 'Refund already approved — Custom Canvas is settling it.' }, { status: 409 });
  }

  // L8 / ruling D9: a change-of-mind refund is conditioned on the piece coming
  // back, and the artist is the one who has to say where. Asked for HERE, at
  // the moment of approval, because it is the only moment the artist is
  // certainly present — and never taken from their public profile, which is
  // not an address they agreed to publish by listing a painting.
  const body = await request.json().catch(() => null);

  // Only ask for an address when there is something to send back — which is
  // "did the buyer take possession", NOT "did it ship". An unshipped order
  // has nothing to return (r5 P1), but a COLLECTED pickup piece does, and
  // keying on shipped_at alone let the buyer keep the artwork and the money
  // (r6 P0).
  // For a pickup nobody has confirmed, only the artist knows. Default to
  // requiring the return and let them say otherwise explicitly — the cost of
  // being wrong that way is a return they can waive, rather than the buyer
  // keeping both the piece and the money (r7 money pass, P0).
  const needsReturn =
    buyerTookPossession(order) ||
    (pickupPossessionUnknown(order) && body?.piece_not_collected !== true);
  const address = returnAddressSchema.safeParse(body?.return_address);
  if (needsReturn && !address.success) {
    return NextResponse.json(
      {
        error:
          'A return address is required to approve a refund: the buyer is sending the piece back, and Custom Canvas has to tell them where. It is shown only to this buyer, only after you approve.',
        code: 'return_address_required',
      },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: updated, error } = await admin
    .from('orders')
    .update({
      refund_approved_at: new Date().toISOString(),
      // The artist agreeing to a buyer's request IS the discretionary
      // change-of-mind path (Artist Agreement §8) — the service fee stays.
      // A fault refund does not come through here: Custom Canvas settles
      // those whether or not the artist agrees, from the admin page (L6).
      refund_reason: 'change_of_mind',
      refund_initiated_by: 'artist',
    })
    .eq('id', params.id)
    .is('refund_approved_at', null)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'Refund already approved.' }, { status: 409 });

  // ALWAYS write the return record, even when no return is owed.
  //
  // The decision made here — including the artist's "the buyer never
  // collected this piece" — used to be read and thrown away, so the settle
  // door re-derived possession from the row and reached the opposite
  // conclusion: for an unconfirmed pickup it decided a return WAS owed,
  // refused to settle, and the only unblock was authorising a return for a
  // piece the buyer never had, emailing them an address and a seven-day
  // clock. Recording `required: false` is what makes the two doors agree
  // (r10 money / r8 auth, P1).
  const authorized = await authorizeReturn(admin, {
    orderId: params.id,
    reason: 'change_of_mind',
    authorizedBy: user.id,
    returnAddress: address.success ? address.data : undefined,
    instructions: typeof body?.instructions === 'string' ? body.instructions : undefined,
    required: needsReturn,
  });
  if (!authorized.ok) {
    // The approval IS recorded — do not fail it over the return record, or
    // a retry would hit "already approved" and lose both. Loud instead.
    Sentry.captureException(new Error(`Return authorisation failed after approval on ${params.id}: ${authorized.error}`));
  }

  // Every admin gets the settle-payment task in their bell.
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
  if (admins?.length) {
    const title = (order.listing as unknown as { title: string } | null)?.title ?? 'an order';
    await admin.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        type: 'refund_approved',
        title: 'Refund to settle',
        body: `${artist.display_name} approved a refund for "${title}" (${formatPrice(order.amount_cents)}). Settle the payment in admin.`,
        link: '/admin/orders',
      }))
    );
  }

  return NextResponse.json(updated);
}
