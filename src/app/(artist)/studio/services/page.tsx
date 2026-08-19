'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

interface Service {
  id: string;
  name: string;
  category: 'photographer' | 'framing' | 'printing' | 'other';
  blurb: string | null;
  city: string;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
}

const CATEGORY_LABELS: Record<Service['category'], string> = {
  photographer: 'Art photography',
  framing: 'Framing',
  printing: 'Printing',
  other: 'More services',
};

/** Curated local providers artists can hire directly (booking and payment
 *  happen with the provider, not through Custom Canvas). RLS shows active
 *  entries to signed-in users only. */
export default function StudioServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('artist_services')
      .select('id, name, category, blurb, city, contact_email, contact_phone, website_url')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setServices((data ?? []) as Service[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const byCategory = (['photographer', 'framing', 'printing', 'other'] as const)
    .map((cat) => ({ cat, items: services.filter((s) => s.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold text-ink">Services</h1>
      <p className="mt-1 mb-8 max-w-2xl text-sm text-muted">
        Vetted local providers to help your shop look its best — great photos are the single
        biggest thing that sells art. You book and pay providers directly; Custom Canvas takes
        no cut and makes no guarantee.
      </p>

      {byCategory.length === 0 ? (
        <EmptyState
          title="No providers listed yet"
          description="We're curating local photographers and services — check back soon."
        />
      ) : (
        byCategory.map(({ cat, items }) => (
          <div key={cat} className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-ink">{CATEGORY_LABELS[cat]}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((s) => (
                <div key={s.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                  <p className="font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-muted">{s.city}</p>
                  {s.blurb && <p className="mt-2 text-sm text-ink">{s.blurb}</p>}
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {s.contact_email && (
                      <a href={`mailto:${s.contact_email}`} className="font-medium text-terra hover:underline">
                        Email
                      </a>
                    )}
                    {s.contact_phone && (
                      <a href={`tel:${s.contact_phone}`} className="font-medium text-terra hover:underline">
                        {s.contact_phone}
                      </a>
                    )}
                    {s.website_url && (
                      <a href={s.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-terra hover:underline">
                        Website ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
