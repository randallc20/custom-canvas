'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';

interface ShareButtonProps {
  title: string;
  text?: string;
  path: string;
  className?: string;
}

export function ShareButton({ title, text, path, className = '' }: ShareButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Link copied', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy link', 'error');
    }
  };

  return (
    <button
      onClick={share}
      className={`inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink transition-colors hover:bg-sand/50 ${className}`}
      aria-label="Share"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      {copied ? 'Copied' : 'Share'}
    </button>
  );
}
