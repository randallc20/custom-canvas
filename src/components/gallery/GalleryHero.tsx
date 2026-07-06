import Image from 'next/image';
import { GalleryProfile } from '@/types/gallery';
import { PartnerBadge } from './PartnerBadge';

interface GalleryHeroProps {
  gallery: GalleryProfile;
}

export function GalleryHero({ gallery }: GalleryHeroProps) {
  return (
    <div>
      <div className="relative h-48 w-full bg-sand md:h-64">
        {gallery.banner_image_url && (
          <Image src={gallery.banner_image_url} alt={`${gallery.gallery_name} banner`} fill className="object-cover" sizes="100vw" priority />
        )}
      </div>
      <div className="mx-auto max-w-7xl px-4">
        <div className="-mt-12 mb-4">
          <div className="inline-flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gray-300 text-2xl font-bold text-white shadow-lg">
            {gallery.avatar_url ? (
              <Image src={gallery.avatar_url} alt={gallery.gallery_name} width={96} height={96} className="h-full w-full rounded-full object-cover" />
            ) : (
              gallery.gallery_name[0].toUpperCase()
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-ink">{gallery.gallery_name}</h1>
          {gallery.is_verified && <PartnerBadge partnerType={gallery.partner_type} />}
        </div>
        {gallery.address && <p className="mt-1 text-sm text-muted">{gallery.address}</p>}
        {gallery.bio && <p className="mt-3 text-muted">{gallery.bio}</p>}
      </div>
    </div>
  );
}
