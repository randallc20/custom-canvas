import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { listingWriteSchema } from '@/schemas/listingSchema';
import { fanOutNewListingEmails } from '@/lib/listingAlerts';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// No GET: the public, unbounded catalog dump this file used to serve had no
// caller in the app (02-P2, R7). Reads go through supabase-js under RLS.

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = listingWriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid listing data', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 403 });

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({ ...parsed.data, artist_id: artist.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The DB trigger just created the in-app notifications; mirror them on the
  // email channel behind an atomic claim of publish_email_sent_at so a later
  // PATCH (or a retry) can't re-blast followers. Fails soft pre-migration.
  if (listing.status === 'available') {
    const admin = createAdminSupabaseClient();
    const { data: claim } = await admin
      .from('listings')
      .update({ publish_email_sent_at: new Date().toISOString() })
      .eq('id', listing.id)
      .is('publish_email_sent_at', null)
      .select('id');
    if (claim?.length) {
      await fanOutNewListingEmails({ id: listing.id, title: listing.title, artist_id: listing.artist_id });
    }
  }

  return NextResponse.json(listing, { status: 201 });
}
