'use client';

import { useAuth } from '@/context/AuthContext';
import { useSavedIds, useToggleSave } from '@/hooks/useSaved';

interface SaveHeartProps {
  listingId: string;
  /** Show "Save" / "Saved" beside the heart. The grid has no room; the
   *  listing page does, and a bare icon there reads as decoration. */
  withLabel?: boolean;
  /** `overlay` is for the full-screen viewer, where the backdrop is black and
   *  a muted grey heart is invisible. */
  tone?: 'default' | 'overlay';
  className?: string;
}

/**
 * Save a piece. One control, three places.
 *
 * It lived only in `FeedCard` until a tester pointed out you could save a
 * piece from the grid but not while actually looking at it — which is the
 * moment someone decides they want it. The listing page had no save control
 * at all, so the flow was: open the piece, look at it, go back, then save.
 */
export function SaveHeart({ listingId, withLabel = false, tone = 'default', className = '' }: SaveHeartProps) {
  const { user } = useAuth();
  const { data: savedIds } = useSavedIds(user?.id ?? '');
  const toggleSave = useToggleSave();
  if (!user) return null;

  const isSaved = savedIds?.has(listingId) ?? false;

  const handleSave = (e: React.MouseEvent) => {
    // Usually rendered inside a Link or a click-to-zoom button.
    e.preventDefault();
    e.stopPropagation();
    toggleSave.mutate({ profileId: user.id, listingId, isSaved });
  };

  const colour =
    tone === 'overlay'
      ? isSaved
        ? 'bg-black/50 text-terra'
        : 'bg-black/50 text-white/80 hover:text-terra'
      : isSaved
        ? 'text-terra'
        : 'text-muted/60 hover:text-terra';

  return (
    <button
      type="button"
      onClick={handleSave}
      // Until the shared saved-ids set has loaded every heart reads "Save",
      // and a click on an already-saved piece posts a duplicate (409). Hold
      // the click until the state is known.
      disabled={savedIds === undefined}
      className={`inline-flex items-center gap-1.5 transition-colors duration-150 ${
        tone === 'overlay' ? 'rounded-full px-3 py-2 backdrop-blur-sm' : ''
      } ${colour} ${className}`}
      aria-label={isSaved ? 'Unsave' : 'Save'}
    >
      <svg
        key={isSaved ? 'saved' : 'unsaved'}
        className="h-5 w-5 animate-heart-pop"
        fill={isSaved ? 'currentColor' : 'none'}
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
      {withLabel && <span className="text-sm font-medium">{isSaved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
