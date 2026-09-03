import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { reviewSchema } from '@/schemas/reviewSchema';
import { sendReviewReceivedEmail } from '@/services/email';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const artistId = request.nextUrl.searchParams.get('artist_id');

  if (!artistId) {
    return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reviews')
    .select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name)')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ruling D11 (L2): a stale acceptance blocks the gated actions. The
  // interstitial is the visible half of this; a client that never renders it
  // still gets refused here.
  const gate = await acceptanceGateFor(user.id);
  if (gate) return NextResponse.json(gate.body, { status: gate.status });

  const body = await request.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { order_id, rating, comment } = parsed.data;

  // Verify order belongs to user and is delivered
  const { data: order } = await supabase
    .from('orders')
    .select('id, buyer_id, status')
    .eq('id', order_id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.buyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (order.status !== 'delivered') {
    return NextResponse.json({ error: 'Can only review delivered orders' }, { status: 400 });
  }

  // Check for existing review
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('order_id', order_id)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });

  const { data: review, error } = await supabase
    .from('reviews')
    .insert({
      order_id,
      reviewer_id: user.id,
      rating,
      comment: comment || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email the artist about the review
  const { data: orderFull } = await supabase
    .from('orders')
    .select('artist_id')
    .eq('id', order_id)
    .single();

  if (orderFull) {
    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('display_name, profile_id, slug')
      .eq('id', orderFull.artist_id)
      .single();

    if (artistProfile) {
      const admin = createAdminSupabaseClient();
      // email is service-role-only (00031) — the user-context client can't read it.
      const { data: artistUser } = await admin
        .from('profiles')
        .select('email')
        .eq('id', artistProfile.profile_id)
        .single();

      const { data: reviewer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      // In-app notification (service role — notifications has no client
      // INSERT policy and the row belongs to the artist). 'review_received'
      // has been in the CHECK list since 00002 and in both icon maps; nothing
      // produced one until now. Best-effort: the review itself is written.
      const reviewerName = reviewer?.full_name ?? 'A collector';
      const { error: notifError } = await admin.from('notifications').insert({
        user_id: artistProfile.profile_id,
        type: 'review_received',
        title: `New ${rating}-star review`,
        body: comment
          ? `${reviewerName}: “${comment.length > 140 ? comment.slice(0, 137) + '…' : comment}”`
          : `${reviewerName} left you a ${rating}-star review.`,
        link: `/artist/${artistProfile.slug}`,
      });
      if (notifError) Sentry.captureException(notifError, { extra: { where: 'reviews.notify', reviewId: review.id } });

      if (artistUser?.email) {
        sendReviewReceivedEmail(
          artistUser.email,
          artistProfile.display_name,
          rating,
          comment || null,
          reviewerName
        ).catch((e) => Sentry.captureException(e));
      }
    }
  }

  return NextResponse.json(review, { status: 201 });
}
