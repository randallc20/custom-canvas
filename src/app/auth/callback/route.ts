import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isSafeInternalPath } from '@/utils/safePath';

// Destination of the email-confirmation link (signUp passes
// emailRedirectTo=/auth/callback?next=...). Exchanges the PKCE code for a
// session cookie, then forwards to the onboarding path for the role.
//
// Three outcomes:
//  - code exchanges → signed in, continue to `next`.
//  - code present but exchange fails → the email WAS verified server-side
//    (Supabase only redirects with a code after verifying), but PKCE ties the
//    code to the browser that signed up, so a link opened elsewhere can't
//    mint a session. Send them to sign in, truthfully labeled confirmed.
//  - no code (Supabase redirected with error=... — expired or already-used
//    link) → nothing was verified; do NOT claim it was.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const safeNext = isSafeInternalPath(next) ? next : '/';

  const login = new URL('/login', url.origin);

  if (code) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, url.origin));
    }
    login.searchParams.set('confirmed', '1');
    login.searchParams.set('returnUrl', safeNext);
    return NextResponse.redirect(login);
  }

  login.searchParams.set('confirm_error', '1');
  return NextResponse.redirect(login);
}
