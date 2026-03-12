import { formatPrice } from '@/utils/formatPrice';

interface QuoteCardProps {
  quotedPriceCents: number;
  estimatedCompletion: string;
  artistNotes: string | null;
}

export function QuoteCard({ quotedPriceCents, estimatedCompletion, artistNotes }: QuoteCardProps) {
  return (
    <div className="rounded-lg border border-[#E8704A]/20 bg-orange-50 p-4">
      <h4 className="text-sm font-medium text-gray-900">Artist Quote</h4>
      <p className="mt-2 text-xl font-bold text-gray-900">{formatPrice(quotedPriceCents)}</p>
      <p className="mt-1 text-sm text-gray-500">Estimated completion: {estimatedCompletion}</p>
      {artistNotes && <p className="mt-2 text-sm text-gray-600">{artistNotes}</p>}
    </div>
  );
}
