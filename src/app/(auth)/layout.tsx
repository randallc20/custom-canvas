import type { Metadata } from 'next';
import { BackButton } from '@/components/layout/BackButton';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackButton />
      {children}
    </>
  );
}
