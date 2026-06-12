import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PartnerBadge } from '@/components/gallery/PartnerBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PARTNER_TYPE_LABELS, type PartnerType } from '@/types/gallery';

export const metadata: Metadata = {
  title: 'Partners',
  description: 'Verified galleries, schools, museums and organizations supporting Houston artists.',
};

interface Props {
  searchParams: { type?: string };
}

export default async function PartnersPage({ searchParams }: Props) {
  const supabase = createServerSupabaseClient();
  const activeType =
    searchParams.type && searchParams.type in PARTNER_TYPE_LABELS
      ? (searchParams.type as PartnerType)
      : null;

  let query = supabase
    .from('gallery_profiles')
    .select('*')
    .eq('is_verified', true)
    .order('gallery_name', { ascending: true });
  if (activeType) query = query.eq('partner_type', activeType);

  const { data: partners } = await query;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-ink">Partners</h1>
      <p className="mb-6 text-muted">
        Verified galleries, schools, museums and organizations supporting Houston&apos;s artists.
      </p>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href="/partners"
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150
            ${!activeType ? 'bg-ink text-cream' : 'bg-sand text-muted hover:text-ink'}`}
        >
          All
        </Link>
        {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((t) => (
          <Link
            key={t}
            href={`/partners?type=${t}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150
              ${activeType === t ? 'bg-ink text-cream' : 'bg-sand text-muted hover:text-ink'}`}
          >
            {PARTNER_TYPE_LABELS[t]}
          </Link>
        ))}
      </div>

      {!partners || partners.length === 0 ? (
        <EmptyState
          title={activeType ? `No verified ${PARTNER_TYPE_LABELS[activeType].toLowerCase()}s yet` : 'No partners yet'}
          description="Verified partners will appear here."
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((partner) => (
            <Link
              key={partner.id}
              href={`/gallery/${partner.slug}`}
              className="card-hover group overflow-hidden rounded-xl border border-line bg-surface shadow-card"
            >
              <div className="relative h-32 bg-sand">
                {partner.banner_image_url && (
                  <Image
                    src={partner.banner_image_url}
                    alt={`${partner.gallery_name} banner`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-ink group-hover:text-terra">
                    {partner.gallery_name}
                  </h3>
                  <PartnerBadge partnerType={partner.partner_type} />
                </div>
                {partner.neighborhood && (
                  <p className="mt-1 text-sm text-muted">{partner.neighborhood}, {partner.city}</p>
                )}
                {partner.bio && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{partner.bio}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
