'use client';

import { useState } from 'react';

/**
 * "Great photos sell art" — expandable guidance shown at the point of image
 * upload (create + edit listing). Photos are the single biggest quality lever
 * for a listing, so the tips live exactly where the decision happens.
 */
const TIPS: { title: string; body: string }[] = [
  {
    title: 'Use natural, indirect light',
    body: 'Near a window on an overcast day beats any lamp. Never use flash — it flattens texture and blows out color.',
  },
  {
    title: 'Shoot straight-on and level',
    body: 'Camera parallel to the artwork, edges square in the frame. Prop your phone or use a wall to steady it.',
  },
  {
    title: 'Fill the frame with the work',
    body: 'The first photo should be the piece alone, edge to edge, on a clean neutral background.',
  },
  {
    title: 'Add one close-up detail shot',
    body: 'Texture, brushwork, glaze, stitching — the detail shot is what makes buyers trust the quality.',
  },
  {
    title: 'Show it in a room',
    body: 'One photo of the piece hanging or placed in a real space helps buyers judge scale and imagine it at home.',
  },
  {
    title: 'Skip the filters',
    body: 'Buyers expect the piece that arrives to match the photos. True-to-life color builds trust (and prevents returns).',
  },
];

export function PhotoTipsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-terra/30 bg-terraSoft/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-ink">📸 Great photos sell art — quick tips</span>
        <span className="text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="space-y-2 px-3 pb-3">
          {TIPS.map((tip) => (
            <li key={tip.title}>
              <p className="text-sm font-medium text-ink">{tip.title}</p>
              <p className="text-xs text-muted">{tip.body}</p>
            </li>
          ))}
          <li className="pt-1 text-xs text-muted">
            Want professional shots? Check{' '}
            <a href="/studio/services" className="font-medium text-terra underline">
              Artist Services
            </a>{' '}
            for local photographers.
          </li>
        </ul>
      )}
    </div>
  );
}
