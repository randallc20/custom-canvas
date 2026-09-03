'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { artistProfileSchema, ArtistProfileFormData } from '@/schemas/artistSchema';
import { useAuth } from '@/context/AuthContext';
import { useUpdateArtistProfile } from '@/hooks/useArtist';
import { ProfileSaveAuthError } from '@/services/artists';
import { captureException } from '@/lib/sentry';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { CompletenessBar } from '@/components/artist/CompletenessBar';
import { AvatarBannerSection } from '@/components/profile/AvatarBannerSection';
import { MediumsChips } from '@/components/profile/MediumsChips';
import { AccentPalette } from '@/components/profile/AccentPalette';
import { BioLayoutSelector } from '@/components/profile/BioLayoutSelector';
import { EducationFieldset, type EducationDraft } from '@/components/profile/EducationFieldset';
import { PersonalPhotoUploader } from '@/components/profile/PersonalPhotoUploader';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { calculateCompletenessScore } from '@/utils/completenessScore';
import { useToast } from '@/components/ui/Toast';
import { useEducation, usePersonalPhotos, useSaveEducation } from '@/hooks/useArtistContent';
import { numberOrNull } from '@/utils/formNumber';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';

export function ArtistProfileEdit() {
  const { user } = useAuth();
  const updateProfile = useUpdateArtistProfile();
  // One shared, cached read of the own-artist row (00033's granted columns),
  // not a seventh hand-rolled copy of it.
  const { artist, loading, isError: loadError, refetch } = useOwnArtistProfile();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasListings, setHasListings] = useState(false);
  const [educationDrafts, setEducationDrafts] = useState<EducationDraft[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const { data: educationData } = useEducation(artist?.id ?? '');
  const saveEducationMutation = useSaveEducation();
  const { data: photos = [] } = usePersonalPhotos(artist?.id ?? '');

  const { register, handleSubmit, watch, control, formState: { errors, isSubmitting } } = useForm<ArtistProfileFormData>({
    resolver: zodResolver(artistProfileSchema),
    values: artist ? {
      display_name: artist.display_name,
      bio: artist.bio ?? '',
      artist_statement: artist.artist_statement ?? '',
      story: artist.story ?? '',
      primary_mediums: artist.primary_mediums ?? [],
      influences: artist.influences ?? '',
      school: artist.school ?? '',
      graduation_year: artist.graduation_year,
      status: artist.status,
      neighborhood: artist.neighborhood ?? '',
      city: artist.city,
      website_url: artist.website_url ?? '',
      fulfillment_pref: artist.fulfillment_pref,
      commissions_open: artist.commissions_open,
      commission_desc: artist.commission_desc ?? '',
      commission_min_dollars: artist.commission_min_cents != null ? artist.commission_min_cents / 100 : null,
      commission_turnaround: artist.commission_turnaround ?? '',
      accent_color: artist.accent_color,
      bio_layout: artist.bio_layout,
    } : undefined,
  });

  // avatar_url lives on profiles, not artist_profiles, so it stays its own
  // read; the listing count only feeds the local completeness bar.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) captureException(error, { where: 'ArtistProfileEdit.avatarLoad' });
        if (!cancelled) setAvatarUrl(data?.avatar_url ?? null);
      });
    return () => { cancelled = true; };
  }, [user]);

  const artistId = artist?.id;
  useEffect(() => {
    if (!artistId) return;
    let cancelled = false;
    void supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .then(({ count }) => { if (!cancelled) setHasListings((count ?? 0) > 0); });
    return () => { cancelled = true; };
  }, [artistId]);

  useEffect(() => {
    if (educationData) setEducationDrafts(educationData);
  }, [educationData]);

  const watched = watch();
  const score = calculateCompletenessScore({
    ...watched,
    primary_mediums: watched.primary_mediums ?? [],
    banner_image_url: artist?.banner_image_url ?? null,
    stripe_onboarded: artist?.stripe_onboarded ?? false,
    avatar_url: avatarUrl,
    has_listings: hasListings,
    has_education: educationDrafts.some((e) => e.institution.trim()),
    has_personal_photo: photos.length > 0,
  });

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted">Couldn&apos;t load your profile — this is usually momentary.</p>
        <Button
          type="button"
          className="mt-4"
          onClick={() => refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!artist) return <p className="py-16 text-center text-muted">Artist profile not found.</p>;

  const handleAvatarUploaded = async (url: string) => {
    if (!user) return;
    // .select('id').maybeSingle(): a zero-row update (RLS refusal) must fail
    // visibly, not preview an avatar that never saved.
    const { data: updated, error } = await supabase
      .from('profiles').update({ avatar_url: url }).eq('id', user.id).select('id').maybeSingle();
    if (error || !updated) { captureException(error ?? new Error('avatar save matched zero rows'), { where: 'ArtistProfileEdit.avatar' }); toast('Failed to save profile photo', 'error'); }
    else {
      setAvatarUrl(url);
      toast('Profile photo updated', 'success');
      supabase.rpc('refresh_completeness_score', { p_artist_id: artist.id });
      queryClient.invalidateQueries({ queryKey: ['own-artist-profile'] }); // checklist row
    }
  };

  const handleBannerUploaded = async (url: string) => {
    const { data: updated, error } = await supabase
      .from('artist_profiles').update({ banner_image_url: url }).eq('id', artist.id).select('id').maybeSingle();
    if (error || !updated) { captureException(error ?? new Error('banner save matched zero rows'), { where: 'ArtistProfileEdit.banner' }); toast('Failed to save banner', 'error'); }
    else {
      toast('Banner updated', 'success');
      supabase.rpc('refresh_completeness_score', { p_artist_id: artist.id });
      queryClient.invalidateQueries({ queryKey: ['own-artist-profile'] }); // checklist row
    }
  };

  const onSubmit = async (data: ArtistProfileFormData) => {
    const entries = educationDrafts.filter((e) => e.institution.trim());
    const educationChanged =
      JSON.stringify(entries.map((e) => [e.institution, e.degree, e.field_of_study, e.start_year, e.end_year, e.is_current])) !==
      JSON.stringify((educationData ?? []).map((e) => [e.institution, e.degree, e.field_of_study, e.start_year, e.end_year, e.is_current]));
    if (educationChanged) {
      try {
        await saveEducationMutation.mutateAsync({ artistId: artist.id, entries });
      } catch (err) {
        captureException(err, { where: 'ArtistProfileEdit.saveEducation' });
        toast('Couldn’t save your Education & Training entries — the rest of the profile was not touched. Try again.', 'error');
        return;
      }
    }
    try {
      const { commission_min_dollars, ...rest } = data;
      await updateProfile.mutateAsync({
        id: artist.id,
        data: {
          ...rest,
          // '' is "no website"; the column's CHECK (00052) accepts NULL or http(s).
          website_url: rest.website_url || null,
          commission_min_cents:
            commission_min_dollars != null ? Math.round(commission_min_dollars * 100) : null,
        },
      });
      // Canonical score is computed server-side from actual data.
      await supabase.rpc('refresh_completeness_score', { p_artist_id: artist.id });
      toast('Profile updated successfully!', 'success');
    } catch (err) {
      captureException(err, { where: 'ArtistProfileEdit.onSubmit' });
      if (err instanceof ProfileSaveAuthError) {
        toast('Couldn’t verify it’s you — refresh this page and save again.', 'error');
      } else {
        const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
        toast(`Failed to update profile${detail}. Please try again.`, 'error');
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Your Public Page</h1>
        <a href={`/artist/${artist.slug}?preview=1`} target="_blank" rel="noopener noreferrer">
          <Button type="button">Preview as visitor</Button>
        </a>
      </div>
      <div className="mb-6">
        <CompletenessBar score={score} />
      </div>

      <div className="mb-8 rounded-xl border border-line bg-surface p-4">
        <AvatarBannerSection
          avatarUrl={avatarUrl}
          bannerUrl={artist.banner_image_url}
          displayName={artist.display_name}
          onAvatarUploaded={handleAvatarUploaded}
          onBannerUploaded={handleBannerUploaded}
        />
      </div>

      <form
        onSubmit={handleSubmit(onSubmit, (errs) => {
          // This page is long enough that an invalid field can be far offscreen;
          // silently doing nothing reads as a broken Save button. Name the field
          // by its VISIBLE label, not its schema key.
          const labels: Record<string, string> = {
            display_name: 'Display Name', bio: 'Bio', school: 'School',
            graduation_year: 'Graduation Year', artist_statement: 'Artist Statement',
            influences: 'Influences', website_url: 'Website', city: 'City',
            neighborhood: 'Neighborhood', fulfillment_pref: 'Fulfillment Preference',
            commission_desc: 'Commission Description', commission_min_dollars: 'Minimum Price',
            commission_turnaround: 'Turnaround Time', accent_color: 'Accent Color',
            status: 'Status', story: 'Your Story', primary_mediums: 'Mediums',
          };
          const first = Object.keys(errs)[0];
          toast(
            first
              ? `Check the "${labels[first] ?? first.replace(/_/g, ' ')}" field — it needs fixing before this can save.`
              : 'Something on this page needs fixing before it can save.',
            'error'
          );
          // The toast alone left the artist staring at a Save button that did
          // nothing: take them to the field and put the caret in it.
          if (first) {
            const control = formRef.current?.querySelector<HTMLElement>(
              `[name="${CSS.escape(first)}"]`
            );
            control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            control?.focus({ preventScroll: true });
          }
        })}
        ref={formRef}
        className="space-y-8"
      >
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Basics</legend>
          <Input label="Display Name" {...register('display_name')} error={errors.display_name?.message} />
          <Textarea label="Bio" rows={3} {...register('bio')} error={errors.bio?.message} />
          <Controller
            control={control}
            name="primary_mediums"
            render={({ field }) => (
              <MediumsChips value={field.value ?? []} onChange={field.onChange} />
            )}
          />
          <Input label="School" {...register('school')} error={errors.school?.message} />
          <Input label="Graduation Year" type="number" {...register('graduation_year', { setValueAs: numberOrNull })} error={errors.graduation_year?.message} />
          {/* '' must become null or the zod enum rejects an untouched "Select status". */}
          <Select
            label="Status"
            {...register('status', { setValueAs: (v) => (v === '' ? null : v) })}
            error={errors.status?.message}
          >
            <option value="">Select status</option>
            <option value="student">Student</option>
            <option value="recent_grad">Recent Graduate</option>
            <option value="working_artist">Working Artist</option>
          </Select>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Your Story</legend>
          <Textarea
            label="Your Story"
            hideLabel
            rows={8}
            placeholder="Tell your story. What drew you to art? What are you making right now? There are no rules here — this is your space."
            hint="Shown as &ldquo;My Story&rdquo; at the top of your profile. At least 100 characters to submit your shop for review."
            {...register('story')}
            error={errors.story?.message}
          />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">About Your Work</legend>
          <Textarea label="Artist Statement" rows={4} {...register('artist_statement')} error={errors.artist_statement?.message} />
          <Input label="Influences" {...register('influences')} error={errors.influences?.message} />
          <Input label="Website" {...register('website_url')} placeholder="https://" error={errors.website_url?.message} />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Education &amp; Training</legend>
          <EducationFieldset entries={educationDrafts} onChange={setEducationDrafts} />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Meet the Artist — Photos</legend>
          <PersonalPhotoUploader artistId={artist.id} />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Location</legend>
          <Input label="City" {...register('city')} error={errors.city?.message} />
          <Input label="Neighborhood" {...register('neighborhood')} error={errors.neighborhood?.message} />
          <Select
            label="Fulfillment Preference"
            {...register('fulfillment_pref', { setValueAs: (v) => (v === '' ? null : v) })}
            error={errors.fulfillment_pref?.message}
          >
            <option value="">Select preference</option>
            <option value="ships_national">Ships Nationally</option>
            <option value="ships_local">Ships Locally</option>
            <option value="pickup_only">Pickup Only</option>
            <option value="artist_delivered">Artist Delivered</option>
          </Select>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Commissions</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('commissions_open')} className="rounded border-line" />
            <span className="text-sm text-ink">Open to commissions</span>
          </label>
          <Textarea label="Commission Description" rows={3} {...register('commission_desc')} error={errors.commission_desc?.message} />
          <Input label="Minimum Price ($)" type="number" step="0.01" {...register('commission_min_dollars', { setValueAs: numberOrNull })} error={errors.commission_min_dollars?.message} />
          <Input label="Turnaround Time" {...register('commission_turnaround')} placeholder="e.g. 2-4 weeks" error={errors.commission_turnaround?.message} />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Customization</legend>
          <Controller
            control={control}
            name="accent_color"
            render={({ field }) => <AccentPalette value={field.value} onChange={field.onChange} />}
          />
          <Controller
            control={control}
            name="bio_layout"
            render={({ field }) => <BioLayoutSelector value={field.value} onChange={field.onChange} />}
          />
        </fieldset>

        <Button type="submit" loading={isSubmitting} className="w-full">Save Changes</Button>
      </form>
    </div>
  );
}
