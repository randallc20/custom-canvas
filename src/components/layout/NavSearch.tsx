'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchSuggestions } from '@/hooks/useFeed';

interface NavSearchProps {
  className?: string;
}

export function NavSearch({ className = '' }: NavSearchProps) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Seed from the URL's q param so a shared/search URL shows its query.
  // Read on mount only (window avoids forcing the whole nav into Suspense).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setTerm(q);
  }, []);

  const { data: suggestions } = useSearchSuggestions(debounced);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer.current);
  }, [term]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const go = (q: string) => {
    setOpen(false);
    // Preserve any active feed params (view, filters) and just set q.
    const sp = new URLSearchParams(window.location.search);
    sp.set('q', q);
    router.push(`/?${sp.toString()}`);
  };

  const hasSuggestions =
    !!suggestions && (suggestions.artists.length > 0 || suggestions.listings.length > 0);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) go(term.trim());
        }}
      >
        <input
          type="text"
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search art, artists, styles..."
          className="w-full rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
        />
      </form>

      {open && hasSuggestions && (
        <div className="absolute z-50 mt-2 w-full animate-fade-in overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {suggestions.artists.length > 0 && (
            <div className="py-1">
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">Artists</p>
              {suggestions.artists.map((a) => (
                <button
                  key={a.slug}
                  onClick={() => { setOpen(false); router.push(`/artist/${a.slug}`); }}
                  className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-sand/50"
                >
                  {a.display_name}
                </button>
              ))}
            </div>
          )}
          {suggestions.listings.length > 0 && (
            <div className="border-t border-line py-1">
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">Artwork</p>
              {suggestions.listings.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setOpen(false); router.push(`/listing/${l.id}`); }}
                  className="block w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-sand/50"
                >
                  {l.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
