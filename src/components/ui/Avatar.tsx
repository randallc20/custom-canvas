'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getInitials } from '@/utils/initials';

const sizes = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-lg',
  '2xl': 'h-24 w-24 text-2xl',
};

const pixelSizes: Record<keyof typeof sizes, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
  '2xl': 96,
};

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: keyof typeof sizes;
  className?: string;
}

export function Avatar({ src, alt, size = 'md', className = '' }: AvatarProps) {
  // A file that has gone missing from storage is not the same as no file. Next
  // renders a broken <img> as its ALT TEXT, so a deleted avatar showed the
  // person's whole name sprawling out of a 96px circle rather than the
  // initials this component already knows how to draw. Falling back on error
  // makes the two cases look the same, which is what a reader expects.
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt={alt}
        width={pixelSizes[size]}
        height={pixelSizes[size]}
        className={`${sizes[size]} rounded-full object-cover ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${sizes[size]} flex items-center justify-center rounded-full
        bg-terraText font-semibold text-white ${className}`}
      aria-label={alt}
    >
      {getInitials(alt)}
    </div>
  );
}
