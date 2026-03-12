import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { GalleryHero } from '@/components/gallery/GalleryHero';
import { notFound } from 'next/navigation';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('gallery_profiles')
    .select('gallery_name, bio')
    .eq('slug', params.slug)
    .single();

  if (!data) return { title: 'Gallery Not Found' };

  return {
    title: data.gallery_name,
    description: data.bio ?? `${data.gallery_name} on Custom Canvas.`,
  };
}

export default async function GalleryPage({ params }: Props) {
  const supabase = createServerSupabaseClient();

  const { data: gallery } = await supabase
    .from('gallery_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', params.slug)
    .single();

  if (!gallery) notFound();

  return (
    <div>
      <GalleryHero gallery={gallery} />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-gray-500">Gallery profile page — more content coming soon.</p>
      </div>
    </div>
  );
}
