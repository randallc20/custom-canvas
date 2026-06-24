import { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { BackButton } from './BackButton';

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <BackButton />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
