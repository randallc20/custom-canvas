import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// Destination of the email-confirmation link (signUp passes
// emailRedirectTo=/auth/callback?next=...). Exchanges the PKCE code for a
// session cookie, then forwards to the onboarding path for the role.
//
// The exchange can fail legitimately: PKCE ties the code to the browser that
// signed up, so a link opened in a different browser (or a mail client's
// preview) has no code verifier. By that point Supabase has already confirmed
// the email server-side — send them to sign in rather than an error page.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  // Same origin-safety rule as the login returnUrl: a single leading slash,
  // not '//' or '/\', so the redirect can never leave this site.
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : '/';

  if (code) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, url.origin));
    }
  }

  const login = new URL('/login', url.origin);
  login.searchParams.set('confirmed', '1');
  login.searchParams.set('returnUrl', safeNext);
  return NextResponse.redirect(login);
}
