import { getInitials } from '@/components/ui/Avatar';

/** Stand-in for a partner banner that was never uploaded. The bare `bg-sand`
 *  box read as a rendering mistake — this makes "no banner yet" look chosen:
 *  a soft brand gradient with the organisation's monogram (same derivation as
 *  Avatar's, so a banner and an avatar never monogram differently) set large
 *  in the display face. */
export function BannerFallback({ name }: { name: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-terraSoft via-sand to-cream">
      <span aria-hidden className="select-none font-display text-5xl font-bold text-terra/30">
        {getInitials(name) || '·'}
      </span>
    </div>
  );
}
