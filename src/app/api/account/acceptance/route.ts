import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import {
  acceptanceBlocks,
  outstandingAcceptances,
  type AcceptanceDocument,
} from '@/lib/acceptance';
import {
  ARTIST_AGREEMENT_VERSION,
  TERMS_OF_SALE_VERSION,
  TERMS_VERSION,
} from '@/lib/agreement';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/** What this account still has to accept (L2 / ruling D11).
 *
 *  The acceptance columns carry no SELECT grant, so the browser cannot read
 *  its own row to work this out — it asks here. That keeps the record
 *  server-owned end to end: the client is told what is outstanding, and the
 *  POST below decides for itself what to stamp. */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ outstanding: [], blocks: false });

  try {
    const admin = createAdminSupabaseClient();
    const outstanding = await outstandingAcceptances(admin, user.id);
    return NextResponse.json({ outstanding, blocks: acceptanceBlocks(outstanding) });
  } catch (err) {
    captureException(err, { where: 'acceptance.get' });
    // Fail OPEN on a read error. This endpoint decides whether to show a
    // blocking interstitial; a transient failure must not lock every
    // signed-in person out of messaging and checkout. The gated write routes
    // fail closed on their own, so a real outstanding acceptance is still
    // enforced where it matters.
    return NextResponse.json({ outstanding: [], blocks: false });
  }
}

const STAMPS: Record<AcceptanceDocument, () => Record<string, string>> = {
  terms: () => ({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() }),
  terms_of_sale: () => ({
    terms_of_sale_version: TERMS_OF_SALE_VERSION,
    terms_of_sale_accepted_at: new Date().toISOString(),
  }),
  artist_agreement: () => ({
    agreement_version: ARTIST_AGREEMENT_VERSION,
    agreement_accepted_at: new Date().toISOString(),
  }),
};

const DOCUMENT_NAMES: AcceptanceDocument[] = ['terms', 'terms_of_sale', 'artist_agreement'];

/** Record acceptance of what is outstanding for this account.
 *
 *  Takes no version from the caller. The client says "I accept"; the server
 *  decides which versions that covers and stamps them from its own constants.
 *  A client that could name the version could record acceptance of a version
 *  that was never displayed to anyone.
 *
 *  An optional `documents` array NARROWS the stamp to a subset — registration
 *  sends `["terms"]`, because its checkbox names the Terms of Service and
 *  Privacy Policy and nothing else; stamping the Terms of Sale there would
 *  record an acceptance the person was never shown. The list can only ever
 *  narrow: anything in it that is not genuinely outstanding is dropped, so it
 *  is not a way to forge a stamp. Omitting it accepts everything outstanding,
 *  which is what the interstitial does. */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const requested: AcceptanceDocument[] | null = Array.isArray(body?.documents)
    ? body.documents.filter((d: unknown): d is AcceptanceDocument =>
        DOCUMENT_NAMES.includes(d as AcceptanceDocument),
      )
    : null;

  const admin = createAdminSupabaseClient();
  const all = await outstandingAcceptances(admin, user.id);
  const outstanding = requested ? all.filter((o) => requested.includes(o.document)) : all;
  if (outstanding.length === 0) return NextResponse.json({ accepted: [] });

  const profileStamp: Record<string, string> = {};
  const artistStamp: Record<string, string> = {};
  for (const { document } of outstanding) {
    Object.assign(document === 'artist_agreement' ? artistStamp : profileStamp, STAMPS[document]());
  }

  if (Object.keys(profileStamp).length) {
    const { data, error } = await admin
      .from('profiles')
      .update(profileStamp)
      .eq('id', user.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      captureException(error ?? new Error('acceptance stamp affected no rows'), {
        where: 'acceptance.post.profiles',
      });
      return NextResponse.json({ error: 'Could not record your acceptance.' }, { status: 500 });
    }
  }

  if (Object.keys(artistStamp).length) {
    const { data, error } = await admin
      .from('artist_profiles')
      .update(artistStamp)
      .eq('profile_id', user.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      captureException(error ?? new Error('agreement stamp affected no rows'), {
        where: 'acceptance.post.artist_profiles',
      });
      return NextResponse.json({ error: 'Could not record your acceptance.' }, { status: 500 });
    }
  }

  return NextResponse.json({ accepted: outstanding.map((o) => o.document) });
}
