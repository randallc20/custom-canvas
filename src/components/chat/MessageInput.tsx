'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { uploadWithProgress } from '@/components/upload/uploadWithProgress';

export interface OutgoingAttachment {
  attachment_type: 'image' | 'file';
  url: string;
  fileName: string;
}

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendAttachment?: (a: OutgoingAttachment) => void;
  disabled: boolean;
}

export function MessageInput({ onSend, onSendAttachment, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Smart conversation starter: seed the draft from ?prefill on first mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get('prefill');
    if (pre) {
      setText(pre);
      params.delete('prefill');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    }
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFile = async (file: File | undefined, kind: 'image' | 'file') => {
    setMenuOpen(false);
    if (!file || !onSendAttachment) return;
    setUploading(true);
    try {
      const res = await fetch('/api/storage/chat-attachment', { method: 'POST' });
      if (!res.ok) throw new Error('upload-url');
      const { uploadUrl, path } = await res.json();
      await uploadWithProgress(uploadUrl, file, file.type);
      // Store the object path; rendered via a signed URL (private bucket).
      onSendAttachment({ attachment_type: kind, url: path, fileName: file.name });
    } catch {
      // surfaced via the disabled state resetting; toast handled by parent on send
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="border-t border-line p-3">
      <div className="flex items-end gap-2">
        {onSendAttachment && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={uploading || disabled}
              className="flex-shrink-0 rounded-full p-2 text-muted hover:bg-sand/60 hover:text-ink disabled:opacity-50"
              aria-label="Attach"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
            {menuOpen && (
              <div className="absolute bottom-12 left-0 z-10 w-36 animate-fade-in overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-card">
                <button onClick={() => imageRef.current?.click()} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-sand/50">Photo</button>
                <button onClick={() => fileRef.current?.click()} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-sand/50">File (PDF)</button>
              </div>
            )}
            <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleFile(e.target.files?.[0], 'image')} />
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0], 'file')} />
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={uploading ? 'Uploading…' : 'Type a message...'}
          rows={1}
          disabled={uploading}
          className="flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink
            focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex-shrink-0 rounded-full bg-terra p-2 text-white transition-colors hover:bg-terraDark disabled:opacity-50"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
