'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { CommissionStatus } from '@/components/commission/CommissionStatus';
import { QuoteCard } from '@/components/commission/QuoteCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';
import type { Commission } from '@/types/commission';

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  quoted: 'info',
  accepted: 'info',
  in_progress: 'info',
  completed: 'success',
  delivered: 'success',
  confirmed: 'success',
  disputed: 'danger',
  cancelled: 'danger',
};

export default function CommissionDetailPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'user', 'gallery']}>
        <CommissionDetailContent />
      </AuthGuard>
    </PageShell>
  );
}

function CommissionDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [commission, setCommission] = useState<Commission | null>(null);
  const [artistProfileId, setArtistProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quotedPrice, setQuotedPrice] = useState('');
  const [estimatedCompletion, setEstimatedCompletion] = useState('');
  const [artistNotes, setArtistNotes] = useState('');

  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  useEffect(() => {
    supabase
      .from('commissions')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          router.push('/commissions');
          return;
        }
        setCommission(data);
        setLoading(false);
      });
  }, [id, router]);

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
    setActionLoading(true);
    try {
      const res = await fetch(`/api/commissions/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setCommission(updated);
      toast('Commission updated.', 'success');
    } catch {
      toast('Action failed. Please try again.', 'error');
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

  const handleDispute = () => {
    if (!disputeReason.trim()) {
      toast('Please describe the issue.', 'error');
      return;
    }
    performAction('dispute', { reason: disputeReason });
    setShowDisputeForm(false);
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!commission) return null;

  const isArtist = artistProfileId === user?.id;
  const isRequester = commission.requester_id === user?.id;
  const status = commission.status;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/commissions" className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
        <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to commissions
      </Link>

      <div className="rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{commission.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Budget: {formatPrice(commission.budget_min_cents)} – {formatPrice(commission.budget_max_cents)}
            </p>
          </div>
          <Badge variant={statusVariant[status] ?? 'default'}>
            {status.replace('_', ' ')}
          </Badge>
        </div>

        <div className="mt-4">
          <CommissionStatus commission={commission} />
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700">Description</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{commission.description}</p>
        </div>

        {commission.quoted_price_cents && commission.estimated_completion && (
          <div className="mt-6">
            <QuoteCard
              quotedPriceCents={commission.quoted_price_cents}
              estimatedCompletion={commission.estimated_completion}
              artistNotes={commission.artist_notes}
            />
          </div>
        )}

        {commission.conversation_id && (
          <div className="mt-6">
            <Link
              href={`/messages/${commission.conversation_id}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-terra hover:underline"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Open conversation
            </Link>
          </div>
        )}

        {/* Artist actions */}
        {isArtist && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h3 className="mb-3 text-sm font-medium text-gray-700">Actions</h3>
            <div className="flex flex-wrap gap-3">
              {status === 'pending' && (
                <>
                  <Button onClick={() => setShowQuoteForm(true)} disabled={actionLoading}>
                    Send Quote
                  </Button>
                  <Button variant="outline" onClick={() => performAction('decline')} loading={actionLoading}>
                    Decline
                  </Button>
                </>
              )}
              {(status === 'accepted' || status === 'in_progress') && (
                <Button onClick={() => performAction('complete')} loading={actionLoading}>
                  Mark as Delivered
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Requester actions */}
        {isRequester && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h3 className="mb-3 text-sm font-medium text-gray-700">Actions</h3>
            <div className="flex flex-wrap gap-3">
              {status === 'quoted' && (
                <>
                  <Button onClick={() => performAction('confirm')} loading={actionLoading}>
                    Accept Quote
                  </Button>
                  <Button variant="outline" onClick={() => performAction('decline')} loading={actionLoading}>
                    Decline
                  </Button>
                </>
              )}
              {status === 'delivered' && (
                <>
                  <Button onClick={() => performAction('confirm')} loading={actionLoading}>
                    Confirm Receipt
                  </Button>
                  <Button variant="outline" onClick={() => setShowDisputeForm(true)} disabled={actionLoading}>
                    Report Issue
                  </Button>
                </>
              )}
              {status === 'pending' && (
                <Button variant="outline" onClick={() => performAction('decline')} loading={actionLoading}>
                  Cancel Request
                </Button>
              )}
            </div>
          </div>
        )}

        {showQuoteForm && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h4 className="mb-3 text-sm font-medium text-gray-900">Send a Quote</h4>
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
                <label htmlFor="artist_notes" className="mb-1 block text-sm font-medium text-gray-700">
                  Notes (optional)
                </label>
                <textarea
                  id="artist_notes"
                  value={artistNotes}
                  onChange={(e) => setArtistNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
                  placeholder="Any notes about materials, approach, or conditions..."
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleQuoteSubmit} loading={actionLoading}>Send Quote</Button>
                <Button variant="outline" onClick={() => setShowQuoteForm(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {showDisputeForm && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <h4 className="mb-3 text-sm font-medium text-gray-900">Report an Issue</h4>
            <div className="space-y-3">
              <div>
                <label htmlFor="dispute_reason" className="mb-1 block text-sm font-medium text-gray-700">
                  What went wrong?
                </label>
                <textarea
                  id="dispute_reason"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                    focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
                  placeholder="Describe the issue..."
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleDispute} loading={actionLoading}>Submit</Button>
                <Button variant="outline" onClick={() => setShowDisputeForm(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
