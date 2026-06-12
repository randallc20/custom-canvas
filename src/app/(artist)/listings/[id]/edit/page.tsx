'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, ListingFormData, toCents } from '@/schemas/listingSchema';
import { useListing, useUpdateListing } from '@/hooks/useListings';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { numberOrNull } from '@/utils/formNumber';
import { isPickupOnly as isPickupPref } from '@/utils/fulfillment';
import { useSeries } from '@/hooks/useArtistContent';

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { data: listing, isLoading } = useListing(id);
  const updateListing = useUpdateListing();
  const [isPickupOnly, setIsPickupOnly] = useState(false);
  const [artistId, setArtistId] = useState('');
  const { data: seriesOptions = [] } = useSeries(artistId);

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id, fulfillment_pref').eq('profile_id', user.id).single()
      .then(({ data }) => {
        if (data) setArtistId(data.id);
        setIsPickupOnly(isPickupPref(data?.fulfillment_pref));
      });
  }, [user]);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    values: listing ? {
      title: listing.title,
      description: listing.description ?? '',
      medium: listing.medium,
      width_cm: listing.width_cm,
      height_cm: listing.height_cm,
      depth_cm: listing.depth_cm,
      year_created: listing.year_created,
      price_dollars: listing.price_cents / 100,
      shipping_dollars: (listing.shipping_rate_cents ?? 0) / 100,
      price_visible: listing.price_visible ?? true,
      show_sold_price: listing.show_sold_price ?? false,
      sold_price_dollars: listing.sold_price_cents != null ? listing.sold_price_cents / 100 : null,
      series_id: listing.series_id ?? '',
      status: listing.status,
      tags: listing.tags?.map((t) => t.name) ?? [],
    } : undefined,
  });

  const priceVisible = watch('price_visible');
  const isSold = listing?.status === 'sold';

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const onSubmit = async (data: ListingFormData) => {
    await updateListing.mutateAsync({
      id,
      data: {
        title: data.title,
        description: data.description || null,
        medium: data.medium,
        width_cm: data.width_cm ?? null,
        height_cm: data.height_cm ?? null,
        depth_cm: data.depth_cm ?? null,
        year_created: data.year_created ?? null,
        price_cents: toCents(data.price_dollars),
        shipping_rate_cents: isPickupOnly ? 0 : toCents(data.shipping_dollars),
        price_visible: data.price_visible,
        show_sold_price: data.show_sold_price ?? false,
        sold_price_cents: data.sold_price_dollars != null ? toCents(data.sold_price_dollars) : null,
        series_id: data.series_id || null,
        status: data.status,
      },
    });
    router.push('/listings');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Edit Listing</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Title" {...register('title')} error={errors.title?.message} />
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Description</label>
          <textarea {...register('description')} rows={4} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20" />
        </div>
        <Input label="Medium" {...register('medium')} error={errors.medium?.message} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="Width (cm)" type="number" step="0.1" {...register('width_cm', { setValueAs: numberOrNull })} />
          <Input label="Height (cm)" type="number" step="0.1" {...register('height_cm', { setValueAs: numberOrNull })} />
          <Input label="Depth (cm)" type="number" step="0.1" {...register('depth_cm', { setValueAs: numberOrNull })} />
        </div>

        {seriesOptions.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Series (optional)</label>
            <select {...register('series_id')} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm">
              <option value="">No series</option>
              {seriesOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Pricing</legend>
          <Input label="Price ($)" type="number" step="0.01" {...register('price_dollars', { valueAsNumber: true })} error={errors.price_dollars?.message} />
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('price_visible')} className="rounded border-line" />
            <span className="text-sm text-ink">Show price publicly</span>
          </label>
          {!priceVisible && (
            <p className="text-xs text-muted">Buyers will see &ldquo;Contact for price&rdquo; and can message you to discuss.</p>
          )}
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Shipping</legend>
          {isPickupOnly ? (
            <p className="text-sm text-muted">
              Local pickup only — your fulfillment preference is set to pickup, so buyers
              won&apos;t be charged shipping. Change this in your profile settings.
            </p>
          ) : (
            <Input
              label="Shipping rate ($)"
              type="number"
              step="0.01"
              {...register('shipping_dollars', { setValueAs: numberOrNull })}
              error={errors.shipping_dollars?.message}
            />
          )}
        </fieldset>

        {isSold && (
          <fieldset className="space-y-4 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-ink">Sold Price</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register('show_sold_price')} className="rounded border-line" />
              <span className="text-sm text-ink">Show sold price publicly</span>
            </label>
            <Input
              label="Sold price ($)"
              type="number"
              step="0.01"
              {...register('sold_price_dollars', { setValueAs: numberOrNull })}
              error={errors.sold_price_dollars?.message}
            />
          </fieldset>
        )}

        <select {...register('status')} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <option value="available">Available</option>
          <option value="hidden">Hidden</option>
          <option value="commission_only">Commission Only</option>
          {isSold && <option value="sold">Sold</option>}
          {listing?.status === 'draft' && <option value="draft">Draft</option>}
        </select>
        <Button type="submit" loading={isSubmitting} className="w-full">Save Changes</Button>
      </form>
    </div>
  );
}
