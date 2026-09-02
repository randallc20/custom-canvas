'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ListingsSection } from '@/components/studio/ListingsSection';
import { SeriesSection } from '@/components/studio/SeriesSection';

const TABS = [
  { key: 'listings', label: 'Listings' },
  { key: 'series', label: 'Series' },
] as const;

export default function StudioWorkPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Spinner size="lg" /></div>}>
      <WorkContent />
    </Suspense>
  );
}

function WorkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'series' ? 'series' : 'listings';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Work</h1>
        {tab === 'listings' && <Link href="/listings/new"><Button>New Listing</Button></Link>}
      </div>
      <div className="mb-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => router.replace(t.key === 'listings' ? '/studio/work' : `/studio/work?tab=${t.key}`)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-terraText text-white' : 'bg-sand text-ink hover:bg-sand/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'series' ? <SeriesSection /> : <ListingsSection />}
    </div>
  );
}
