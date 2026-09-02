'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/context/AuthContext';
import { useCreateReport } from '@/hooks/useReports';
import type { ReportReason } from '@/types/report';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'misleading', label: 'Misleading listing' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
];

interface ReportButtonProps {
  listingId: string;
}

export function ReportButton({ listingId }: ReportButtonProps) {
  const { user } = useAuth();
  const createReport = useCreateReport();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('inappropriate');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!user) return null;

  const handleSubmit = () => {
    createReport.mutate(
      { reporterId: user.id, listingId, reason, description: description.trim() || undefined },
      { onSuccess: () => setSubmitted(true) }
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-muted hover:text-red-500"
      >
        Report this listing
      </button>
      <Modal isOpen={open} title={submitted ? 'Report Submitted' : 'Report Listing'} onClose={() => { setOpen(false); setSubmitted(false); }}>
          {submitted ? (
            <div className="space-y-3 text-center">
              <p className="text-muted">Thanks for letting us know. We&apos;ll review this listing.</p>
              <Button onClick={() => { setOpen(false); setSubmitted(false); }}>Close</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Select
                label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
              <Textarea
                label="Details (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Tell us more about what's wrong..."
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="danger" loading={createReport.isPending} onClick={handleSubmit}>Submit Report</Button>
              </div>
            </div>
          )}
        </Modal>
    </>
  );
}
