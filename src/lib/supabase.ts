import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cookie-backed session (not localStorage) so API route handlers can
// authenticate the user via createServerSupabaseClient. With localStorage
// sessions, every fetch('/api/...') arrived anonymous and authed routes
// returned 401 in real browsers.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
