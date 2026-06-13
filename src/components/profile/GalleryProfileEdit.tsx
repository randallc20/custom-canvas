'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { galleryProfileSchema, GalleryProfileFormData } from '@/schemas/gallerySchema';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { PARTNER_TYPE_LABELS, type PartnerType } from '@/types/gallery';

export function GalleryProfileEdit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [galleryId, setGalleryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState<GalleryProfileFormData | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('gallery_profiles').select('*').eq('profile_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setGalleryId(data.id);
          setGallery({
            gallery_name: data.gallery_name,
            partner_type: data.partner_type ?? 'gallery',
            bio: data.bio ?? '',
            address: data.address ?? '',
            neighborhood: data.neighborhood ?? '',
            city: data.city,
            website_url: data.website_url ?? '',
          });
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
    const { error } = await supabase.from('gallery_profiles').update(data).eq('id', galleryId);
    if (error) {
      toast('Failed to save changes.', 'error');
    } else {
      toast('Profile updated!', 'success');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Partner Profile</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Organization Name" id="gallery_name" {...register('gallery_name')} error={errors.gallery_name?.message} />
        <div>
          <label htmlFor="partner_type" className="mb-1 block text-sm font-medium text-gray-700">Organization type</label>
          <select id="partner_type" {...register('partner_type')} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((t) => (
              <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bio" className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
          <textarea
            id="bio"
            {...register('bio')}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
              placeholder:text-gray-400
              focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
            placeholder="Tell visitors about your organization, your mission, and how you support artists..."
          />
        </div>
        <Input label="Address" id="address" {...register('address')} placeholder="123 Main St" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Neighborhood" id="neighborhood" {...register('neighborhood')} placeholder="e.g. Montrose" />
          <Input label="City" id="city" {...register('city')} error={errors.city?.message} />
        </div>
        <Input label="Website" id="website_url" {...register('website_url')} placeholder="https://" error={errors.website_url?.message} />
        <Button type="submit" loading={isSubmitting}>Save Changes</Button>
      </form>
    </div>
  );
}
