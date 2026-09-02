'use client';

import { useState } from 'react';
import { Order } from '@/types/order';
import {
  evaluateProtection,
  pickupHandoffConfirmed,
  MIN_EVIDENCE_PHOTOS,
  DEFAULT_FULFILLMENT_WINDOW_DAYS,
  REPLY_WINDOW_BUSINESS_DAYS,
} from '@/utils/evaluateProtection';

// Shows the artist where they stand BEFORE a dispute exists — the whole point
// of the bargain. Protection that only becomes visible once you've lost it
// changes nobody's behaviour.
//
// Two of the six requirements were frozen at checkout and can no longer be
// influenced, so they are listed separately: telling an artist to "add photos"
// to a piece that already sold would be actively misleading.

const FROZEN_AT_SALE = [
  'photograph',
  'condition notes',
];

function isFrozen(failure: string) {
  return FROZEN_AT_SALE.some((f) => failure.toLowerCase().includes(f));
}

export function ProtectionBadge({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);

  // A dispute has already been assessed — that verdict is final.
  const settled = order.protection_status === 'protected' || order.protection_status === 'ineligible';

  const result = evaluateProtection({
    isPickup: !!order.is_pickup,
    pickupHandoffConfirmed: pickupHandoffConfirmed(order),
    createdAt: order.created_at,
    shippedAt: order.shipped_at,
    deliveredAt: order.delivered_at ?? null,
    trackingNumber: order.tracking_number,
    carrier: order.carrier,
    signatureRequired: !!order.signature_required,
    signatureConfirmed: !!order.signature_confirmed,
    evidencePhotoCount: order.evidence_photo_count ?? 0,
    evidenceHasConditionNotes: !!order.evidence_has_condition_notes,
    fulfillmentWindowDays: order.fulfillment_window_days ?? DEFAULT_FULFILLMENT_WINDOW_DAYS,
    // Not measurable in the browser; the webhook checks it for real at dispute
    // time from the message history (utils/artistRepliedInTime). Shown
    // optimistically here rather than alarming artists who replied — and the
    // copy below says so, so "Protected" is never read as a promise about a
    // requirement this badge cannot see.
    artistRepliedWithinWindow: true,
  });

  const covered = settled ? order.protection_status === 'protected' : result.status === 'protected';
  const fixable = result.failures.filter((f) => !isFrozen(f));
  const frozen = result.failures.filter(isFrozen);

  const label = settled
    ? covered
      ? 'Protected — Custom Canvas covered this'
      : 'Not protected'
    : covered
    ? 'Protected'
    : 'Not protected yet';

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
          covered ? 'bg-sage/15 text-sage hover:bg-sage/25' : 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25'
        }`}
      >
        <span aria-hidden="true">{covered ? '✓' : '!'}</span>
        {label}
        {!covered && !settled && <span className="opacity-70">— what&apos;s missing</span>}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-line bg-sand/40 px-3 py-2 text-xs leading-relaxed">
          {covered ? (
            <p className="text-muted">
              {settled
                ? 'This order met every requirement, so Custom Canvas absorbed the chargeback and your payout was not touched.'
                : `This order meets every requirement we can check here. If the buyer disputes the charge, Custom Canvas covers it and your payout is not affected — provided you also replied to the buyer's messages within ${REPLY_WINDOW_BUSINESS_DAYS} business days, which is confirmed from your message history at dispute time.`}
            </p>
          ) : (
            <>
              {fixable.length > 0 && (
                <>
                  <p className="font-medium text-ink">
                    {settled ? 'What was missing:' : 'To protect this order:'}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                    {fixable.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </>
              )}
              {frozen.length > 0 && (
                <>
                  <p className={`font-medium text-ink ${fixable.length ? 'mt-2' : ''}`}>
                    Fixed at the time of sale — can&apos;t be changed for this order:
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                    {frozen.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-muted">
                    For future sales, list at least {MIN_EVIDENCE_PHOTOS} photographs and write a
                    full condition description before publishing.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
