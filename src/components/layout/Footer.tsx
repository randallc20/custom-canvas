import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-line bg-sand">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
        <p className="text-sm text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-stacked-ink.svg" alt="Custom Canvas" className="mx-auto mb-4 h-16 w-auto opacity-80" />
          &copy; {new Date().getFullYear()} Custom Canvas. All rights reserved.
        </p>
        {/* Seller Protection, Listing Standards and the Artist Agreement are
            deliberately not here: they are linked where an artist meets them
            (Studio, the listing forms, onboarding) and from the Artist
            Agreement page, per L1.3. */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 sm:justify-end">
          <Link href="/about" className="text-sm text-muted transition-colors duration-150 hover:text-ink">About</Link>
          <Link href="/partners" className="text-sm text-muted transition-colors duration-150 hover:text-ink">Partners</Link>
          <Link href="/terms" className="text-sm text-muted transition-colors duration-150 hover:text-ink">Terms</Link>
          <Link href="/terms-of-sale" className="text-sm text-muted transition-colors duration-150 hover:text-ink">Terms of Sale</Link>
          <Link href="/shipping-returns" className="text-sm text-muted transition-colors duration-150 hover:text-ink">Shipping &amp; Returns</Link>
          <Link href="/privacy" className="text-sm text-muted transition-colors duration-150 hover:text-ink">Privacy</Link>
          <Link href="/dmca" className="text-sm text-muted transition-colors duration-150 hover:text-ink">DMCA</Link>
        </div>
      </div>
    </footer>
  );
}
