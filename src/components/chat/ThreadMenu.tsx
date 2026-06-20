'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBlockedIds, useMutedConversationIds, useToggleBlock, useToggleMute } from '@/hooks/useChatSafety';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { reportUser } from '@/services/reports';
import type { ReportReason } from '@/types/report';

interface ThreadMenuProps {
  conversationId: string;
  otherUserId: string;
  otherName: string;
}

export function ThreadMenu({ conversationId, otherUserId, otherName }: ThreadMenuProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: blockedIds = [] } = useBlockedIds(user?.id ?? '');
  const { data: mutedIds = [] } = useMutedConversationIds(user?.id ?? '');
  const toggleBlock = useToggleBlock();
  const toggleMute = useToggleMute();

  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('inappropriate');
  const [reportDesc, setReportDesc] = useState('');
  const [reporting, setReporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isBlocked = blockedIds.includes(otherUserId);
  const isMuted = mutedIds.includes(conversationId);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!user) return null;

  const onMute = () => {
    setOpen(false);
    toggleMute.mutate({ profileId: user.id, conversationId, isMuted },
      { onSuccess: () => toast(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success') });
  };

  const onBlock = async () => {
    setOpen(false);
    const ok = isBlocked || await confirm({
      title: `Block ${otherName}?`,
      message: 'They won’t be able to message you, and this thread will hide. They aren’t notified.',
      confirmLabel: 'Block', destructive: true,
    });
    if (!ok) return;
    toggleBlock.mutate({ blockerId: user.id, blockedId: otherUserId, isBlocked }, {
      onSuccess: () => {
        toast(isBlocked ? 'Unblocked' : `Blocked ${otherName}`, 'success');
        if (!isBlocked) router.push('/messages');
      },
    });
  };

  const submitReport = async () => {
    setReporting(true);
    try {
      await reportUser({ reporterId: user.id, profileId: otherUserId, conversationId, reason: reportReason, description: reportDesc || undefined });
      toast('Report submitted. Our team will review it.', 'success');
      setReportOpen(false); setReportDesc('');
    } catch {
      toast('Could not submit report', 'error');
    } finally {
      setReporting(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Conversation options" className="rounded-full p-1.5 text-muted hover:bg-sand/60 hover:text-ink">
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 animate-fade-in overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-card">
          <button onClick={onMute} className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-sand/50">{isMuted ? 'Unmute' : 'Mute'} conversation</button>
          <button onClick={onBlock} className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-sand/50">{isBlocked ? 'Unblock' : 'Block'} {otherName}</button>
          <button onClick={() => { setOpen(false); setReportOpen(true); }} className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-sand/50">Report user</button>
        </div>
      )}

      <Modal isOpen={reportOpen} title={`Report ${otherName}`} onClose={() => setReportOpen(false)}>
        <div className="space-y-3">
          <select value={reportReason} onChange={(e) => setReportReason(e.target.value as ReportReason)} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="inappropriate">Inappropriate behavior</option>
            <option value="spam">Spam</option>
            <option value="misleading">Scam or misleading</option>
            <option value="other">Other</option>
          </select>
          <textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} rows={3} placeholder="Add details (optional)" className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink" />
          <Button className="w-full" onClick={submitReport} loading={reporting}>Submit report</Button>
        </div>
      </Modal>
    </div>
  );
}
