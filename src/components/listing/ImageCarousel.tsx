'use client';

import { useState } from 'react';
import { ListingImage } from '@/types/listing';

interface ImageCarouselProps {
  images: ListingImage[];
}

export function ImageCarousel({ images }: ImageCarouselProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);

  if (sorted.length === 0) {
    return <div className="aspect-square w-full rounded-lg bg-gray-200" />;
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg bg-gray-100">
        <img
          src={sorted[selectedIndex].image_url}
          alt=""
          className="aspect-square w-full object-contain"
        />
      </div>
      {sorted.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {sorted.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setSelectedIndex(index)}
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors
                ${index === selectedIndex ? 'border-[#E8704A]' : 'border-transparent hover:border-gray-300'}`}
            >
              <img src={image.image_url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
