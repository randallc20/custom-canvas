'use client';

import { useRef, useState } from 'react';
import { uploadWithProgress } from './uploadWithProgress';

interface VideoUploadProps {
  /** API route returning { uploadUrl, publicUrl } for the video bucket */
  endpoint: string;
  maxSizeMB?: number;
  onUpload: (video: { videoUrl: string; thumbnailUrl: string | null }) => void | Promise<void>;
}

// Seeks 1s into the video in a detached <video> element and captures a JPEG
// poster frame via canvas. Transcoding is deferred — if format issues arise
// post-launch, add Mux/Cloudflare Stream.
async function captureThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(video.src);
        resolve(blob);
      }, 'image/jpeg', 0.8);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };
  });
}

export function VideoUpload({ endpoint, maxSizeMB = 200, onUpload }: VideoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Video is over ${maxSizeMB}MB.`);
      return;
    }

    setProgress(0);
    try {
      const videoRes = await fetch(endpoint, { method: 'POST' });
      if (!videoRes.ok) throw new Error('Could not get upload URL');
      const videoTarget = await videoRes.json();
      await uploadWithProgress(videoTarget.uploadUrl, file, file.type, setProgress);

      let thumbnailUrl: string | null = null;
      const thumb = await captureThumbnail(file);
      if (thumb) {
        const thumbRes = await fetch(endpoint, { method: 'POST' });
        if (thumbRes.ok) {
          const thumbTarget = await thumbRes.json();
          await uploadWithProgress(thumbTarget.uploadUrl, thumb, 'image/jpeg');
          thumbnailUrl = thumbTarget.publicUrl;
        }
      }

      await onUpload({ videoUrl: videoTarget.publicUrl, thumbnailUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={progress !== null}
        className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-surface p-6 text-center transition-colors duration-150 hover:bg-sand/40 disabled:opacity-60"
      >
        <svg className="mb-2 h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-muted">
          {progress !== null ? `Uploading… ${progress}%` : 'Tap to upload a video'}
        </p>
        <p className="mt-1 text-xs text-muted/70">MP4, MOV or WebM, max {maxSizeMB}MB</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {progress !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand">
          <div className="h-full rounded-full bg-terra transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
