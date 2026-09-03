'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, ListingFormData, toCents } from '@/schemas/listingSchema';
import { useCreateListing } from '@/hooks/useListings';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';
import { numberOrNull } from '@/utils/formNumber';
import { AboutPieceFieldset } from '@/components/listing/AboutPieceFieldset';
import { DimensionsFieldset, useDimensionUnit } from '@/components/listing/DimensionsFieldset';
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
  const createListing = useCreateListing();
  const { toast } = useToast();
  const { artist } = useOwnArtistProfile();
  const artistId = artist?.id ?? '';
  const isPickupOnly = isPickupPref(artist?.fulfillment_pref);
  // A failure AFTER the insert (images, tags) used to leave the form looking
  // untouched, and the next Publish inserted a second listing. Remember what
  // was created so a retry patches onto it instead.
  const createdIdRef = useRef<string | null>(null);
  const imagesAttachedRef = useRef(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const moveImage = (i: number, dir: -1 | 1) => {
    setImageUrls((prev) => {
      const next = [...prev];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  };

  const { data: seriesOptions = [] } = useSeries(artistId);

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors, isSubmitting } } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    defaultValues: { status: 'available', tags: [], price_visible: true, ai_involvement: 'none', edition_type: 'original', is_signed: false, is_mature: false },
  });
  const { unit, switchUnit, toCm } = useDimensionUnit(getValues, setValue);

  const priceVisible = watch('price_visible');
  const selectedTags = watch('tags');
  const aiInvolvement = watch('ai_involvement');
  const editionType = watch('edition_type');

  const onSubmit = async (data: ListingFormData, asDraft = false) => {
    let stage: 'create' | 'images' | 'tags' = 'create';
    try {
      let listingId = createdIdRef.current;
      if (!listingId) {
        const listing = await createListing.mutateAsync({
          title: data.title,
          medium: data.medium,
          status: asDraft ? 'draft' : data.status,
          description: data.description || null,
          width_cm: toCm(data.width_cm),
          height_cm: toCm(data.height_cm),
          depth_cm: toCm(data.depth_cm),
          year_created: data.year_created ?? null,
          price_cents: toCents(data.price_dollars),
          shipping_rate_cents: isPickupOnly ? 0 : toCents(data.shipping_dollars),
          ai_involvement: data.ai_involvement,
          ai_disclosure: data.ai_involvement === 'assisted' ? (data.ai_disclosure || null) : null,
          price_visible: data.price_visible,
          sold_price_cents: null,
          show_sold_price: false,
          series_id: data.series_id || null,
          // Listing Standards Part one (L4).
          edition_type: data.edition_type,
          edition_size: data.edition_type === 'limited_edition' ? (data.edition_size ?? null) : null,
          edition_number: data.edition_type === 'limited_edition' ? (data.edition_number ?? null) : null,
          is_signed: !!data.is_signed,
          condition_notes: data.condition_notes,
          handling_notes: data.handling_notes || null,
          is_mature: !!data.is_mature,
        });
        listingId = listing.id;
        createdIdRef.current = listingId;
      }
      stage = 'images';
      if (imageUrls.length > 0 && !imagesAttachedRef.current) {
        await addListingImages(listingId, imageUrls, 0);
        imagesAttachedRef.current = true;
      }
      stage = 'tags';
      if (data.tags.length > 0) {
        await setListingTags(listingId, data.tags);
      }
      // First listing is worth 20 completeness points — refresh canonically.
      // An un-awaited PostgREST builder never issues its request at all, so
      // this has to be awaited; the score is cosmetic, so a failure is logged
      // rather than shown.
      const { error: scoreError } = await supabase.rpc('refresh_completeness_score', { p_artist_id: artistId });
      if (scoreError) captureException(scoreError, { where: 'NewListing.refreshScore' });
      router.push('/studio/work');
    } catch (err) {
      captureException(err, { where: `listings/new.onSubmit:${stage}` });
      // useCreateListing already toasts its own failure; these are the steps
      // after the insert, where the listing exists and the retry is safe.
      if (stage === 'images') {
        toast('Your listing was saved, but the photos could not be attached. Press Publish again to retry.', 'error');
      } else if (stage === 'tags') {
        toast('Your listing was saved, but the tags could not be applied. Press Publish again to retry.', 'error');
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Create Listing</h1>
      <form onSubmit={handleSubmit((d) => onSubmit(d, false))} className="space-y-4">
        <Input label="Title" {...register('title')} error={errors.title?.message} />
        <Textarea label="Description" rows={4} {...register('description')} error={errors.description?.message} />
        <Input label="Medium" {...register('medium')} error={errors.medium?.message} />
        <DimensionsFieldset unit={unit} onSwitch={switchUnit} register={register} />
        <AboutPieceFieldset register={register} errors={errors} editionType={editionType} />
        <Input label="Year Created" type="number" {...register('year_created', { setValueAs: numberOrNull })} error={errors.year_created?.message} />
        {seriesOptions.length > 0 && (
          <Select label="Series (optional)" {...register('series_id')}>
            <option value="">No series</option>
            {seriesOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}

        <TagPicker value={selectedTags} onChange={(tags) => setValue('tags', tags, { shouldDirty: true })} />

        <fieldset className="space-y-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Pricing</legend>
          <Input label="Price ($)" type="number" step="0.01" {...register('price_dollars', { setValueAs: numberOrNull })} error={errors.price_dollars?.message} />
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
          <legend className="px-1 text-sm font-semibold text-ink">How it was made{' '}
            {/* L9: Part two of the standards is the AI rule; the link
                belongs beside the question it governs. */}
            <a href="/listing-standards" target="_blank" className="font-normal text-terraText underline underline-offset-2">
              Listing Standards
            </a>
          </legend>
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
