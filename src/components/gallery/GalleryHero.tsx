import Image from 'next/image';
import { GalleryProfile } from '@/types/gallery';
import { PartnerBadge } from './PartnerBadge';
import { BannerFallback } from './BannerFallback';

interface GalleryHeroProps {
  gallery: GalleryProfile;
}

// Mirrors the DB CHECK (00052): anything that is not http(s) is not a link
// we will put under our domain, even if a row somehow carries it.
const HTTP_URL = /^https?:\/\//i;

export function GalleryHero({ gallery }: GalleryHeroProps) {
  const websiteUrl =
    gallery.website_url && HTTP_URL.test(gallery.website_url) ? gallery.website_url : null;
  return (
    <div>
      {/* The banner's shape must match what the uploader promises. The editor
          says "1440x400 works best" (3.6:1) and previews it at that ratio;
          this was a FIXED 192/256px height at full bleed, so on a 1512px
          laptop the same image was squeezed into roughly 5.9:1 and about 40%
          of it — including, in the report that found this, most of a group
          photo — was simply cut away. Wider monitors made it worse.

          An aspect box instead of a height: a correctly-sized banner is shown
          whole at any width up to 1440px, and the cap keeps the hero from
          swallowing the fold on very wide screens. Reported by a tester,
          2026-09-03. */}
      <div className="relative aspect-[36/10] max-h-[25rem] w-full overflow-hidden bg-sand">
        {gallery.banner_image_url ? (
          <Image src={gallery.banner_image_url} alt={`${gallery.gallery_name} banner`} fill className="object-cover" sizes="100vw" priority />
        ) : (
          <BannerFallback name={gallery.gallery_name} />
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
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-sm text-terraText hover:underline"
          >
            {websiteUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}
          </a>
        )}
        {gallery.bio && <p className="mt-3 text-muted">{gallery.bio}</p>}
      </div>
    </div>
  );
}
