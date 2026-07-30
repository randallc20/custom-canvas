import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // Server Components can READ cookies but not WRITE them — only Route
        // Handlers / Server Actions can. Supabase calls these setters when it
        // refreshes an expiring session mid-render; in a Server Component that
        // throws ("Cookies can only be modified in a Server Action..."). Swallow
        // it: the write is safely skipped and the browser keeps its current
        // cookie until a Route Handler or the client refreshes it.
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* Server Component render context — not writable, ignore. */
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            /* Server Component render context — not writable, ignore. */
          }
        },
      },
    }
  );
}
