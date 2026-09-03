'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, ListingFormData, toCents } from '@/schemas/listingSchema';
import { useListing, useUpdateListing } from '@/hooks/useListings';
import { setListingTags } from '@/services/listings';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { captureException } from '@/lib/sentry';
import { useEffect, useRef } from 'react';
import { TagPicker } from '@/components/listing/TagPicker';
import { numberOrNull } from '@/utils/formNumber';
import { cmToIn } from '@/utils/dimensions';
import { AboutPieceFieldset } from '@/components/listing/AboutPieceFieldset';
import { DimensionsFieldset, useDimensionUnit } from '@/components/listing/DimensionsFieldset';
import { isPickupOnly as isPickupPref } from '@/utils/fulfillment';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';
import { useSeries } from '@/hooks/useArtistContent';
import { ListingImagesManager } from '@/components/listing/ListingImagesManager';
import { PhotoTipsPanel } from '@/components/upload/PhotoTipsPanel';

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: listing, isLoading, isError } = useListing(id);
  const updateListing = useUpdateListing();
  const { toast } = useToast();
  const { artist, loading: artistLoading } = useOwnArtistProfile();
  const artistId = artist?.id ?? '';
  const isPickupOnly = isPickupPref(artist?.fulfillment_pref);
  const { data: seriesOptions = [] } = useSeries(artistId);

  const { register, handleSubmit, watch, setValue, getValues, reset, formState: { errors, isSubmitting } } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
  });
  const { unit, switchUnit, toCm } = useDimensionUnit(getValues, setValue);

  // Populate ONCE when the listing loads, deliberately not via the reactive
  // `values` prop: a background refetch (window focus, second tab) would
  // deep-diff and reset the whole form — wiping in-progress edits, and worse,
  // repainting inch-converted dimensions while the unit toggle says cm, so
  // the next save would shrink stored dimensions by 2.54×.
  const initialized = useRef(false);
  useEffect(() => {
    if (!listing || initialized.current) return;
    initialized.current = true;
    reset({
      title: listing.title,
      description: listing.description ?? '',
      medium: listing.medium,
      // Stored cm, shown inches-first (the hook's unit starts at 'in').
      width_cm: listing.width_cm != null ? cmToIn(listing.width_cm) : null,
      height_cm: listing.height_cm != null ? cmToIn(listing.height_cm) : null,
      depth_cm: listing.depth_cm != null ? cmToIn(listing.depth_cm) : null,
      year_created: listing.year_created,
      price_dollars: listing.price_cents / 100,
      shipping_dollars: (listing.shipping_rate_cents ?? 0) / 100,
      price_visible: listing.price_visible ?? true,
      show_sold_price: listing.show_sold_price ?? false,
      sold_price_dollars: listing.sold_price_cents != null ? listing.sold_price_cents / 100 : null,
      series_id: listing.series_id ?? '',
      status: listing.status,
      tags: listing.tags?.map((t) => t.name) ?? [],
      ai_involvement: listing.ai_involvement ?? 'none',
      ai_disclosure: listing.ai_disclosure ?? '',
      // Listing Standards Part one (L4). Rows created before 00059 default to
      // original/unsigned with no condition notes; the schema requires
      // condition, so an artist editing an old listing is asked for it once.
      edition_type: listing.edition_type ?? 'original',
      edition_size: listing.edition_size ?? null,
      edition_number: listing.edition_number ?? null,
      is_signed: listing.is_signed ?? false,
      condition_notes: listing.condition_notes ?? '',
      handling_notes: listing.handling_notes ?? '',
      is_mature: listing.is_mature ?? false,
    });
  }, [listing, reset]);

  const priceVisible = watch('price_visible');
  const selectedTags = watch('tags') ?? [];
  const aiInvolvement = watch('ai_involvement');
  const editionType = watch('edition_type');
  const isSold = listing?.status === 'sold';

  if (isLoading || artistLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  // A deleted listing (PGRST116) rendered as a blank editable form, and any
  // public listing the session could read — another artist's — loaded into
  // the editor with working image controls. The API route is the real guard;
  // this is the honest surface for it.
  if (isError || !listing || listing.artist_id !== artistId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <EmptyState
          title="Listing not found"
          description="It may have been deleted, or it isn't one of yours."
          action={<Link href="/studio/work"><Button variant="outline">Back to Studio</Button></Link>}
        />
      </div>
    );
  }

  const onSubmit = async (data: ListingFormData) => {
    try {
      await updateListing.mutateAsync({
        id,
        data: {
          title: data.title,
          description: data.description || null,
          medium: data.medium,
          width_cm: toCm(data.width_cm, listing?.width_cm),
          height_cm: toCm(data.height_cm, listing?.height_cm),
          depth_cm: toCm(data.depth_cm, listing?.depth_cm),
          year_created: data.year_created ?? null,
          price_cents: toCents(data.price_dollars),
          shipping_rate_cents: isPickupOnly ? 0 : toCents(data.shipping_dollars),
          ai_involvement: data.ai_involvement,
          ai_disclosure: data.ai_involvement === 'assisted' ? (data.ai_disclosure || null) : null,
          price_visible: data.price_visible,
          show_sold_price: data.show_sold_price ?? false,
          sold_price_cents: data.sold_price_dollars != null ? toCents(data.sold_price_dollars) : null,
          series_id: data.series_id || null,
          status: data.status,
          edition_type: data.edition_type,
          edition_size: data.edition_type === 'limited_edition' ? (data.edition_size ?? null) : null,
          edition_number: data.edition_type === 'limited_edition' ? (data.edition_number ?? null) : null,
          is_signed: !!data.is_signed,
          condition_notes: data.condition_notes,
          handling_notes: data.handling_notes || null,
          is_mature: !!data.is_mature,
        },
      });
    } catch {
      // useUpdateListing toasts its own failure (toastError); nothing saved.
      return;
    }
    try {
      await setListingTags(id, data.tags ?? []);
    } catch (err) {
      // The PATCH landed; only the tag set did not. Say so — silence here
      // read as "did my price change save?".
      captureException(err, { where: 'listings/edit.setListingTags' });
      toast('Your changes were saved, but the tags could not be updated. Save again to retry.', 'error');
      return;
    }
    router.push('/studio/work');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Edit Listing</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

        {listing && (
          <>
            <PhotoTipsPanel />
            <ListingImagesManager listingId={id} images={listing.images} />
          </>
        )}

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

        {/* A sold piece stays sold or goes hidden: its order's refund is what
            puts it back on sale (the API refuses anything else while an
            order is live). Offering Available here was one click from
            reselling a piece another collector had paid for. */}
        <Select label="Status" {...register('status')} error={errors.status?.message}>
          <option value="available">Available</option>
          <option value="hidden">Hidden</option>
          <option value="commission_only">Commission Only</option>
          {isSold && <option value="sold">Sold</option>}
          {listing?.status === 'draft' && <option value="draft">Draft</option>}
        </Select>
        {isSold && (
          <p className="-mt-2 text-xs text-muted">
            A sold piece can go back on sale only once its order is refunded or
            a chargeback on it is closed; until then saving Available is refused.
          </p>
        )}
        <Button type="submit" loading={isSubmitting} className="w-full">Save Changes</Button>
      </form>
    </div>
  );
}
