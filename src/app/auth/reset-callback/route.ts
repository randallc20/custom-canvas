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
// The GET only RENDERS a confirmation page; the token is consumed by the
// POST behind its button (01-r2 appendix). Mail scanners (Outlook Safe
// Links, corporate gateways) prefetch links with a GET, and a GET that
// verified the token burned it before the person ever clicked — they landed
// on /forgot-password?expired=1 for a link they had not used.
//
// The public /forgot-password flow does not come through here: it is PKCE
// end to end and lands on /reset-password?code=… directly.

function expiredUrl(origin: string) {
  const expired = new URL('/forgot-password', origin);
  expired.searchParams.set('expired', '1');
  return expired;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function confirmationPage(tokenHash: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Reset your password · Custom Canvas</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #F1E8DA; color: #2D2A26; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { background: #FFFFFF; border: 1px solid #E9E2D8; border-radius: 16px; padding: 32px; max-width: 420px; margin: 24px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: #5C5650; }
  button { width: 100%; padding: 12px 16px; border: 0; border-radius: 10px; background: #A84928; color: #fff;
           font: inherit; font-weight: 600; cursor: pointer; }
  button:hover { background: #8F3D21; }
</style>
</head>
<body>
<main>
  <h1>Reset your password</h1>
  <p>This link signs you in so you can choose a new password. It works once and expires after an hour.</p>
  <form method="post" action="/auth/reset-callback">
    <input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}">
    <input type="hidden" name="type" value="recovery">
    <button type="submit">Continue to reset your password</button>
  </form>
</main>
</body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  if (!tokenHash || type !== 'recovery') {
    return NextResponse.redirect(expiredUrl(url.origin));
  }

  return new NextResponse(confirmationPage(tokenHash), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get('token_hash');
  const type = form?.get('type');

  // 303 so the browser follows a POST with a GET.
  if (typeof tokenHash !== 'string' || !tokenHash || type !== 'recovery') {
    return NextResponse.redirect(expiredUrl(url.origin), 303);
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
  if (error) {
    // Used or expired token — nothing was verified; say so and offer a new one.
    return NextResponse.redirect(expiredUrl(url.origin), 303);
  }

  return NextResponse.redirect(new URL('/reset-password', url.origin), 303);
}
