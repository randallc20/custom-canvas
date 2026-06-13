import Link from 'next/link';
import { ReactNode } from 'react';

interface FilterChipProps {
  active: boolean;
  children: ReactNode;
  /** Renders a Link when href is given, otherwise a button. */
  href?: string;
  onClick?: () => void;
}

export function FilterChip({ active, children, href, onClick }: FilterChipProps) {
  const className = `rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150
    ${active ? 'bg-ink text-cream' : 'bg-sand text-muted hover:text-ink'}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-pressed={active}>
      {children}
    </button>
  );
}
