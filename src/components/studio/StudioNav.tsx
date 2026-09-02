'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/studio', label: 'Studio' },
  { href: '/studio/work', label: 'Work' },
  { href: '/studio/sales', label: 'Sales & Money' },
  { href: '/studio/page', label: 'Public Page' },
  { href: '/studio/services', label: 'Services' },
];

export function StudioNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-line bg-surface">
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4" aria-label="Studio">
        {TABS.map((tab) => {
          const active =
            tab.href === '/studio' ? pathname === '/studio' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-terra text-terraText'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
