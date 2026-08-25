'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, ListingFormData, toCents } from '@/schemas/listingSchema';
import { useCreateListing } from '@/hooks/useListings';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { numberOrNull } from '@/utils/formNumber';
import { isPickupOnly as isPickupPref } from '@/utils/fulfillment';
import { useSeries } from '@/hooks/useArtistContent';
import { TagPicker } from '@/components/listing/TagPicker';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { ImageThumbGrid } from '@/components/upload/ImageThumbGrid';
import { PhotoTipsPanel } from '@/components/upload/PhotoTipsPanel';
import { MAX_LISTING_IMAGES } from '@/components/listing/ListingImagesManager';
import { addListingImages, setListingTags } from '@/services/listings';

export default function NewListingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const createListing = useCreateListing();
  const [artistId, setArtistId] = useState('');
  const [isPickupOnly, setIsPickupOnly] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const moveImage = (i: number, dir: -1 | 1) => {
    setImageUrls((prev) => {
      const next = [...prev];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  };

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id, fulfillment_pref').eq('profile_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setArtistId(data.id);
          setIsPickupOnly(isPickupPref(data.fulfillment_pref));
        }
      });
  }, [user]);

  const { data: seriesOptions = [] } = useSeries(artistId);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    defaultValues: { status: 'available', tags: [], price_visible: true, ai_involvement: 'none' },
  });

  const priceVisible = watch('price_visible');
  const selectedTags = watch('tags');
  const aiInvolvement = watch('ai_involvement');

  const onSubmit = async (data: ListingFormData, asDraft = false) => {
    const listing = await createListing.mutateAsync({
      title: data.title,
      medium: data.medium,
      status: asDraft ? 'draft' : data.status,
      description: data.description || null,
      width_cm: data.width_cm ?? null,
      height_cm: data.height_cm ?? null,
      depth_cm: data.depth_cm ?? null,
      year_created: data.year_created ?? null,
      price_cents: toCents(data.price_dollars),
      shipping_rate_cents: isPickupOnly ? 0 : toCents(data.shipping_dollars),
      ai_involvement: data.ai_involvement,
      ai_disclosure: data.ai_involvement === 'assisted' ? (data.ai_disclosure || null) : null,
      price_visible: data.price_visible,
      sold_price_cents: null,
      show_sold_price: false,
      series_id: data.series_id || null,
      artist_id: artistId,
      is_featured: false,
    });
    if (imageUrls.length > 0) {
      await addListingImages(listing.id, imageUrls, 0);
    }
    if (data.tags.length > 0) {
      await setListingTags(listing.id, data.tags);
    }
    // First listing is worth 20 completeness points — refresh canonically.
    supabase.rpc('refresh_completeness_score', { p_artist_id: artistId });
    router.push('/studio/work');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Create Listing</h1>
      <form onSubmit={handleSubmit((d) => onSubmit(d, false))} className="space-y-4">
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
        <Input label="Year Created" type="number" {...register('year_created', { setValueAs: numberOrNull })} />
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

        <TagPicker value={selectedTags} onChange={(tags) => setValue('tags', tags, { shouldDirty: true })} />

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
              placeholder="0.00"
              {...register('shipping_dollars', { setValueAs: numberOrNull })}
              error={errors.shipping_dollars?.message}
            />
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">How it was made</legend>
          <p className="text-xs leading-relaxed text-muted">
            Custom Canvas sells work made by people. Wholly AI-generated work isn&apos;t
            permitted. If a generative tool was one step inside a piece you authored, say so
            and say what you contributed — buyers are entitled to know, and undisclosed AI
            use can be treated as misrepresentation.
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" value="none" className="mt-1" {...register('ai_involvement')} />
              <span>No generative AI was used.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" value="assisted" className="mt-1" {...register('ai_involvement')} />
              <span>A generative tool was part of my process.</span>
            </label>
          </div>
          {aiInvolvement === 'assisted' && (
            <div>
              <Input
                label="What did you contribute?"
                placeholder="e.g. generated a colour study, then painted the final work in oil"
                {...register('ai_disclosure')}
                error={errors.ai_disclosure?.message}
              />
              <p className="mt-1 text-xs text-muted">
                Shown on the listing. At least 20 characters.
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Images</legend>
          <PhotoTipsPanel />
          <ImageThumbGrid
            items={imageUrls.map((url) => ({ key: url, url }))}
            onMove={moveImage}
            onRemove={(i) => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
          />
          {imageUrls.length < MAX_LISTING_IMAGES && (
            <ImageUpload
              endpoint="/api/storage/listing-image"
              maxFiles={MAX_LISTING_IMAGES - imageUrls.length}
              maxSizeMB={5}
              label="Add photos of this piece"
              onUpload={(urls) => setImageUrls((prev) => [...prev, ...urls].slice(0, MAX_LISTING_IMAGES))}
            />
          )}
          <p className="text-xs text-muted">{imageUrls.length}/{MAX_LISTING_IMAGES} images. The first image is the cover shown in the feed.</p>
        </fieldset>
        <div className="flex gap-3">
          <Button type="button" variant="outline" loading={isSubmitting} className="flex-1" onClick={handleSubmit((d) => onSubmit(d, true))}>
            Save as draft
          </Button>
          <Button type="submit" loading={isSubmitting} className="flex-1">Publish Listing</Button>
        </div>
      </form>
    </div>
  );
}
