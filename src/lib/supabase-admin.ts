import { createClient } from '@supabase/supabase-js';

// Service-role client for trusted server contexts with no user session
// (Stripe webhooks, crons). Bypasses RLS — never import from client code.
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
