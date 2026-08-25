import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { listingWriteSchema } from '@/schemas/listingSchema';
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

  const { data: listing } = await supabase
    .from('listings')
    .select('artist_id, title, status, price_cents, last_price_drop_alert_at, artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();

  if (!listing || (listing.artist as unknown as { profile_id: string }).profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }


  const body = await request.json();
  const parsed = listingWriteSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid listing data', details: parsed.error.flatten() }, { status: 400 });
  }
  // Allowlist editable columns — block artist_id reassignment and counters.
  const EDITABLE = [
    'title', 'description', 'medium', 'width_cm', 'height_cm', 'depth_cm',
    'year_created', 'price_cents', 'shipping_rate_cents', 'price_visible',
    'ai_involvement', 'ai_disclosure',
    'sold_price_cents', 'show_sold_price', 'series_id', 'status',
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in parsed.data) updates[key] = parsed.data[key];

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
