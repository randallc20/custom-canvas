import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { addBusinessDays } from '@/utils/evaluateProtection';

/**
 * DMCA notice log and the actions on it (L11).
 *
 * Admin-only, and the table is admin-only at the RLS layer too: a notice
 * carries a claimant's contact details and an accusation against a user, so
 * neither party reads the file.
 *
 * The two things that are more than bookkeeping:
 *  - removing the material sets `listings.dmca_removed_at`, which the 00065
 *    guard uses to stop the artist republishing it from Studio;
 *  - restoring is only offered inside the window the policy commits to,
 *    "not less than 10 and not more than 14 business days after receiving the
 *    counter-notice" — a restore outside that is either premature or overdue,
 *    and both matter.
 */

const RESTORE_MIN_BUSINESS_DAYS = 10;
const RESTORE_MAX_BUSINESS_DAYS = 14;

const createSchema = z.object({
  subject_profile_id: z.string().uuid().nullable().optional(),
  listing_id: z.string().uuid().nullable().optional(),
  claimant_name: z.string().trim().min(1).max(200),
  claimant_email: z.string().trim().email().max(200),
  kind: z.enum(['notice', 'counter_notice']).default('notice'),
  notes: z.string().trim().max(5000).optional(),
});

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['remove_material', 'counter_received', 'restore', 'withdraw', 'defective']),
  notes: z.string().trim().max(5000).optional(),
});

async function requireAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: user.id };
}

