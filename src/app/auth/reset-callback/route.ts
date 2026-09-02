import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// Destination of the ADMIN-triggered password reset email (01-P1). The route
// that sends it (api/admin/users/[id]/reset-password) mints a recovery token
// with the service role and links here with its hashed form. A server-minted
// token has no PKCE challenge, so GoTrue's own /verify redirect comes back as
// an implicit-flow #access_token= fragment that the PKCE browser client
// refuses; verifying the hash here with the cookie server client mints the
// session server-side and works in any browser.
//
// The public /forgot-password flow does not come through here: it is PKCE
// end to end and lands on /reset-password?code=… directly.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const expired = new URL('/forgot-password', url.origin);
  expired.searchParams.set('expired', '1');

  if (!tokenHash || type !== 'recovery') {
    return NextResponse.redirect(expired);
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
  if (error) {
    // Used or expired token — nothing was verified; say so and offer a new one.
    return NextResponse.redirect(expired);
  }

  return NextResponse.redirect(new URL('/reset-password', url.origin));
}
