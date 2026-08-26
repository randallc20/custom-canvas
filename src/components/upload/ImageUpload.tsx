'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadWithProgress } from './uploadWithProgress';
import { downscaleImage } from './downscaleImage';

interface UploadingFile {
  name: string;
  progress: number;
}

interface ImageUploadProps {
  /** API route that returns { uploadUrl, publicUrl } */
  endpoint: string;
  maxFiles?: number;
  maxSizeMB?: number;
  accept?: string;
  onUpload: (publicUrls: string[]) => void | Promise<void>;
  label?: string;
}

export function ImageUpload({
  endpoint,
  maxFiles = 1,
  maxSizeMB = 5,
  accept = 'image/jpeg,image/png,image/webp',
  onUpload,
  label = 'Drag & drop images, or tap to choose',
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      setError(null);

      const files = Array.from(fileList).slice(0, maxFiles);
      const maxBytes = maxSizeMB * 1024 * 1024;

      setUploading(files.map((f) => ({ name: f.name, progress: 0 })));
      try {
        const uploadOne = async (blob: Blob, contentType: string, i: number) => {
          const res = await fetch(endpoint, { method: 'POST' });
          if (!res.ok) throw new Error('Could not get upload URL');
          const { uploadUrl, publicUrl } = await res.json();
          await uploadWithProgress(uploadUrl, blob, contentType, (pct) =>
            setUploading((prev) => prev.map((u, j) => (j === i ? { ...u, progress: pct } : u)))
          );
          return publicUrl as string;
        };

        // A photo over the cap is downscaled in the browser rather than
        // rejected — camera photos are routinely 6–12MB and artists shouldn't
        // have to convert files to list their work. Downscales run one at a
        // time (each holds a full-res pixel buffer; eight at once is
        // tab-kill territory on phones) while uploads overlap freely.
        const uploads: Promise<string>[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.size <= maxBytes) {
            uploads.push(uploadOne(file, file.type, i));
            continue;
          }
          const result = await downscaleImage(file, maxBytes);
          if (!result) {
            // In-flight uploads keep running; absorb their rejections so
            // bailing out here can't surface as an unhandled rejection.
            uploads.forEach((p) => p.catch(() => {}));
            throw new Error(`${file.name} couldn't be resized to fit under ${maxSizeMB}MB — try exporting it as a JPG.`);
          }
          uploads.push(uploadOne(result.blob, result.contentType, i));
        }

        const urls = await Promise.all(uploads);
        await onUpload(urls);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading([]);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [endpoint, maxFiles, maxSizeMB, onUpload]
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors duration-150
          ${dragging ? 'border-terra bg-terraSoft' : 'border-line bg-surface hover:bg-sand/40'}`}
      >
        <svg className="mb-2 h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4-4a2 2 0 012.8 0L16 17m-2-2 1.6-1.6a2 2 0 012.8 0L20 15M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zm10 4h.01" />
        </svg>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-xs text-muted/70">
          {maxFiles > 1 ? `Up to ${maxFiles} files. ` : ''}Big photos are resized automatically.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {uploading.map((u) => (
        <div key={u.name} className="mt-2">
          <div className="flex justify-between text-xs text-muted">
            <span className="truncate">{u.name}</span>
            <span>{u.progress}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand">
            <div className="h-full rounded-full bg-terra transition-all duration-200" style={{ width: `${u.progress}%` }} />
          </div>
        </div>
      ))}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
