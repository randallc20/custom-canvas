'use client';

import { useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { galleryProfileSchema, GalleryProfileFormData } from '@/schemas/gallerySchema';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { ImageUpload } from '@/components/upload/ImageUpload';
import Image from 'next/image';
import { PARTNER_TYPE_LABELS, type PartnerType } from '@/types/gallery';

export function GalleryProfileEdit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [galleryId, setGalleryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState<GalleryProfileFormData | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void supabase.from('gallery_profiles').select('*').eq('profile_id', user.id).maybeSingle()
      .then(({ data, error }) => {
        // No organisation yet: this form would render empty and its Save would
        // update zero rows while toasting success. Send them to the setup form
        // instead — but only when the row is GENUINELY absent, never on an
        // error, which must not bounce an established partner into onboarding.
        if (!data && !error) {
          router.replace('/onboarding/gallery');
          return;
        }
        if (data) {
          setGalleryId(data.id);
          setBannerUrl(data.banner_image_url ?? null);
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

  // Same immediate-write pattern as the artist banner: the upload is its own
  // save, asserted against zero rows (docs/CONVENTIONS.md).
  const handleBannerUploaded = async (url: string) => {
    const { data: updated, error } = await supabase
      .from('gallery_profiles').update({ banner_image_url: url }).eq('id', galleryId).select('id').maybeSingle();
    if (error || !updated) {
      captureException(error ?? new Error('gallery banner save matched zero rows'), { where: 'GalleryProfileEdit.banner' });
      toast('Failed to save banner', 'error');
    } else {
      setBannerUrl(url);
      toast('Banner updated', 'success');
    }
  };

  const onSubmit = async (data: GalleryProfileFormData) => {
    // .select('id').maybeSingle(): a zero-row update (RLS refusal) must fail
    // visibly instead of toasting success over an unsaved profile.
    const { data: updated, error } = await supabase
      .from('gallery_profiles')
      // '' is "no website"; the column's CHECK (00052) accepts NULL or http(s).
      .update({ ...data, website_url: data.website_url || null })
      .eq('id', galleryId).select('id').maybeSingle();
    if (error || !updated) {
      captureException(error ?? new Error('gallery profile save matched zero rows'), { where: 'GalleryProfileEdit.save' });
      toast('Failed to save changes.', 'error');
    } else {
      toast('Profile updated!', 'success');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Edit Partner Profile</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Organization Name" id="gallery_name" {...register('gallery_name')} error={errors.gallery_name?.message} />
        <div>
          <label htmlFor="partner_type" className="mb-1 block text-sm font-medium text-ink">Organization type</label>
          <select id="partner_type" {...register('partner_type')} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((t) => (
              <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bio" className="mb-1 block text-sm font-medium text-ink">Bio</label>
          <textarea
            id="bio"
            {...register('bio')}
            rows={4}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm
              placeholder:text-muted
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
        <div>
          <p className="mb-1 text-sm font-medium text-ink">Banner image</p>
          {bannerUrl && (
            <div className="relative mb-2 h-28 w-full overflow-hidden rounded-lg border border-line">
              <Image src={bannerUrl} alt="Banner" fill className="object-cover" sizes="640px" />
            </div>
          )}
          <ImageUpload
            endpoint="/api/storage/banner"
            maxFiles={1}
            maxSizeMB={5}
            label={bannerUrl ? 'Replace banner' : 'Add a banner for your public page'}
            onUpload={(urls) => handleBannerUploaded(urls[0])}
          />
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>Save Changes</Button>
      </form>
    </div>
  );
}
