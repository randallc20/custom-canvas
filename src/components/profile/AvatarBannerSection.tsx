'use client';

import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { ImageUpload } from '@/components/upload/ImageUpload';

interface AvatarBannerSectionProps {
  avatarUrl: string | null;
  bannerUrl: string | null;
  displayName: string;
  onAvatarUploaded: (url: string) => void | Promise<void>;
  onBannerUploaded: (url: string) => void | Promise<void>;
}

export function AvatarBannerSection({
  avatarUrl,
  bannerUrl,
  displayName,
  onAvatarUploaded,
  onBannerUploaded,
}: AvatarBannerSectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <Avatar src={avatarUrl} alt={displayName} size="xl" />
        </div>
        <div className="flex-1">
          <p className="mb-2 text-sm font-medium text-ink">Profile photo</p>
          <ImageUpload
            endpoint="/api/storage/avatar"
            maxFiles={1}
            maxSizeMB={2}
            label="Drop a square photo, or tap to choose"
            onUpload={(urls) => onAvatarUploaded(urls[0])}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Banner</p>
        {/* Previewed at the SAME ratio the page renders (36:10), so what the
            artist approves here is what visitors see. */}
        {bannerUrl && (
          <div className="relative mb-2 aspect-[36/10] w-full overflow-hidden rounded-xl border border-line bg-sand">
            <Image src={bannerUrl} alt="Profile banner" fill sizes="(max-width: 768px) 100vw, 640px" className="object-cover" />
          </div>
        )}
        <ImageUpload
          endpoint="/api/storage/banner"
          maxFiles={1}
          maxSizeMB={5}
          label="Drop a banner image (1440×400 works best)"
          onUpload={(urls) => onBannerUploaded(urls[0])}
        />
      </div>
    </div>
  );
}
