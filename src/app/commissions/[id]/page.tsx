'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { supabase } from '@/lib/supabase';

// A commission's home is its conversation (Build 3 Phase 5). Old deep links
// (notifications, emails) land here and get forwarded to the thread.
export default function CommissionRedirect() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'user', 'gallery']}>
        <RedirectToThread />
      </AuthGuard>
    </PageShell>
  );
}

function RedirectToThread() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('commissions')
        .select('conversation_id')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      router.replace(data?.conversation_id ? `/messages/${data.conversation_id}` : '/messages?tab=commissions');
    })();
    return () => { active = false; };
  }, [id, router]);

  return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
}
