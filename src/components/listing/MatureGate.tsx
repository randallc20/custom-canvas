'use client';

import { useMature } from '@/context/MatureContext';

/**
 * The click-through notice on a mature listing (ruling D8).
 *
 * Listing Standards Part three permits nudity and mature themes as fine art
 * and asks that they be taggable and filterable. A tagged piece is kept out
 * of browsing for anyone who has not opted in — but the listing itself stays
 * reachable, because someone following a link from the artist, a share, or a
 * search they typed deliberately should be able to see the work. They just
 * see it on purpose.
 *
 * "Show mature work from now on" writes the same preference the feed filter
 * reads, so agreeing once here means not being asked again.
 */
export function MatureGate({
  isMature,
  children,
}: {
  isMature: boolean;
  children: React.ReactNode;
}) {
  const { showMature, setShowMature } = useMature();

  if (!isMature || showMature) return <>{children}</>;

  return (
    <div className="rounded-xl border border-line bg-sand/50 p-8 text-center">
      <p className="font-display text-lg font-semibold text-ink">This piece contains mature content</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        The artist has tagged this work as containing nudity or mature themes. It is not shown in
        browsing unless you choose to see mature work.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setShowMature(true)}
          className="press rounded-full bg-terraText px-5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-terraTextDark"
        >
          Show mature work
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        This is remembered in this browser. You can turn it off again on your account page.
      </p>
    </div>
  );
}
