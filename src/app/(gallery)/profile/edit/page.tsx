'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { galleryProfileSchema, GalleryProfileFormData } from '@/schemas/gallerySchema';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function EditGalleryProfilePage() {
  const { user } = useAuth();
  const [galleryId, setGalleryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState<GalleryProfileFormData | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('gallery_profiles').select('*').eq('profile_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setGalleryId(data.id);
          setGallery({ gallery_name: data.gallery_name, bio: data.bio ?? '', address: data.address ?? '', neighborhood: data.neighborhood ?? '', city: data.city, website_url: data.website_url ?? '' });
        }
        setLoading(false);
      });
  }, [user]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<GalleryProfileFormData>({
    resolver: zodResolver(galleryProfileSchema),
    values: gallery ?? undefined,
  });

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const onSubmit = async (data: GalleryProfileFormData) => {
    await supabase.from('gallery_profiles').update(data).eq('id', galleryId);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Gallery Profile</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Gallery Name" {...register('gallery_name')} error={errors.gallery_name?.message} />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
          <textarea {...register('bio')} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
        </div>
        <Input label="Address" {...register('address')} />
        <Input label="Neighborhood" {...register('neighborhood')} />
        <Input label="Website" {...register('website_url')} />
        <Button type="submit" loading={isSubmitting}>Save Changes</Button>
      </form>
    </div>
  );
}
