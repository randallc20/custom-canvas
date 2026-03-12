'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { galleryProfileSchema, GalleryProfileFormData } from '@/schemas/gallerySchema';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';
import { slugify } from '@/utils/slugify';

export default function GalleryOnboardingPage() {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<GalleryProfileFormData>({
    resolver: zodResolver(galleryProfileSchema),
    defaultValues: { city: 'Houston' },
  });

  const onSubmit = async (data: GalleryProfileFormData) => {
    if (!user) return;
    const slug = slugify(data.gallery_name);
    await supabase.from('gallery_profiles').insert({
      profile_id: user.id,
      slug,
      ...data,
    });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Pending Verification</h1>
          <p className="mt-2 text-gray-500">Your gallery profile is under review. We&apos;ll notify you once verified.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Set Up Your Gallery</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Gallery Name" id="gallery_name" {...register('gallery_name')} error={errors.gallery_name?.message} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
            <textarea {...register('bio')} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
          </div>
          <Input label="Address" id="address" {...register('address')} />
          <Input label="Neighborhood" id="neighborhood" {...register('neighborhood')} />
          <Input label="Website" id="website_url" {...register('website_url')} placeholder="https://" />
          <Button type="submit" loading={isSubmitting} className="w-full">Submit for Verification</Button>
        </form>
      </div>
    </div>
  );
}
