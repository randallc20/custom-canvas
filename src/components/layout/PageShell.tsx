import { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { BackButton } from './BackButton';

interface PageShellProps {
  children: ReactNode;
  /** Viewport-locked layout (messages): no footer, children fill the
   *  remaining height, page never scrolls — the composer stays visible. */
  fullHeight?: boolean;
}

export function PageShell({ children, fullHeight = false }: PageShellProps) {
  if (fullHeight) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Navbar />
        <BackButton />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <BackButton />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
