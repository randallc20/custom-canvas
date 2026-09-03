import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// Self-service account deletion. The old client-side
// `profiles.delete()` was a silent zero-row no-op (profiles has no DELETE
// policy, deliberately) and never touched auth.users — the account looked
// deleted because the page signed out, but logging back in worked fine.
// Deleting the auth user cascades through profiles → artist/gallery rows →
// listings → images (ON DELETE CASCADE chain from 00001). Orders, reviews
// and commissions do NOT cascade (00049): their party columns detach to
// NULL so a chargeback can still find the order by payment intent.

// An order that still has money in motion: paid but not delivered, in a
// dispute, or an approved refund the admin has not settled yet. Its parties
// must stay reachable, so neither of them may self-delete meanwhile.
const OPEN_ORDER_FILTER =
  'status.in.(paid,shipped,disputed),and(refund_approved_at.not.is.null,status.neq.refunded)';

// Not exported: a route file may only export handlers. The account page and
// e2e 14.11b match on "open order" / the support address.
const OPEN_ORDER_MESSAGE =
  'Your account can’t be deleted while it has an open order (paid, shipped, disputed, or with a refund being settled). ' +
  'Once every order is delivered or refunded you can try again, or email support@customcanvas.shop and we’ll help.';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role === 'admin') {
    // An admin deleting themselves could orphan the whole admin panel.
    return NextResponse.json(
      { error: 'Admin accounts can’t self-delete — demote the account first.' },
      { status: 403 }
    );
  }

  const admin = createAdminSupabaseClient();

  // Party to an open order as buyer, or as the artist behind it
  // (orders.artist_id is the artist_profiles id, not the profile id).
  const { data: artistRows, error: artistErr } = await admin
    .from('artist_profiles')
    .select('id')
    .eq('profile_id', user.id);
  if (artistErr) return NextResponse.json({ error: artistErr.message }, { status: 500 });
  const artistIds = (artistRows ?? []).map((r) => r.id as string);
  const partyFilter = artistIds.length
    ? `buyer_id.eq.${user.id},artist_id.in.(${artistIds.join(',')})`
    : `buyer_id.eq.${user.id}`;

  // Two .or() calls AND together in PostgREST: (party) AND (open).
  const { count, error: openErr } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .or(partyFilter)
    .or(OPEN_ORDER_FILTER);
  // Unknown state must not delete: fail closed.
  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: OPEN_ORDER_MESSAGE }, { status: 409 });
  }

  // Detach any DMCA notices from this account's listings BEFORE the cascade.
  //
  // 00067 made dmca_notices.listing_id ON DELETE RESTRICT so a removal record
  // could not be orphaned by an artist deleting the listing. A foreign key
  // does not care who initiated the delete, so the cascade behind
  // deleteUser hit it too: an artist who had ever had a listing removed on a
  // copyright notice could never delete their account, and the route handed
  // them the raw FK error as a 500. Same shape as the deviation 00049 had to
  // make for orders.listing_id.
  //
  // Deletion is a promise on the account page, so it wins — but the notice
  // does not lose its subject: the listing's title goes into the notes, and
  // subject_profile_id (ON DELETE SET NULL) keeps the repeat-infringer count
  // honest for as long as the person exists.
  if (artistIds.length) {
    const { data: listingRows } = await admin
      .from('listings')
      .select('id, title')
      .in('artist_id', artistIds);
    const titleById = new Map((listingRows ?? []).map((l) => [l.id as string, l.title as string]));

    if (titleById.size) {
      const { data: notices, error: noticeErr } = await admin
        .from('dmca_notices')
        .select('id, listing_id, notes')
        .in('listing_id', Array.from(titleById.keys()));
      // Fail closed: a delete that trips the FK later is a 500 with no
      // explanation, which is what this exists to prevent.
      if (noticeErr) {
        return NextResponse.json({ error: noticeErr.message }, { status: 500 });
      }
      for (const n of notices ?? []) {
        const title = titleById.get(n.listing_id as string) ?? 'a deleted listing';
        const note = `${n.notes ? `${n.notes}\n\n` : ''}[account deleted ${new Date().toISOString().slice(0, 10)}] listing was "${title}" (${n.listing_id}).`;
        const { error: detachErr } = await admin
          .from('dmca_notices')
          .update({ listing_id: null, notes: note })
          .eq('id', n.id);
        if (detachErr) {
          return NextResponse.json({ error: detachErr.message }, { status: 500 });
        }
      }
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
