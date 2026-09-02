import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendAdminPasswordResetEmail } from '@/services/email';

// Admin-triggered password reset. The public /forgot-password flow exists, but
// it can't rescue an account whose owner is stuck (captcha trouble, admin
// accounts on shared mailboxes, a user emailing support). generateLink runs
// under the service role, so the captcha gate on the public recover endpoint
// doesn't apply; we email the link ourselves. The admin never sees a password
// or a token — the link goes only to the account's own address.
//
// The link goes to OUR /auth/reset-callback with the hashed token, not to
// GoTrue's action_link (01-P1): a server-minted recovery token has no PKCE
// challenge, so GoTrue's /verify answered with an implicit-flow
// #access_token= fragment that the PKCE browser client refuses. The callback
// verifies the token with the cookie server client and lands the user
// signed in on /reset-password in any browser.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const { data: target } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', params.id)
    .maybeSingle();
  if (!target?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    Sentry.captureException(linkError ?? new Error('generateLink returned no hashed_token'));
    return NextResponse.json({ error: 'Could not create a reset link' }, { status: 500 });
  }
  const callback = new URL('/auth/reset-callback', appUrl);
  callback.searchParams.set('token_hash', link.properties.hashed_token);
  callback.searchParams.set('type', 'recovery');

  try {
    await sendAdminPasswordResetEmail(target.email, target.full_name, callback.toString());
  } catch (e) {
    // The link was minted but never delivered — surface that honestly instead
    // of a success toast over a silent failure.
    Sentry.captureException(e);
    return NextResponse.json({ error: 'Reset link created but the email failed to send' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
