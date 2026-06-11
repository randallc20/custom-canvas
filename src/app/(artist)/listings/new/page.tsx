'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, ListingFormData } from '@/schemas/listingSchema';
import { useCreateListing } from '@/hooks/useListings';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function NewListingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const createListing = useCreateListing();
  const [artistId, setArtistId] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setArtistId(data.id); });
  }, [user]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    defaultValues: { status: 'available', tags: [] },
  });

  const onSubmit = async (data: ListingFormData) => {
    const { tags, description, width_cm, height_cm, depth_cm, year_created, ...rest } = data;
    await createListing.mutateAsync({
      ...rest,
      description: description || null,
      width_cm: width_cm ?? null,
      height_cm: height_cm ?? null,
      depth_cm: depth_cm ?? null,
      year_created: year_created ?? null,
      artist_id: artistId,
      is_featured: false,
    });
    router.push('/listings');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Create Listing</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Title" {...register('title')} error={errors.title?.message} />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea {...register('description')} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
        </div>
        <Input label="Medium" {...register('medium')} error={errors.medium?.message} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="Width (cm)" type="number" step="0.1" {...register('width_cm', { valueAsNumber: true })} />
          <Input label="Height (cm)" type="number" step="0.1" {...register('height_cm', { valueAsNumber: true })} />
          <Input label="Depth (cm)" type="number" step="0.1" {...register('depth_cm', { valueAsNumber: true })} />
        </div>
        <Input label="Year Created" type="number" {...register('year_created', { valueAsNumber: true })} />
        <Input label="Price ($)" type="number" step="0.01" {...register('price_cents', { setValueAs: (v: string) => Math.round(parseFloat(v) * 100) })} error={errors.price_cents?.message} />
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Image upload coming soon — add images after creating the listing.
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">Create Listing</Button>
      </form>
    </div>
  );
}
