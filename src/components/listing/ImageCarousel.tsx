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
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);

  const goTo = useCallback((index: number) => {
    setSelectedIndex(Math.max(0, Math.min(index, sorted.length - 1)));
  }, [sorted.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(selectedIndex - 1);
      else if (e.key === 'ArrowRight') goTo(selectedIndex + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, goTo]);

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
        <Image
          src={sorted[selectedIndex].image_url}
          alt={`${title} — image ${selectedIndex + 1} of ${sorted.length}`}
          width={800}
          height={800}
          sizes="(max-width: 1024px) 100vw, 66vw"
          className="aspect-square w-full object-contain"
          priority={selectedIndex === 0}
        />
        {sorted.length > 1 && (
          <>
            <button
              onClick={() => goTo(selectedIndex - 1)}
              disabled={selectedIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow transition-opacity hover:bg-white disabled:opacity-0"
              aria-label="Previous image"
            >
              <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => goTo(selectedIndex + 1)}
              disabled={selectedIndex === sorted.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow transition-opacity hover:bg-white disabled:opacity-0"
              aria-label="Next image"
            >
              <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>
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
