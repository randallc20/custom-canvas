import Link from 'next/link';
import { ArtistProfile } from '@/types/artist';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/utils/formatPrice';

interface CommissionPanelProps {
  artist: ArtistProfile;
}

export function CommissionPanel({ artist }: CommissionPanelProps) {
  if (!artist.commissions_open) {
    return (
      <div className="rounded-lg border border-line p-4">
        <h3 className="font-medium text-ink">Commissions</h3>
        <p className="mt-1 text-sm text-muted">Not accepting commissions at this time.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line p-4">
      <h3 className="font-medium text-ink">Commissions Open</h3>
      {artist.commission_desc && <p className="mt-2 text-sm text-muted">{artist.commission_desc}</p>}
      <div className="mt-3 space-y-1 text-sm text-muted">
        {artist.commission_min_cents && <p>Starting at {formatPrice(artist.commission_min_cents)}</p>}
        {artist.commission_turnaround && <p>Turnaround: {artist.commission_turnaround}</p>}
      </div>
      <Link href={`/commission-request?artist=${artist.slug}`} className="mt-4 block">
        <Button className="w-full">Request Commission</Button>
      </Link>
    </div>
  );
}
