import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
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
      .select('display_name, profile_id')
      .eq('id', orderFull.artist_id)
      .single();

    if (artistProfile) {
      // email is service-role-only (00031) — the user-context client can't read it.
      const { data: artistUser } = await createAdminSupabaseClient()
        .from('profiles')
        .select('email')
        .eq('id', artistProfile.profile_id)
        .single();

      const { data: reviewer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (artistUser?.email) {
        sendReviewReceivedEmail(
          artistUser.email,
          artistProfile.display_name,
          rating,
          comment || null,
          reviewer?.full_name ?? 'A collector'
        ).catch(() => {});
      }
    }
  }

  return NextResponse.json(review, { status: 201 });
}
