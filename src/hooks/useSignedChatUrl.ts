import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// chat-attachments is a private bucket — render via short-lived signed URLs,
// which run under the user's session and are gated by the participant RLS
// policy (00012). Pass the stored object path; returns a usable URL or null.
export function useSignedChatUrl(path: string | null) {
  return useQuery({
    queryKey: ['chat-signed-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000, // refresh well before the 1h expiry
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
