'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles: string[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      // Preserve intent (e.g. mid-checkout) so login can return here —
      // including the query string, which carries tab/panel state
      // (/studio/work?tab=series, /messages?tab=commissions).
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.push(`/login?returnUrl=${encodeURIComponent(pathname + search)}`);
    } else if (!loading && user && !allowedRoles.includes(user.role)) {
      router.push('/');
    }
  }, [user, loading, allowedRoles, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
