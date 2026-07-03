'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';

// Commissions live in the inbox now (Build 3 Phase 5).
export default function CommissionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/messages?tab=commissions');
  }, [router]);
  return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
}
