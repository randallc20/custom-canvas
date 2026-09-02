import Image from 'next/image';

const sizes = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-lg',
};

const pixelSizes: Record<keyof typeof sizes, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: keyof typeof sizes;
  className?: string;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ src, alt, size = 'md', className = '' }: AvatarProps) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={pixelSizes[size]}
        height={pixelSizes[size]}
        className={`${sizes[size]} rounded-full object-cover ${className}`}
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
