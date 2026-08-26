/** Stand-in for a partner banner that was never uploaded. The bare `bg-sand`
 *  box read as a rendering mistake — this makes "no banner yet" look chosen:
 *  a soft brand gradient with the organisation's monogram set large in the
 *  display face. */
export function BannerFallback({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-terraSoft via-sand to-cream">
      <span aria-hidden className="select-none font-display text-5xl font-bold text-terra/30">
        {initials || '·'}
      </span>
    </div>
  );
}
