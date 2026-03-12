'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ListingWithImages } from '@/types/listing';
import { formatPrice } from '@/utils/formatPrice';

interface FeedCardProps {
  listing: ListingWithImages;
}

export function FeedCard({ listing }: FeedCardProps) {
  const primaryImage = listing.images.find((img) => img.is_primary) ?? listing.images[0];

  return (
    <Link href={`/listing/${listing.id}`} className="group block">
      <div className="overflow-hidden rounded-lg bg-gray-100 shadow-sm transition-transform group-hover:scale-[1.02] group-hover:shadow-md">
        {primaryImage && (
          <Image
            src={primaryImage.image_url}
            alt={listing.title}
            width={400}
            height={500}
            className="w-full object-cover"
          />
        )}
        <div className="p-3">
          <h3 className="truncate text-sm font-medium text-gray-900">{listing.title}</h3>
          <p className="text-xs text-gray-500">{listing.medium}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">
              {formatPrice(listing.price_cents)}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="text-gray-400 hover:text-red-500"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
