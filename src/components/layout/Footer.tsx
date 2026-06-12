import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-line bg-sand">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <p className="text-sm text-muted">
          &copy; {new Date().getFullYear()} Custom Canvas. All rights reserved.
        </p>
        <div className="flex gap-6">
          <Link href="/about" className="text-sm text-muted transition-colors duration-150 hover:text-ink">About</Link>
          <Link href="/terms" className="text-sm text-muted transition-colors duration-150 hover:text-ink">Terms</Link>
          <Link href="/privacy" className="text-sm text-muted transition-colors duration-150 hover:text-ink">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
