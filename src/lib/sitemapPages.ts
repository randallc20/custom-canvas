import { createClient } from '@supabase/supabase-js';

/** Listing URLs per sitemap file. Sitemaps allow 50,000; 1,000 keeps each
 *  file well under PostgREST's default max_rows so a page is never silently
 *  truncated (02-P2). */
export const SITEMAP_PAGE_SIZE = 1000;

/** A cookie-free anon client for the sitemap and robots files. Next
 *  evaluates `generateSitemaps()` and the sitemap body at BUILD time, where
 *  `cookies()` throws ("called outside a request scope") and `next build`
 *  fails. Everything the sitemap lists is public under RLS, so the anon key
 *  with no session is the right identity anyway. Per-request fresh, like
 *  createServerSupabaseClient. */
export function createSitemapSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );
}

/** How many listing sitemap pages exist right now (always at least one, so
 *  /sitemap/0.xml exists even before the first listing). */
export async function listingSitemapPageCount(): Promise<number> {
  const supabase = createSitemapSupabaseClient();
  const { count } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'available');
  return Math.max(1, Math.ceil((count ?? 0) / SITEMAP_PAGE_SIZE));
}
