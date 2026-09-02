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
import { useEffect, useState } from 'react';
import { ArtistProfile } from '@/types/artist';
import { calculateCompletenessScore } from '@/utils/completenessScore';
import { useToast } from '@/components/ui/Toast';
import { useEducation, usePersonalPhotos, useSaveEducation } from '@/hooks/useArtistContent';
import { numberOrNull } from '@/utils/formNumber';
import { ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';

export function ArtistProfileEdit() {
  const { user } = useAuth();
  const updateProfile = useUpdateArtistProfile();
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasListings, setHasListings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [educationDrafts, setEducationDrafts] = useState<EducationDraft[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('artist_profiles').select(ARTIST_PUBLIC_COLS).eq('profile_id', user.id).maybeSingle<import('@/types/artist').ArtistProfile>(),
      supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle(),
    ]).then(async ([{ data: artistData, error: artistError }, { data: profileData }]) => {
      // A transient error here used to render "Artist profile not found"
      // over a profile that exists — distinguish it and offer a retry.
      if (artistError) {
        captureException(artistError, { where: 'ArtistProfileEdit.load' });
        setLoadError(true);
        setLoading(false);
        return;
      }
      setLoadError(false);
      setArtist(artistData);
      setAvatarUrl(profileData?.avatar_url ?? null);
      if (artistData) {
        const { count } = await supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistData.id);
        setHasListings((count ?? 0) > 0);
      }
      setLoading(false);
    });
  }, [user, loadAttempt]);

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
          onClick={() => { setLoading(true); setLoadAttempt((n) => n + 1); }}
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
      setArtist((a) => (a ? { ...a, banner_image_url: url } : a));
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
        })}
        className="space-y-8"
      >
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Basics</legend>
          <Input label="Display Name" {...register('display_name')} error={errors.display_name?.message} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Bio</label>
            <textarea {...register('bio')} rows={3} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20" />
          </div>
          <Controller
            control={control}
            name="primary_mediums"
            render={({ field }) => (
              <MediumsChips value={field.value ?? []} onChange={field.onChange} />
            )}
          />
          <Input label="School" {...register('school')} />
          <Input label="Graduation Year" type="number" {...register('graduation_year', { setValueAs: numberOrNull })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Status</label>
            {/* '' must become null or the zod enum rejects an untouched "Select status". */}
            <select {...register('status', { setValueAs: (v) => (v === '' ? null : v) })} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm">
              <option value="">Select status</option>
              <option value="student">Student</option>
              <option value="recent_grad">Recent Graduate</option>
              <option value="working_artist">Working Artist</option>
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Your Story</legend>
          <div>
            <textarea
              {...register('story')}
              rows={8}
              placeholder="Tell your story. What drew you to art? What are you making right now? There are no rules here — this is your space."
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
            />
            <p className="mt-1 text-xs text-muted">Shown as &ldquo;My Story&rdquo; at the top of your profile. At least 100 characters to submit your shop for review.</p>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">About Your Work</legend>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Artist Statement</label>
            <textarea {...register('artist_statement')} rows={4} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20" />
          </div>
          <Input label="Influences" {...register('influences')} />
          <Input label="Website" {...register('website_url')} placeholder="https://" />
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
          <legend className="text-lg font-semibold text-ink">Videos</legend>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Location</legend>
          <Input label="City" {...register('city')} error={errors.city?.message} />
          <Input label="Neighborhood" {...register('neighborhood')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Fulfillment Preference</label>
            <select
              {...register('fulfillment_pref', { setValueAs: (v) => (v === '' ? null : v) })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="">Select preference</option>
              <option value="ships_national">Ships Nationally</option>
              <option value="ships_local">Ships Locally</option>
              <option value="pickup_only">Pickup Only</option>
              <option value="artist_delivered">Artist Delivered</option>
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-ink">Commissions</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('commissions_open')} className="rounded border-line" />
            <span className="text-sm text-ink">Open to commissions</span>
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Commission Description</label>
            <textarea {...register('commission_desc')} rows={3} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20" />
          </div>
          <Input label="Minimum Price ($)" type="number" step="0.01" {...register('commission_min_dollars', { setValueAs: numberOrNull })} />
          <Input label="Turnaround Time" {...register('commission_turnaround')} placeholder="e.g. 2-4 weeks" />
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
