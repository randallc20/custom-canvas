'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { ListingImage } from '@/types/listing';

interface ImageCarouselProps {
  images: ListingImage[];
  title: string;
}

export function ImageCarousel({ images, title }: ImageCarouselProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);

  const goTo = useCallback((index: number) => {
    setSelectedIndex(Math.max(0, Math.min(index, sorted.length - 1)));
  }, [sorted.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(selectedIndex - 1);
      else if (e.key === 'ArrowRight') goTo(selectedIndex + 1);
      else if (e.key === 'Escape') setLightbox(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, goTo]);

  // Freeze the page behind the lightbox; always restore on unmount.
  useEffect(() => {
    if (!lightbox) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lightbox]);

  if (sorted.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-sand">
        <span className="text-muted">No images yet</span>
      </div>
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-sand">
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="block w-full cursor-zoom-in"
          aria-label="View full screen"
        >
          <Image
            src={sorted[selectedIndex].image_url}
            alt={`${title} — image ${selectedIndex + 1} of ${sorted.length}`}
            width={800}
            height={800}
            sizes="(max-width: 1024px) 100vw, 66vw"
            className="aspect-square w-full object-contain"
            priority={selectedIndex === 0}
          />
        </button>
        <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/85 p-2 shadow">
          <svg className="h-4 w-4 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        </span>
        {sorted.length > 1 && (
          <>
            <button
              onClick={() => goTo(selectedIndex - 1)}
              disabled={selectedIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow transition-opacity hover:bg-white disabled:opacity-0 disabled:pointer-events-none"
              aria-label="Previous image"
            >
              <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => goTo(selectedIndex + 1)}
              disabled={selectedIndex === sorted.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow transition-opacity hover:bg-white disabled:opacity-0 disabled:pointer-events-none"
              aria-label="Next image"
            >
              <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — full screen`}
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- full-viewport
              contain against an unknown aspect ratio; next/image's layout modes
              all fight max-h/max-w here */}
          <img
            src={sorted[selectedIndex].image_url}
            alt={`${title} — full screen`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {sorted.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); goTo(selectedIndex - 1); }}
                disabled={selectedIndex === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white disabled:opacity-0 disabled:pointer-events-none"
                aria-label="Previous image"
              >
                <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); goTo(selectedIndex + 1); }}
                disabled={selectedIndex === sorted.length - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white disabled:opacity-0 disabled:pointer-events-none"
                aria-label="Next image"
              >
                <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 rounded-full bg-white/80 p-2 shadow hover:bg-white"
            aria-label="Close full screen"
          >
            <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {sorted.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {sorted.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setSelectedIndex(index)}
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors
                ${index === selectedIndex ? 'border-terra' : 'border-transparent hover:border-line'}`}
              aria-label={`View image ${index + 1}`}
            >
              <Image
                src={image.image_url}
                alt={`${title} thumbnail ${index + 1}`}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
