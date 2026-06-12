import { PARTNER_TYPE_LABELS, type PartnerType } from '@/types/gallery';

interface PartnerBadgeProps {
  partnerType?: PartnerType | null;
  /** Compact: shield only (chat bubbles); label appears in the tooltip. */
  compact?: boolean;
  className?: string;
}

function shieldTitle(partnerType?: PartnerType | null) {
  return `Verified ${PARTNER_TYPE_LABELS[partnerType ?? 'gallery']}`;
}

export function PartnerBadge({ partnerType, compact = false, className = '' }: PartnerBadgeProps) {
  const label = shieldTitle(partnerType);

  const shield = (
    <svg className={compact ? 'h-3.5 w-3.5' : 'h-3 w-3'} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 1.5l6.5 2.4v4.6c0 4.2-2.8 8-6.5 9.9C6.3 16.5 3.5 12.7 3.5 8.5V3.9L10 1.5zm3.2 5.8a.75.75 0 00-1.1-1l-3.2 3.5-1.4-1.4a.75.75 0 10-1.1 1.1l2 2c.3.3.8.3 1.1 0l3.7-4.2z"
        clipRule="evenodd"
      />
    </svg>
  );

  if (compact) {
    return (
      <span className={`inline-flex items-center text-sage ${className}`} title={label} aria-label={label}>
        {shield}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-medium text-sage ${className}`}
    >
      {shield}
      {label}
    </span>
  );
}