/** The storage path inside `listing-images` for a stored public URL. */
function imagePath(url: string): string | null {
  const marker = '/listing-images/';
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

/**
 * Move a removed listing's images into the private `dmca-quarantine` bucket.
 *
 * §512(c)(1)(C) asks for the material to be removed OR access to it disabled.
 * `listing-images` is a PUBLIC bucket, and a public Supabase bucket serves
 * object GETs with no policy evaluation at all — so hiding the listing row
 * did neither: the claimant could re-check the very URL they sent us and find
 * the work still served. Found by the r4 auth pass.
 *
 * Copy-then-delete rather than delete, so a successful counter-notice can put
 * the images back. Returns the paths moved.
 */
async function quarantineImages(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  listingId: string,
): Promise<string[]> {
  const { data: images } = await admin
    .from('listing_images')
    .select('image_url')
    .eq('listing_id', listingId);

  const moved: string[] = [];
  for (const img of images ?? []) {
    const path = imagePath(img.image_url as string);
    if (!path) continue;
    const { data: blob, error: dlError } = await admin.storage.from('listing-images').download(path);
    if (dlError || !blob) {
      Sentry.captureException(dlError ?? new Error('quarantine: download returned nothing'), {
        extra: { where: 'admin.dmca.quarantine', listingId, path },
      });
      continue;
    }
    const { error: upError } = await admin.storage
      .from('dmca-quarantine')
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (upError) {
      Sentry.captureException(upError, { extra: { where: 'admin.dmca.quarantine.upload', path } });
      continue;
    }
    // Only now is it safe to take the public copy down.
    const { error: rmError } = await admin.storage.from('listing-images').remove([path]);
    if (rmError) {
      Sentry.captureException(rmError, { extra: { where: 'admin.dmca.quarantine.remove', path } });
      continue;
    }
    moved.push(path);
  }
  return moved;
}

/** Put quarantined images back when a counter-notice succeeds. */
async function restoreImages(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  paths: string[],
): Promise<void> {
  for (const path of paths) {
    const { data: blob, error: dlError } = await admin.storage.from('dmca-quarantine').download(path);
    if (dlError || !blob) {
      Sentry.captureException(dlError ?? new Error('restore: quarantined object missing'), {
        extra: { where: 'admin.dmca.restoreImages', path },
      });
      continue;
    }
    const { error: upError } = await admin.storage
      .from('listing-images')
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (upError) {
      Sentry.captureException(upError, { extra: { where: 'admin.dmca.restoreImages.upload', path } });
      continue;
    }
    await admin.storage.from('dmca-quarantine').remove([path]);
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('dmca_notices')
    .select('*, subject:profiles!dmca_notices_subject_profile_id_fkey(full_name), listing:listings(title, status, dmca_removed_at)')
    .order('received_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The repeat-infringer count comes from the SQL function, so the page can
  // never drift from the policy's own definition of what counts.
  const subjects = Array.from(
    new Set((data ?? []).map((n) => n.subject_profile_id).filter(Boolean)),
  ) as string[];
  const counts: Record<string, number> = {};
  for (const id of subjects) {
    const { data: count } = await admin.rpc('dmca_substantiated_count', { p_profile_id: id });
    counts[id] = (count as number) ?? 0;
  }

  return NextResponse.json({ notices: data ?? [], counts });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('dmca_notices')
    .insert({
      ...parsed.data,
      subject_profile_id: parsed.data.subject_profile_id ?? null,
      listing_id: parsed.data.listing_id ?? null,
      acted_by: auth.userId,
      status: parsed.data.kind === 'counter_notice' ? 'counter_received' : 'received',
    })
    .select('id')
    .single();
  if (error) {
    Sentry.captureException(error, { extra: { where: 'admin.dmca.create' } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, action, notes } = parsed.data;

  const admin = createAdminSupabaseClient();
  const { data: notice } = await admin
    .from('dmca_notices')
    .select('id, listing_id, status, received_at, quarantined_paths')
    .eq('id', id)
    .single();
  if (!notice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const stamp = (status: string) => ({
    status,
    acted_by: auth.userId,
    ...(notes ? { notes } : {}),
  });

  if (action === 'remove_material') {
    if (!notice.listing_id) {
      return NextResponse.json(
        { error: 'This notice is not attached to a listing — attach one, or act on the account instead.' },
        { status: 409 },
      );
    }
    // Remember what it WAS. Restoring to 'available' unconditionally put a
    // SOLD piece back on sale — the next buyer pays for a painting that
    // shipped weeks ago, the order insert trips orders_one_live_per_listing
    // and the webhook auto-refunds them with the platform eating the
    // processing fees (r3 auth pass, P1). Same shape as
    // orders.pre_dispute_status, which exists for exactly this reason.
    const { data: before } = await admin
      .from('listings')
      .select('status, pre_dmca_status')
      .eq('id', notice.listing_id)
      .maybeSingle();

    const { data: hidden, error: hideError } = await admin
      .from('listings')
      .update({
        status: 'hidden',
        dmca_removed_at: new Date().toISOString(),
        // Never overwrite an existing stamp: a second removal must not
        // record 'hidden' as the state to come back to.
        pre_dmca_status: before?.pre_dmca_status ?? before?.status ?? null,
      })
      .eq('id', notice.listing_id)
      .select('id')
      .maybeSingle();
    if (hideError || !hidden) {
      Sentry.captureException(hideError ?? new Error('DMCA removal affected no rows'), {
        extra: { where: 'admin.dmca.remove', noticeId: id },
      });
      return NextResponse.json({ error: hideError?.message ?? 'Could not remove the listing.' }, { status: 500 });
    }
    // Hiding the row is not "disabling access" while the file is still
    // served from a public bucket.
    const quarantined = await quarantineImages(admin, notice.listing_id as string);

    await admin
      .from('dmca_notices')
      .update({ ...stamp('material_removed'), quarantined_paths: quarantined })
      .eq('id', id);
    return NextResponse.json({ ok: true, images_quarantined: quarantined.length });
  }

  if (action === 'restore') {
    // "not less than 10 and not more than 14 business days after receiving
    // the counter-notice". The window is the whole point of recording dates.
    const from = notice.received_at as string;
    const earliest = addBusinessDays(from, RESTORE_MIN_BUSINESS_DAYS);
    const latest = addBusinessDays(from, RESTORE_MAX_BUSINESS_DAYS);
    const now = new Date().toISOString();
    if (now < earliest) {
      return NextResponse.json(
        {
          error: `Too early. The policy allows restoration no sooner than ${RESTORE_MIN_BUSINESS_DAYS} business days after the counter-notice — that is ${new Date(earliest).toLocaleDateString('en-US', { timeZone: 'UTC' })}.`,
        },
        { status: 409 },
      );
    }
    if (notice.listing_id) {
      const { data: listing } = await admin
        .from('listings')
        .select('status, pre_dmca_status')
        .eq('id', notice.listing_id)
        .maybeSingle();

      // Back to what it was. Falling back to 'hidden' rather than
      // 'available': the stamp is cleared, so the artist can republish it
      // themselves, and a guess that puts a sold piece on sale is worse than
      // one that leaves it hidden.
      let target = listing?.pre_dmca_status ?? 'hidden';

      // The same live-order check the listing PATCH route runs. A piece with
      // a live order must not go back to 'available' whatever it was before.
      if (target === 'available') {
        const { count } = await admin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', notice.listing_id)
          .in('status', ['paid', 'shipped', 'delivered', 'disputed']);
        if ((count ?? 0) > 0) target = 'hidden';
      }

      const { error: restoreError } = await admin
        .from('listings')
        .update({ dmca_removed_at: null, pre_dmca_status: null, status: target })
        .eq('id', notice.listing_id);
      if (restoreError) {
        Sentry.captureException(restoreError, { extra: { where: 'admin.dmca.restore', noticeId: id } });
        return NextResponse.json({ error: restoreError.message }, { status: 500 });
      }
    }
    // Mirror image of the removal: the files come back before the listing is
    // visible again.
    const paths = (notice.quarantined_paths as string[] | null) ?? [];
    if (paths.length) await restoreImages(admin, paths);

    await admin
      .from('dmca_notices')
      .update({ ...stamp('restored'), quarantined_paths: null })
      .eq('id', id);
    return NextResponse.json({
      ok: true,
      images_restored: paths.length,
      overdue: now > latest,
      window: { earliest, latest },
    });
  }

  const status = action === 'counter_received' ? 'counter_received' : action === 'withdraw' ? 'withdrawn' : 'defective';
  const { error } = await admin.from('dmca_notices').update(stamp(status)).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
