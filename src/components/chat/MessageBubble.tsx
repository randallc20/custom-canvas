'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Message } from '@/types/message';
import { formatTime } from '@/utils/formatTime';
import { formatPrice } from '@/utils/formatPrice';
import { PartnerBadge } from '@/components/gallery/PartnerBadge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useSignedChatUrl } from '@/hooks/useSignedChatUrl';
import type { PartnerType } from '@/types/gallery';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Set when the sender is a verified partner — renders the shield. */
  senderPartnerType?: PartnerType | null;
}

export function MessageBubble({ message, isOwn, senderPartnerType }: MessageBubbleProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [acting, setActing] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const attachment = message.attachments?.[0];

  // Chat media lives in a private bucket — resolve a signed URL by object path.
  const isChatMedia = message.message_type === 'image' || attachment?.attachment_type === 'file';
  const { data: signedUrl } = useSignedChatUrl(isChatMedia ? (attachment?.url ?? null) : null);

  if (message.message_type === 'system') {
    return <div className="py-1 text-center text-xs italic text-muted">{message.content}</div>;
  }

  const meta = (attachment?.metadata ?? {}) as Record<string, unknown>;

  // Listing card — shared piece with View link.
  if (message.message_type === 'listing_card' && attachment) {
    const listingId = meta.listing_id as string | undefined;
    return (
      <Wrapper isOwn={isOwn} senderPartnerType={senderPartnerType} createdAt={message.created_at}>
        <div className="w-56 overflow-hidden rounded-xl border border-line bg-surface text-ink">
          {attachment.url && (
            <Image src={attachment.url} alt={(meta.title as string) ?? 'Listing'} width={224} height={150} className="h-32 w-full object-cover" />
          )}
          <div className="p-3">
            <p className="truncate text-sm font-medium">{(meta.title as string) ?? 'Listing'}</p>
            {typeof meta.price_cents === 'number' && <p className="text-sm text-muted">{formatPrice(meta.price_cents)}</p>}
            {listingId && (
              <Link href={`/listing/${listingId}`} className="mt-2 block">
                <Button size="sm" variant="outline" className="w-full">View</Button>
              </Link>
            )}
          </div>
        </div>
      </Wrapper>
    );
  }

  // Quote card — in-thread commission quote with Accept/Decline for the buyer.
  if (message.message_type === 'quote_card' && attachment) {
    const commissionId = meta.commission_id as string | undefined;
    const price = meta.quoted_price_cents as number | undefined;
    const completion = meta.estimated_completion as string | undefined;
    const notes = meta.artist_notes as string | undefined;

    const act = async (action: 'confirm' | 'decline') => {
      if (!commissionId) return;
      // Same terminal, unreopenable close as the rail's Decline — confirm it.
      if (action === 'decline') {
        const ok = await confirm({
          title: 'Decline this quote?',
          message: 'The commission closes and the artist is told you declined. This can\u2019t be undone \u2014 you would need to send a new request to start over.',
          confirmLabel: 'Decline quote',
          destructive: true,
        });
        if (!ok) return;
      }
      setActing(true);
      try {
        const res = await fetch(`/api/commissions/${commissionId}/${action}`, { method: 'POST' });
        if (!res.ok) throw new Error();
        setResolved(action === 'confirm' ? 'Accepted' : 'Declined');
        toast(action === 'confirm' ? 'Quote accepted' : 'Quote declined', 'success');
        // Reflect the new commission status across the thread, the rail, and
        // the inbox pills.
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        queryClient.invalidateQueries({ queryKey: ['commission'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        router.refresh();
      } catch (err) {
        captureException(err, { where: 'MessageBubble.quoteAction' });
        toast('Action failed. Try again.', 'error');
      } finally {
        setActing(false);
      }
    };

    return (
      <Wrapper isOwn={isOwn} senderPartnerType={senderPartnerType} createdAt={message.created_at}>
        <div className="w-64 rounded-xl border border-line bg-surface p-4 text-ink">
          <p className="font-display text-sm font-semibold">Commission quote</p>
          {typeof price === 'number' && <p className="mt-1 text-lg font-bold text-terraText">{formatPrice(price)}</p>}
          {completion && <p className="text-xs text-muted">Est. completion: {completion}</p>}
          {notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{notes}</p>}
          {resolved ? (
            <p className="mt-3 text-sm font-medium text-sageText">{resolved}</p>
          ) : !isOwn ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => act('confirm')} loading={acting}>Accept</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => act('decline')} disabled={acting}>Decline</Button>
            </div>
          ) : (
            // Sender's own quote — live status is in the commission rail.
            <p className="mt-3 text-xs text-muted">Quote sent</p>
          )}
        </div>
      </Wrapper>
    );
  }

  // Image attachment (signed URL; show a placeholder until it resolves).
  if (message.message_type === 'image') {
    return (
      <Wrapper isOwn={isOwn} senderPartnerType={senderPartnerType} createdAt={message.created_at}>
        {signedUrl ? (
          <Image src={signedUrl} alt="Shared image" width={300} height={300} className="max-w-full rounded-lg" sizes="300px" />
        ) : (
          <div className="flex h-40 w-52 items-center justify-center rounded-lg bg-line/50 text-xs text-muted">Loading image…</div>
        )}
      </Wrapper>
    );
  }

  // File attachment (signed URL).
  if (attachment?.attachment_type === 'file') {
    return (
      <Wrapper isOwn={isOwn} senderPartnerType={senderPartnerType} createdAt={message.created_at}>
        <a href={signedUrl ?? '#'} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 text-sm underline ${isOwn ? 'text-white' : 'text-terraText'} ${signedUrl ? '' : 'pointer-events-none opacity-60'}`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
          {message.content || 'Attachment'}
        </a>
      </Wrapper>
    );
  }

  // Plain text.
  return (
    <Wrapper isOwn={isOwn} senderPartnerType={senderPartnerType} createdAt={message.created_at}>
      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
    </Wrapper>
  );
}

function Wrapper({ isOwn, senderPartnerType, createdAt, children }: {
  isOwn: boolean;
  senderPartnerType?: PartnerType | null;
  createdAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isOwn ? 'bg-terraText text-white' : 'bg-sand text-ink'}`}>
        {children}
        <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isOwn ? 'text-white/70' : 'text-muted'}`}>
          {!isOwn && senderPartnerType != null && <PartnerBadge partnerType={senderPartnerType} compact />}
          {formatTime(createdAt)}
        </p>
      </div>
    </div>
  );
}
