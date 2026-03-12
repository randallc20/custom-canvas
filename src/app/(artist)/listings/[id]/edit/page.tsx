'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, ListingFormData } from '@/schemas/listingSchema';
import { useListing, useUpdateListing } from '@/hooks/useListings';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: listing, isLoading } = useListing(id);
  const updateListing = useUpdateListing();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    values: listing ? {
      title: listing.title,
      description: listing.description ?? '',
      medium: listing.medium,
      width_cm: listing.width_cm,
      height_cm: listing.height_cm,
      depth_cm: listing.depth_cm,
      year_created: listing.year_created,
      price_cents: listing.price_cents,
      status: listing.status,
      tags: listing.tags?.map((t) => t.name) ?? [],
    } : undefined,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const onSubmit = async (data: ListingFormData) => {
    await updateListing.mutateAsync({ id, data });
    router.push('/listings');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Listing</h1>
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
        <Input label="Price ($)" type="number" step="0.01" {...register('price_cents', { setValueAs: (v: string) => Math.round(parseFloat(v) * 100) })} error={errors.price_cents?.message} />
        <select {...register('status')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="available">Available</option>
          <option value="hidden">Hidden</option>
          <option value="commission_only">Commission Only</option>
        </select>
        <Button type="submit" loading={isSubmitting} className="w-full">Save Changes</Button>
      </form>
    </div>
  );
}
