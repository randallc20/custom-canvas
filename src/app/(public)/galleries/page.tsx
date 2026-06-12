import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { GalleryBadge } from '@/components/gallery/GalleryBadge';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = {
  title: 'Galleries',
  description: 'Discover verified galleries on Custom Canvas.',
};

export default async function GalleriesPage() {
  const supabase = createServerSupabaseClient();

  const { data: galleries } = await supabase
    .from('gallery_profiles')
    .select('*')
    .eq('is_verified', true)
    .order('gallery_name', { ascending: true });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Galleries</h1>
      <p className="mb-8 text-gray-500">Verified galleries showcasing Houston&apos;s emerging artists.</p>

      {!galleries || galleries.length === 0 ? (
        <EmptyState
          title="No galleries yet"
          description="Verified galleries will appear here."
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {galleries.map((gallery) => (
            <Link
              key={gallery.id}
              href={`/gallery/${gallery.slug}`}
              className="group overflow-hidden rounded-xl border border-gray-200 transition-shadow hover:shadow-md"
            >
              <div className="relative h-32 bg-gray-100">
                {gallery.banner_image_url && (
                  <Image
                    src={gallery.banner_image_url}
                    alt={`${gallery.gallery_name} banner`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 group-hover:text-terra">
                    {gallery.gallery_name}
                  </h3>
                  {gallery.is_verified && <GalleryBadge />}
                </div>
                {gallery.neighborhood && (
                  <p className="mt-1 text-sm text-gray-500">{gallery.neighborhood}, {gallery.city}</p>
                )}
                {gallery.bio && (
                  <p className="mt-2 line-clamp-2 text-sm text-gray-500">{gallery.bio}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
