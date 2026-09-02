import Link from 'next/link';
import { PartnerBadge } from '@/components/gallery/PartnerBadge';
import type { ArtistEducation } from '@/types/artist';
import type { PartnerType } from '@/types/gallery';

type EducationWithPartner = ArtistEducation & {
  partner?: { slug: string; gallery_name: string; partner_type: PartnerType; is_verified: boolean } | null;
};

interface EducationTimelineProps {
  education: EducationWithPartner[];
}

export function EducationTimeline({ education }: EducationTimelineProps) {
  if (education.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-ink">Education &amp; Training</h2>
      <ol className="relative space-y-6 border-l border-line pl-6">
        {education.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[1.85rem] top-1.5 h-2.5 w-2.5 rounded-full bg-terra" />
            <p className="flex items-center gap-1.5 font-medium text-ink">
              {entry.partner?.is_verified ? (
                <Link href={`/gallery/${entry.partner.slug}`} className="hover:text-terraTextDark hover:underline">
                  {entry.institution}
                </Link>
              ) : (
                entry.institution
              )}
              {entry.partner?.is_verified && <PartnerBadge partnerType={entry.partner.partner_type} compact />}
            </p>
            {(entry.degree || entry.field_of_study) && (
              <p className="text-sm text-muted">
                {[entry.degree, entry.field_of_study].filter(Boolean).join(', ')}
              </p>
            )}
            {(entry.start_year || entry.end_year) && (
              <p className="text-xs text-muted/80">
                {entry.start_year ?? ''}{entry.start_year || entry.end_year ? '–' : ''}
                {entry.is_current ? 'present' : entry.end_year ?? ''}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
