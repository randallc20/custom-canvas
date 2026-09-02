'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { captureException } from '@/lib/sentry';
import { CommissionStatus } from '@/components/commission/CommissionStatus';
import { QuoteCard } from '@/components/commission/QuoteCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { formatPrice } from '@/utils/formatPrice';
import { commissionDisplayStatus } from '@/utils/commissionDisplay';
import { supabase } from '@/lib/supabase';
import type { Commission } from '@/types/commission';
import { usePartnerStatus } from '@/hooks/usePartnerStatus';
import { PartnerBadge } from '@/components/gallery/PartnerBadge';
import { CommissionUpdates } from '@/components/commission/CommissionUpdates';

/** The commission's status, quote, WIP timeline, and role-appropriate
 *  actions — rendered as a rail/drawer inside the conversation thread.
 *  This is the commission's home; there is no standalone page anymore.
 *  Resolved by conversation_id (always written at request time). */
export function CommissionPanel({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [artistProfileId, setArtistProfileId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data: commission = null, isLoading: loading } = useQuery({
    queryKey: ['commission', conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('commissions')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      return (data as Commission | null) ?? null;
    },
  });

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quotedPrice, setQuotedPrice] = useState('');
  const [estimatedCompletion, setEstimatedCompletion] = useState('');
  const [artistNotes, setArtistNotes] = useState('');

  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const { data: requesterPartner } = usePartnerStatus(commission?.requester_id);
  const [disputeReason, setDisputeReason] = useState('');

  useEffect(() => {
    if (!commission) return;
    supabase
      .from('artist_profiles')
      .select('profile_id')
      .eq('id', commission.artist_id)
      .single()
      .then(({ data }) => {
        if (data) setArtistProfileId(data.profile_id);
      });
  }, [commission?.artist_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const performAction = async (action: string, body?: Record<string, unknown>) => {
    if (!commission) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/commissions/${commission.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : 'Action failed');
      }
      const updated = (await res.json()) as Commission;
      queryClient.setQueryData(['commission', conversationId], updated);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast('Commission updated.', 'success');
    } catch (err) {
      captureException(err, { where: `CommissionPanel.performAction:${action}` });
      toast(err instanceof Error ? err.message : 'Action failed. Please try again.', 'error');
    }
    setActionLoading(false);
  };

  const handleQuoteSubmit = () => {
    const priceCents = Math.round(parseFloat(quotedPrice) * 100);
    if (!priceCents || priceCents < 100 || !estimatedCompletion.trim()) {
      toast('Please provide a valid price and timeline.', 'error');
      return;
    }
    performAction('accept', {
      quoted_price_cents: priceCents,
      estimated_completion: estimatedCompletion,
      artist_notes: artistNotes || undefined,
    });
    setShowQuoteForm(false);
  };

  // Decline and Cancel Request close the commission for good — the decline
  // route's status guard means it cannot be reopened — and on a phone they sit
  // a thumb's width from Accept. Every other terminal action in the app
  // confirms first; these two did not.
  const handleRequesterDecline = async () => {
    const ok = await confirm({
      title: 'Decline this quote?',
      message: 'The commission closes and the artist is told you declined. This can\u2019t be undone \u2014 you would need to send a new request to start over.',
      confirmLabel: 'Decline quote',
      destructive: true,
    });
    if (!ok) return;
    performAction('decline');
  };

  const handleCancelRequest = async () => {
    const ok = await confirm({
      title: 'Cancel this request?',
      message: 'The request closes and the artist can no longer quote it. This can\u2019t be undone \u2014 you would need to send a new request.',
      confirmLabel: 'Cancel request',
      destructive: true,
    });
    if (!ok) return;
    performAction('decline');
  };

  const handleDispute = () => {
    if (!disputeReason.trim()) {
      toast('Please describe the issue.', 'error');
      return;
    }
    performAction('dispute', { reason: disputeReason });
    setShowDisputeForm(false);
  };

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (!commission) return <p className="p-4 text-sm text-muted">Commission not found.</p>;

  const isArtist = artistProfileId === user?.id;
  const isRequester = commission.requester_id === user?.id;
  const status = commission.status;
  const display = commissionDisplayStatus(status, {
    closedBy: commission.closed_by,
    viewerIsRequester: isRequester,
  });

  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold text-ink">{commission.title}</h2>
            {requesterPartner?.isVerifiedPartner && (
              <PartnerBadge partnerType={requesterPartner.partnerType} />
            )}
          </div>
          <Badge variant={display.variant}>
            {display.label}
            {display.sub ? ` — ${display.sub}` : ''}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          Budget: {formatPrice(commission.budget_min_cents)} – {formatPrice(commission.budget_max_cents)}
        </p>
      </div>

      <CommissionStatus commission={commission} viewerIsRequester={isRequester} />

      {status === 'cancelled' && commission.closed_reason && (
        <div className="rounded-xl border border-line bg-sand/50 p-3">
          <h3 className="text-sm font-medium text-ink">
            {commission.closed_by === 'artist' ? "Artist's note" : 'Reason'}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{commission.closed_reason}</p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-ink">Brief</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{commission.description}</p>
      </div>

      {commission.quoted_price_cents && commission.estimated_completion && (
        <QuoteCard
          quotedPriceCents={commission.quoted_price_cents}
          estimatedCompletion={commission.estimated_completion}
          artistNotes={commission.artist_notes}
        />
      )}

      {['accepted', 'in_progress', 'completed', 'delivered', 'confirmed', 'disputed'].includes(status) && (
        <CommissionUpdates
          commissionId={commission.id}
          isArtist={isArtist}
          canPost={status === 'accepted' || status === 'in_progress'}
        />
      )}

      {/* Artist actions */}
      {isArtist && (status === 'pending' || status === 'accepted' || status === 'in_progress') && (
        <div className="border-t border-line pt-4">
          <h3 className="mb-3 text-sm font-medium text-ink">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {status === 'pending' && (
              <>
                <Button size="sm" onClick={() => setShowQuoteForm(true)} disabled={actionLoading}>
                  Send Quote
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDeclineForm(true)} disabled={actionLoading}>
                  Decline
                </Button>
              </>
            )}
            {(status === 'accepted' || status === 'in_progress') && (
              <Button size="sm" onClick={() => performAction('complete')} loading={actionLoading}>
                Mark as Delivered
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Requester actions */}
      {isRequester && (status === 'quoted' || status === 'delivered' || status === 'pending') && (
        <div className="border-t border-line pt-4">
          <h3 className="mb-3 text-sm font-medium text-ink">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {status === 'quoted' && (
              <>
                <Button size="sm" onClick={() => performAction('confirm')} loading={actionLoading}>
                  Accept Quote
                </Button>
                <Button size="sm" variant="outline" onClick={handleRequesterDecline} loading={actionLoading}>
                  Decline
                </Button>
              </>
            )}
            {status === 'delivered' && (
              <>
                <Button size="sm" onClick={() => performAction('confirm')} loading={actionLoading}>
                  Confirm Receipt
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDisputeForm(true)} disabled={actionLoading}>
                  Report Issue
                </Button>
              </>
            )}
            {status === 'pending' && (
              <Button size="sm" variant="outline" onClick={handleCancelRequest} loading={actionLoading}>
                Cancel Request
              </Button>
            )}
          </div>
        </div>
      )}

      {showQuoteForm && (
        <div className="rounded-xl border border-line bg-sand/50 p-4">
          <h4 className="mb-3 text-sm font-medium text-ink">Send a Quote</h4>
          <div className="space-y-3">
            <Input
              label="Your Price ($)"
              id="quoted_price"
              type="number"
              step="1"
              min="1"
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(e.target.value)}
              placeholder="250"
            />
            <Input
              label="Estimated Completion"
              id="estimated_completion"
              value={estimatedCompletion}
              onChange={(e) => setEstimatedCompletion(e.target.value)}
              placeholder="e.g. 2-3 weeks"
            />
            <div>
              <label htmlFor="artist_notes" className="mb-1 block text-sm font-medium text-ink">
                Notes (optional)
              </label>
              <textarea
                id="artist_notes"
                value={artistNotes}
                onChange={(e) => setArtistNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm
                  focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
                placeholder="Any notes about materials, approach, or conditions..."
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleQuoteSubmit} loading={actionLoading}>Send Quote</Button>
              <Button size="sm" variant="outline" onClick={() => setShowQuoteForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showDeclineForm && (
        <div className="rounded-xl border border-line bg-sand/50 p-4">
          <h4 className="mb-3 text-sm font-medium text-ink">Decline this request</h4>
          <div className="space-y-3">
            <div>
              <label htmlFor="decline_reason" className="mb-1 block text-sm font-medium text-ink">
                A note for the requester (optional)
              </label>
              <textarea
                id="decline_reason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm
                  focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
                placeholder="e.g. My commission list is full until spring — please check back!"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  performAction('decline', declineReason.trim() ? { reason: declineReason.trim() } : undefined);
                  setShowDeclineForm(false);
                }}
                loading={actionLoading}
              >
                Decline request
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowDeclineForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showDisputeForm && (
        <div className="rounded-xl border border-terra/40 bg-terraSoft/60 p-4">
          <h4 className="mb-3 text-sm font-medium text-ink">Report an Issue</h4>
          <div className="space-y-3">
            <div>
              <label htmlFor="dispute_reason" className="mb-1 block text-sm font-medium text-ink">
                What went wrong?
              </label>
              <textarea
                id="dispute_reason"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm
                  focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
                placeholder="Describe the issue..."
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleDispute} loading={actionLoading}>Submit</Button>
              <Button size="sm" variant="outline" onClick={() => setShowDisputeForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
