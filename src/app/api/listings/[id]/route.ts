import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { listingWritePatchSchema } from '@/schemas/listingSchema';
import { fanOutNewListingEmails, fanOutPriceDropEmails } from '@/lib/listingAlerts';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

  return NextResponse.json({
    ...data,
    tags: (data.tags as Array<{ tag: unknown }>)?.map((lt) => lt.tag) ?? [],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ruling D11 (L2): a stale acceptance blocks the gated actions. The
  // interstitial is the visible half of this; a client that never renders it
  // still gets refused here.
  const gate = await acceptanceGateFor(user.id);
  if (gate) return NextResponse.json(gate.body, { status: gate.status });

  const { data: listing } = await supabase
    .from('listings')
    .select('artist_id, title, status, price_cents, last_price_drop_alert_at, artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();

  if (!listing || (listing.artist as unknown as { profile_id: string }).profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }


  const body = await request.json();
  const parsed = listingWritePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid listing data', details: parsed.error.flatten() }, { status: 400 });
  }
  // Allowlist editable columns — block artist_id reassignment and counters.
  const EDITABLE = [
    'title', 'description', 'medium', 'width_cm', 'height_cm', 'depth_cm',
    'year_created', 'price_cents', 'shipping_rate_cents', 'price_visible',
    'ai_involvement', 'ai_disclosure',
    'sold_price_cents', 'show_sold_price', 'series_id', 'status',
    // Listing Standards Part one and three (00059 / L4). These were added to
    // the form, the zod schema and the create route but NOT here, so an
    // artist told to tag a nude ticked "mature", was forced to fill in the
    // condition notes, pressed Save, was returned to Studio as if it had
    // worked — and the piece stayed in every default feed, because is_mature
    // was silently dropped. The same save discarded a change from `original`
    // to `reproduction`. Found by the r5 auth pass.
    'edition_type', 'edition_size', 'edition_number', 'is_signed',
    'condition_notes', 'handling_notes', 'is_mature',
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in parsed.data) updates[key] = parsed.data[key];

  // A sold piece with a live order stays sold (04-r3 P2). Putting it back
  // on sale re-entered the feed with an order still holding the one-live-
  // order slot; every later buyer was charged and auto-refunded at the
  // platform's expense. The order's own refund relists it (webhook and
  // settle route) when that is the right answer. Same set as
  // orders_one_live_per_listing (00055).
  if ('status' in updates && listing.status === 'sold' && updates.status !== 'sold') {
    const { count, error: liveError } = await createAdminSupabaseClient()
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', params.id)
      .in('status', ['paid', 'shipped', 'delivered', 'disputed']);
    if (liveError) return NextResponse.json({ error: liveError.message }, { status: 500 });
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'This piece has a live order; it goes back on sale when that order is refunded.' },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mirror the DB triggers' in-app notifications with emails. Each channel
  // event is claimed with an atomic conditional stamp update (service role —
  // the stamps are frozen for user sessions), so concurrent requests and
  // retries can't double-send. Pre-migration-00025 the claims fail soft.
  const publishedNow = 'status' in updates && listing.status !== 'available' && data.status === 'available';
  if (publishedNow) {
    const admin = createAdminSupabaseClient();
    const { data: claim } = await admin
      .from('listings')
      .update({ publish_email_sent_at: new Date().toISOString() })
      .eq('id', params.id)
      .is('publish_email_sent_at', null)
      .select('id');
    if (claim?.length) {
      await fanOutNewListingEmails({ id: data.id, title: data.title, artist_id: data.artist_id });
    }
  }

  const priceDropped =
    typeof updates.price_cents === 'number' &&
    (updates.price_cents as number) < listing.price_cents;
  if (priceDropped) {
    const admin = createAdminSupabaseClient();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: claim } = await admin
      .from('listings')
      .update({ price_drop_email_sent_at: new Date().toISOString() })
      .eq('id', params.id)
      .or(`price_drop_email_sent_at.is.null,price_drop_email_sent_at.lt.${dayAgo}`)
      .select('id');
    if (claim?.length) {
      await fanOutPriceDropEmails({
        id: data.id,
        title: data.title,
        newPriceCents: data.price_cents,
        oldPriceCents: listing.price_cents,
      });
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: listing } = await supabase
    .from('listings')
    .select('artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();

  if (!listing || (listing.artist as unknown as { profile_id: string }).profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('listings').delete().eq('id', params.id);
  if (error) {
    // 23503 = the orders.listing_id FK: a sold piece cannot be deleted, which
    // is correct — it was just surfacing as a 500 with the raw Postgres text.
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'This piece has an order against it and can’t be deleted. Set it to hidden instead.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
