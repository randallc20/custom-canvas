'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { SalesSection } from '@/components/studio/SalesSection';
import { PayoutsSection } from '@/components/studio/PayoutsSection';

export default function StudioSalesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-ink">Sales &amp; Money</h1>
      <div className="space-y-10">
        {/* PayoutsSection reads ?setup=complete from the Stripe return URL */}
        <Suspense fallback={<div className="flex justify-center py-8"><Spinner size="lg" /></div>}>
          <PayoutsSection />
        </Suspense>
        <SalesSection />
      </div>
    </div>
  );
}
